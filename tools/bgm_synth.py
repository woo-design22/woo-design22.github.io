# 도트 RPG 여섯 형제의 배경음악을 mp3 에서 「웹오디오 합성」으로 갈아 끼운다.
#
# 왜: 판매용 데모(love·retire·goth)가 남의 곡을 싣고 있었다. 상품에 넣어 파는 것은
#     영상에 쓰는 것과 조건이 다르다. 덤으로 게임마다 5.1MB 씩 지고 다니던 짐이 0 이 되고,
#     file:// 에서도 받아올 파일이 없어 첫 소리가 바로 난다.
#
# 어떻게: 음색은 lucky-day 처럼 버퍼에 미리 구워 두고 쏘고(음마다 만들면 렉),
#         걸음 예약은 sand-mix 를 따랐다. 게임의 표정은 BGM_MOOD 상수 하나로만 갈린다.
#
# 사용법: python tools/bgm_synth.py            (전부)
#         python tools/bgm_synth.py love-rpg   (하나만)
import re, sys, os, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- 게임마다 다른 것은 이 표가 전부다 ----------------------------------
# root  : 으뜸음(Hz).  prog : 화음 진행(반음, 으뜸음 기준).  mel : 32걸음 가락(None = 쉼).
MOODS = {
    'love-rpg': dict(   # 봄날, 두 사람 — 밝고 따뜻하게
        key='lv_bgm', root=261.63, bpm=68, decay=3.0, pad=0.055,
        prog=[[0,4,7],[7,11,14],[9,12,16],[5,9,12]],
        mel=[12,None,14,None, 16,None,14,12, 11,None,12,None, 9,None,None,None,
             7,None,9,None, 11,None,12,None, 16,None,14,None, 12,None,None,None]),
    'couple-rpg': dict( # 철우와 수지 — 같은 따뜻함, 조금 더 느리게
        key='cs_bgm', root=246.94, bpm=64, decay=2.9, pad=0.06,
        prog=[[9,12,16],[5,9,12],[0,4,7],[7,11,14]],
        mel=[16,None,14,None, 12,None,None,11, 12,None,14,None, 9,None,None,None,
             11,None,12,None, 14,None,16,None, 12,None,11,None, 9,None,None,None]),
    'namsan-rpg': dict( # 남산중 6인방 — 학창시절, 조금 들뜨게
        key='namsan_bgm', root=293.66, bpm=74, decay=3.2, pad=0.05,
        prog=[[0,4,7],[9,12,16],[5,9,12],[7,11,14]],
        mel=[12,None,12,14, 16,None,None,14, 12,None,9,None, 7,None,None,None,
             9,None,11,None, 12,None,14,None, 16,None,14,12, 11,None,None,None]),
    'europe-rpg': dict( # 우리가족 유럽여행 — 환하게
        key='eu_bgm', root=277.18, bpm=76, decay=3.3, pad=0.05,
        prog=[[0,4,7],[5,9,12],[7,11,14],[0,4,7]],
        mel=[16,None,14,12, 14,None,None,None, 12,None,11,9, 11,None,None,None,
             14,None,16,None, 19,None,16,None, 14,None,12,None, 11,None,None,None]),
    'retire-rpg': dict( # 아버지의 정복 — 낮고 쓸쓸하게 (단조)
        key='rt_bgm', root=220.00, bpm=56, decay=2.4, pad=0.07,
        prog=[[0,3,7],[8,12,15],[3,7,10],[7,10,14]],
        mel=[12,None,None,10, 7,None,None,None, 8,None,7,None, 3,None,None,None,
             7,None,10,None, 12,None,None,10, 7,None,3,None, 0,None,None,None]),
    'goth-rpg': dict(   # 고트전설 — 장중하게 (단조, 느리게)
        key='gt_bgm', root=196.00, bpm=60, decay=2.2, pad=0.075,
        prog=[[0,3,7],[10,14,17],[8,12,15],[10,14,17]],
        mel=[12,None,None,None, 15,None,14,12, 10,None,None,8, 7,None,None,None,
             10,None,12,None, 15,None,17,None, 14,None,12,None, 10,None,None,None]),
    # 여기서 내려요 — 서른네 해 동안 벨을 번갈아 누른 이야기. 되풀이가 주제라
    # 화음도 네 마디마다 제자리로 돌아오고, 가락도 앞 두 마디를 그대로 되풀이한다.
    # 이 게임에는 원래 배경음악 코드가 없었다(mp3 만 있고 아무도 안 썼다) — anchor 자리에 새로 넣는다.
    'bell-rpg': dict(
        key='bl_bgm', root=207.65, bpm=60, decay=2.7, pad=0.065,
        anchor='// ===== 엔딩 =====',
        prog=[[0,4,7],[9,12,16],[5,9,12],[0,4,7]],
        mel=[7,None,9,None, 12,None,None,None, 7,None,9,None, 4,None,None,None,
             12,None,11,None, 9,None,7,None, 9,None,7,None, 4,None,None,None]),
    'trace-rpg': dict(  # 차분하게
        key='tr_bgm', root=233.08, bpm=66, decay=2.8, pad=0.06,
        prog=[[0,3,7],[5,8,12],[10,14,17],[7,10,14]],
        mel=[12,None,10,None, 7,None,None,8, 10,None,12,None, 7,None,None,None,
             15,None,14,None, 12,None,10,None, 8,None,7,None, 3,None,None,None]),
}


def js_arr(v):
    """파이썬 리스트를 자바스크립트 리터럴로. None -> null."""
    if v is None:
        return 'null'
    if isinstance(v, list):
        return '[' + ', '.join(js_arr(x) for x in v) + ']'
    return repr(v)


def wrap(nums, per):
    """가락을 한 줄에 per 개씩 끊어 읽기 좋게 늘어놓는다."""
    out, ind = [], ' ' * 8
    for i in range(0, len(nums), per):
        out.append(', '.join(js_arr(x) for x in nums[i:i + per]))
    return (',\n' + ind).join(out)


def block(m, with_sfx):
    mel = wrap(m['mel'], 8)
    prog = js_arr(m['prog'])
    sfx = SFX if with_sfx else ''
    return TEMPLATE.format(key=m['key'], root=m['root'], bpm=m['bpm'],
                           decay=m['decay'], pad=m['pad'], prog=prog, mel=mel, sfx=sfx)


SFX = '''
// ----- 효과음: 미니게임용. 배경음악과 같은 문맥을 쓴다(문맥을 둘 만들면 브라우저가 막는다).
//   함수 선언이라 위쪽 미니게임에서도 부를 수 있다.
function sfxTone(t0, freq, freq2, type, vol, dur) {{
  const o = sndCtx.createOscillator(), g = sndCtx.createGain();
  o.connect(g); g.connect(sndCtx.destination);
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t0 + dur * 0.7);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.02);
}}
function sfx(kind) {{
  if (!bgmOn) return;                       // 소리를 끈 상태면 효과음도 내지 않는다
  try {{
    if (!audioCtx()) return;
    const t = sndCtx.currentTime;
    if (kind === 'hit') sfxTone(t, 880, 1320, 'triangle', 0.16, 0.16);
    else if (kind === 'miss') sfxTone(t, 190, 90, 'sawtooth', 0.13, 0.20);
    else if (kind === 'tick') sfxTone(t, 1250, 0, 'square', 0.04, 0.04);
    else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => sfxTone(t + i * 0.09, f, 0, 'triangle', 0.15, 0.22));
  }} catch (e) {{ /* 소리가 안 나도 게임은 그대로 돌아간다 */ }}
}}
'''

TEMPLATE = '''// ----- 소리: 배경음악도 효과음도 음원 파일 없이 웹오디오로 그 자리에서 만든다 -----
//   mp3 두 개(5.1MB)가 있던 자리다. 남의 곡을 상품에 싣지 않으려는 것이 첫 이유고,
//   덤으로 받아올 파일이 없어져 file:// 에서도 첫 소리가 바로 난다.
//   음색은 lucky-day 처럼 버퍼에 미리 구워 두고 쏘고(음마다 만들면 렉), 걸음 예약은 sand-mix 를 따랐다.

// 이 게임의 표정. 도트 RPG 형제들은 이 상수만 서로 다르다.
const BGM_MOOD = {{
  root: {root},                       // 으뜸음(Hz)
  bpm: {bpm},
  decay: {decay},                     // 클수록 빨리 잦아든다
  pad: {pad},                         // 화음을 옅게 깔아 두는 층의 크기
  prog: {prog},   // 화음 진행(반음, 으뜸음 기준). 네 마디가 한 도막.
  mel: [{mel}]
}};
const BGM_ARP = [0, null, 1, 2, null, 1, 2, 1];   // 한 마디(8걸음) 안에서 화음의 몇 번째 음을 짚을지

let sndCtx = null;                                // 배경음악·효과음이 함께 쓰는 하나뿐인 문맥
let bgmOn = store.get('{key}', true), bgmStarted = false;
let bgmMaster = null, bgmPadG = null, bgmPadOsc = [], bgmAna = null;
let bgmTimer = 0, bgmStep = 0, bgmNext = 0;
const bgmBuf = {{}};

// 오디오 문맥은 사용자 조작 뒤에만 열린다. 이미 열려 있으면 그대로 돌려준다.
function audioCtx() {{
  try {{
    if (!sndCtx) {{ const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; sndCtx = new C(); }}
    if (sndCtx.state === 'suspended') sndCtx.resume();
    return sndCtx;
  }} catch (e) {{ return null; }}
}}

// 한 음을 통째로 구워 둔다. 배음마다 사그라지는 속도가 달라야(높은 쪽이 먼저 죽어야)
// 오르간이 아니라 두드린 현으로 들린다. 앞머리의 아주 짧은 잡음이 「때리는 소리」다.
function bgmBake(freq, dur, decay) {{
  const sr = sndCtx.sampleRate, n = Math.round(sr * dur);
  const b = sndCtx.createBuffer(1, n, sr), d = b.getChannelData(0);
  const PART = [[1, 1, 1], [2, 0.40, 1.7], [3, 0.17, 2.4], [4.02, 0.08, 3.3]];
  for (let i = 0; i < n; i++) {{
    const t = i / sr; let v = 0;
    for (let p = 0; p < PART.length; p++) v += PART[p][1] * Math.sin(6.283185307 * freq * PART[p][0] * t) * Math.exp(-decay * PART[p][2] * t);
    d[i] = v;
  }}
  const atk = Math.round(sr * 0.005);
  for (let i = 0; i < atk; i++) d[i] += (Math.random() * 2 - 1) * 0.10 * (1 - i / atk);
  const ramp = Math.round(sr * 0.0015);                       // 시작을 눕혀 「딱」 소리를 없앤다
  for (let i = 0; i < ramp; i++) d[i] *= i / ramp;
  const tail = Math.round(sr * 0.08);                         // 끝도 부드럽게 닫는다
  for (let i = 0; i < tail; i++) d[n - 1 - i] *= i / tail;
  return b;
}}
function bgmNote(semi, dur, decay) {{
  const k = semi + '/' + dur;
  if (!bgmBuf[k]) bgmBuf[k] = bgmBake(BGM_MOOD.root * Math.pow(2, semi / 12), dur, decay);
  return bgmBuf[k];
}}
function bgmFire(buf, at, vol) {{
  const s = sndCtx.createBufferSource(); s.buffer = buf;
  const g = sndCtx.createGain(); g.gain.value = vol;
  s.connect(g); g.connect(bgmMaster); s.start(at);
}}

function bgmBuild() {{
  bgmMaster = sndCtx.createGain(); bgmMaster.gain.value = 0.85;
  // 겹친 음이 찌그러지지 않게 마지막에 리미터를 둔다. 분석기는 검증용(소리를 못 들으니 숫자로 본다).
  const comp = sndCtx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5;
  comp.attack.value = 0.005; comp.release.value = 0.25;
  bgmAna = sndCtx.createAnalyser(); bgmAna.fftSize = 2048;
  bgmMaster.connect(comp); comp.connect(bgmAna); bgmAna.connect(sndCtx.destination);
  // 음 사이의 빈 자리를 메우는 옅은 층
  bgmPadG = sndCtx.createGain(); bgmPadG.gain.value = 0;
  const lp = sndCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  bgmPadG.connect(lp); lp.connect(bgmMaster);
  bgmPadOsc = [0, 1, 2].map(() => {{
    const o = sndCtx.createOscillator(); o.type = 'triangle';
    o.frequency.value = BGM_MOOD.root; o.connect(bgmPadG); o.start(); return o;
  }});
  // 쓰일 음을 미리 다 구워 둔다 — 연주 도중에 구우면 그 순간 소리가 끊긴다
  BGM_MOOD.prog.forEach(c => {{
    bgmNote(c[0] - 12, 3.2, BGM_MOOD.decay * 0.6);
    c.forEach(s => bgmNote(s, 2.2, BGM_MOOD.decay * 1.15));
  }});
  BGM_MOOD.mel.forEach(s => {{ if (s !== null) bgmNote(s, 2.6, BGM_MOOD.decay); }});
}}

// 앞질러 예약해 둔다. 탭이 가려져 밀렸을 때 지나간 시각으로 예약하면
// 그 음들이 한꺼번에 터지므로, 밀렸으면 지금으로 당기고 한 번에 잡는 걸음 수도 막는다.
function bgmTick() {{
  if (!sndCtx || !bgmOn || !bgmMaster) return;
  const STEP = 60 / BGM_MOOD.bpm / 2, now = sndCtx.currentTime;
  if (bgmNext < now) bgmNext = now + 0.05;
  let guard = 0;
  while (bgmNext < now + 0.4 && guard++ < 8) {{
    const bars = BGM_MOOD.prog.length, i = bgmStep % (bars * 8);
    const chord = BGM_MOOD.prog[Math.floor(i / 8)], inBar = i % 8;
    if (inBar === 0) {{                                        // 마디 첫걸음: 낮은 뿌리음 + 화음 층
      bgmFire(bgmNote(chord[0] - 12, 3.2, BGM_MOOD.decay * 0.6), bgmNext, 0.30);
      bgmPadOsc.forEach((o, k) => o.frequency.setTargetAtTime(
        BGM_MOOD.root * Math.pow(2, (chord[k % chord.length] - 12) / 12), bgmNext, 0.30));
      bgmPadG.gain.setTargetAtTime(BGM_MOOD.pad, bgmNext, 0.5);
    }}
    const a = BGM_ARP[inBar];
    if (a !== null) bgmFire(bgmNote(chord[a % chord.length], 2.2, BGM_MOOD.decay * 1.15), bgmNext, 0.12);
    const m = BGM_MOOD.mel[bgmStep % BGM_MOOD.mel.length];
    if (m !== null && m !== undefined) bgmFire(bgmNote(m, 2.6, BGM_MOOD.decay), bgmNext, 0.19);
    bgmNext += STEP; bgmStep++;
  }}
}}

function bgmBtn() {{ $('btnBgm').textContent = bgmOn ? '\\ud83d\\udd0a' : '\\ud83d\\udd07'; }}
function bgmPlay() {{
  if (!bgmOn || !audioCtx()) return;
  try {{
    if (!bgmMaster) bgmBuild();
    if (!bgmTimer) {{ bgmNext = sndCtx.currentTime + 0.12; bgmTimer = setInterval(bgmTick, 120); }}
    bgmStarted = true;
  }} catch (e) {{ /* 소리가 안 나도 게임은 그대로 돌아간다 */ }}
}}
function bgmHalt() {{
  if (bgmTimer) {{ clearInterval(bgmTimer); bgmTimer = 0; }}
  if (bgmPadG && sndCtx) bgmPadG.gain.setTargetAtTime(0, sndCtx.currentTime, 0.15);
}}
// 브라우저는 사용자 조작 중에만 첫 소리를 허용한다. 한 번 실패하고 포기하면
// "껐다 켜야 소리가 난다"가 되므로, 실제로 울릴 때까지 조작마다 다시 시도한다.
function bgmNudge() {{ if (bgmOn && !bgmTimer) bgmPlay(); }}
['pointerdown', 'pointerup', 'touchend', 'keydown'].forEach(ev => window.addEventListener(ev, bgmNudge, true));
$('btnBgm').addEventListener('click', e => {{
  e.stopPropagation();
  bgmOn = !bgmOn; store.set('{key}', bgmOn); bgmBtn();
  if (bgmOn) bgmPlay(); else bgmHalt();
}});
document.addEventListener('visibilitychange', () => {{ if (document.hidden) bgmHalt(); else if (bgmOn && bgmStarted) bgmPlay(); }});
// 검증용: 소리를 들을 수 없으니 실제 출력 레벨을 숫자로 낸다.
function bgmProbe() {{
  if (!bgmAna) return {{ built: false, on: bgmOn, running: !!bgmTimer }};
  const a = new Float32Array(2048); bgmAna.getFloatTimeDomainData(a);
  let s = 0, pk = 0;
  for (let i = 0; i < a.length; i++) {{ s += a[i] * a[i]; if (Math.abs(a[i]) > pk) pk = Math.abs(a[i]); }}
  return {{ built: true, on: bgmOn, running: !!bgmTimer, step: bgmStep,
           rms: +Math.sqrt(s / a.length).toFixed(4), peak: +pk.toFixed(4), baked: Object.keys(bgmBuf).length }};
}}
{sfx}bgmBtn();'''


def patch(game):
    path = os.path.join(ROOT, game, 'index.html')
    src = io.open(path, encoding='utf-8').read()
    lines = src.split('\n')

    # 시작: 'const BGM_LIST' 바로 위의 '// ----- 배경음악' 주석줄부터
    i = next((n for n, l in enumerate(lines) if l.startswith('const BGM_LIST')), None)
    if i is None:
        # 옛 mp3 재생기가 아예 없는 게임(bell-rpg)은 갈아 끼우는 게 아니라 새로 넣는다.
        anchor = MOODS[game].get('anchor')
        if not anchor:
            return game, 'BGM_LIST 도 anchor 도 없음 — 건너뜀'
        a = next((n for n, l in enumerate(lines) if l.startswith(anchor)), None)
        if a is None:
            return game, '자리표 「%s」를 못 찾음 — 건너뜀' % anchor
        start, end = a, a - 1          # 빈 범위 = 지우지 않고 이 앞에 끼워 넣기
    else:
        start = i - 1 if lines[i - 1].startswith('// ----- 배경음악') else i
        end = next((n for n, l in enumerate(lines) if l.strip() == 'bgmBtn();'), None)
        if end is None:
            return game, 'bgmBtn(); 없음 — 건너뜀'
        if end <= start:
            return game, '범위가 뒤집힘 — 건너뜀'

    # 정의가 아니라 「부르는가」로 판정한다 — bell-rpg 는 정의 없이 부르기만 해서
    # 미니게임마다 ReferenceError 가 나던 상태였다. 부르는 게임이면 정의를 함께 낸다.
    with_sfx = re.search(r'\bsfx\(', src) is not None
    new = block(MOODS[game], with_sfx)
    out = '\n'.join(lines[:start] + new.split('\n') + lines[end + 1:])

    # 옛 mp3 재생기를 가리키던 것이 남았는지 확인 — 남으면 조용히 깨진다
    # ?debug=1 훅에 소리 검증용을 얹는다 — 들을 수 없으니 숫자로 봐야 한다
    out = out.replace('window.NS = {', 'window.NS = { bgmProbe, bgmPlay, sfx,', 1)

    leftovers = []
    for pat in (r'\bbgm\.', r'\bBGM_LIST\b', r'\bsfxCtx\b', r'\bbgmIdx\b'):
        if re.search(pat, out):
            leftovers.append(pat)

    io.open(path, 'w', encoding='utf-8', newline='\n').write(out)
    removed = end - start + 1
    note = '  남은참조: ' + ', '.join(leftovers) if leftovers else ''
    return game, 'sfx %s / %d줄 -> %d줄%s' % ('포함' if with_sfx else '없음', removed, len(new.split('\n')), note)


if __name__ == '__main__':
    targets = sys.argv[1:] or list(MOODS)
    for g in targets:
        if g not in MOODS:
            print('%-12s 표에 없음' % g); continue
        name, msg = patch(g)
        print('%-12s %s' % (name, msg))
