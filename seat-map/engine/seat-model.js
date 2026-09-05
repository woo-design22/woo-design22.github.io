/* seat-model.js — 「앉을 자리」 착석 확률 모델 (사양서 5장).
   브라우저에서는 window.SeatModel, Node에서는 module.exports 로 같은 코드가 돈다.
   의존: 없음. DOM·네트워크·Date 참조 금지 — 같은 입력이면 어디서 돌려도 같은 값이 나와야 한다
   (사양서 M2-4: "노드/브라우저 양쪽에서 도는 순수 함수").

   이 파일이 이 프로젝트의 핵심 자산이다. 사양서 5장의 식을 그대로 옮기되,
   식 자체에 없던 것 두 가지를 더 얹었다. 둘 다 DECISIONS.md 에 근거를 적어 두었다.
   ① 승차 확률과 도중 착석 확률을 합친 「이 여정에서 앉을 확률」(pSeated)
      — 사양서의 P_board·P_trip 은 각각이고, 사용자가 궁금한 건 둘을 합친 값이다.
   ② 재차인원의 분산을 받는 판(rideSpread)
      — T-DATA 가 평균과 최대를 둘 다 주므로(사양서 4.2) 그 정보를 버리지 않으려는 것.
        "8대 중 3대는 만원"이 평균만 쓰면 사라진다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeatModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 차종 제원 ────────────────────────────────────────────────────────────
  // seats = 실제 좌석수(좌석 배치도가 이 수만큼 격자를 그린다 — 사양서 7.5),
  // capacity = 혼잡도 100% 의 기준이 되는 정원, standing = 입석 가능 여부.
  // 지하철은 54/160 = 33.75% ≈ 34% 라 사양서 4.1 의 "좌석이 모두 찬 상태가 34%"와 맞는다.
  // 이 두 값을 따로 고치면 34% 임계값이 깨진다 — 반드시 같이 본다.
  var VEHICLES = {
    subwayCar:  { name: '지하철 1칸', seats: 54, capacity: 160, standing: true },
    busTrunk:   { name: '간선버스',   seats: 23, capacity: 45,  standing: true },
    busBranch:  { name: '지선버스',   seats: 23, capacity: 45,  standing: true },
    busVillage: { name: '마을버스',   seats: 15, capacity: 30,  standing: true },
    busExpress: { name: '광역버스',   seats: 41, capacity: 41,  standing: false }
  };

  var SEAT_RATIO_SUBWAY = 0.34;   // 지하철 혼잡도 34% = 좌석 만석 (사양서 4.1)
  var ALPHA_DEFAULT = 0.55;       // 경쟁 계수 (사양서 5.2). 피드백 루프가 노선·시간대별로 덮어쓴다
  var K_RATIO = 0.11;             // 로지스틱 기울기 계수 k = 좌석수 × 0.11 (사양서 5.1)
  var P_STOP_CAP = 0.92;          // 한 정거장에서 앉을 확률의 상한 (사양서 5.2)

  function vehicleOf(v) {
    if (typeof v === 'string') {
      if (!VEHICLES[v]) throw new Error('모르는 차종: ' + v);
      return VEHICLES[v];
    }
    return v;   // {seats, capacity, standing} 을 직접 넘긴 경우
  }

  // ── 혼잡도 ↔ 재차인원 ────────────────────────────────────────────────────
  function loadFromCongestion(pct, capacity) { return pct / 100 * capacity; }
  function congestionFromLoad(load, capacity) { return load / capacity * 100; }

  /* 빈 좌석 수. 사양서 7.3 "혼잡도 76%" 대신 "23자리 가운데 4자리 비어 있습니다"의 그 값이다.
     소수로 두면 화면에 "3.7자리"가 나오므로 여기서 반올림해 정수로 못 박는다. */
  function emptySeats(load, seats) { return Math.max(0, Math.round(seats - load)); }

  /* 서 있는 사람 수. 0 이면 나눗셈이 터지므로 1 로 막는다 (사양서 5.2). */
  function standingCount(load, seats) { return Math.max(1, load - seats); }

  // ── 5.1 승차 즉시 착석 확률 ──────────────────────────────────────────────
  /* P_board = 1 / (1 + exp((재차인원 - 좌석수) / k)),  k = 좌석수 × 0.11
     재차인원 = 좌석수일 때 정확히 0.5. */
  function pBoard(load, seats, kRatio) {
    var k = seats * (kRatio === undefined ? K_RATIO : kRatio);
    if (k <= 0) return load < seats ? 1 : 0;
    return 1 / (1 + Math.exp((load - seats) / k));
  }

  /* 광역버스는 입석 금지라 잔여좌석 유무가 곧 탑승 가능 여부다 (사양서 5.1).
     P = 1 / (1 + exp(-(잔여좌석 - 1) / 1.2))
     주의: 잔여좌석 0 에서도 0 이 아니라 0.30 이 나온다. 실시간 잔여좌석 자체가
     예측치라서 일부러 그렇게 뒀다(사양서 식 그대로). 0 을 원하면 식이 아니라
     "탑승 불가" 판정을 따로 둬야 한다 — DECISIONS.md D-07. */
  function pBoardExpress(freeSeats) {
    return 1 / (1 + Math.exp(-(freeSeats - 1) / 1.2));
  }

  // ── 5.2 가는 도중 착석 확률 ──────────────────────────────────────────────
  /* 한 정거장에서 앉게 될 확률.
     하차인원 × α / 서있는승객수, 상한 0.92. */
  function pSitAtStop(alight, load, seats, alpha, boarding) {
    var a = alpha === undefined ? ALPHA_DEFAULT : alpha;
    /* ★ 자리는 차가 **비워질 때** 난다 — 하차가 아니라 순하차(하차−승차)다 (D-72) ★

       처음엔 하차 수 그대로를 자리로 셌고(D-59 에서 타는 사람을 분모에 더하는 손질까지 했지만),
       실사용 후기가 그 판을 뒤집었다. 100번 버스: 길음역·돈암에서 하차 실측이 커서 모델은
       「미아리고개쯤부터 대개 앉는다」고 말했는데, 나무위키 실사용 후기는 「출퇴근 시
       **동소문로에서 입석은 기본**, 심하면 도착할 때까지 서서」 — 바로 그 구간이다.

       왜 어긋났나: 그 하차는 대부분 지하철로 갈아타는 **서서 가던 단거리 승객**이다.
       그들이 내려도 좌석은 안 빈다. 게다가 내린 만큼 새로 탄다(우리 OD 재차도 25→25→22→22 로
       순감소가 거의 0 — 갈아타기 회전문이지 비워지는 게 아니다).

       그래서 자리의 근거를 **순하차 = max(0, 하차 − 승차)** 로 잡는다. 차가 실제로 비워지는
       곳(6호선 이태원·한강진, 100번은 도심 하차 시작점)에서만 자리가 난다 — 후기와 일치한다.
       승차를 모르면(0) 예전과 같은 식으로 물러난다. α(0.55)·상한(0.92)은 사양서 그대로.

       분모는 조건부 재차(못 앉고 탄 사람의 차는 평균보다 붐빈다 — pBoard 의 편차 척도
       k=좌석×0.11 만큼 올려 잡는다. 새 상수가 아니다). 승차분은 분자에서 이미 뺐으므로
       분모에 다시 더하지 않는다(이중 벌점 방지). */
    var freed = Math.max(0, Math.max(0, alight) - Math.max(0, boarding || 0));
    var rivals = standingCount(load + seats * K_RATIO, seats);
    return Math.min(P_STOP_CAP, freed * a / rivals);
  }

  /* 한 번의 승차(환승 없는 한 구간 전체)를 계산한다.

     segments = [{ load, minutes, alightAtEnd }, ...]
       load        이 구간을 달리는 동안의 재차인원
       minutes     이 구간 소요시간(분)
       alightAtEnd 이 구간이 끝나는 정거장에서 내리는 인원
                   (마지막 원소의 값은 내가 내리는 역이라 쓰이지 않는다)

     돌려주는 것
       pBoard          탈 때 바로 앉을 확률
       pDuring         못 앉고 탔을 때 가는 도중에 앉게 될 확률 (사양서의 P_trip)
       pSeated         이 여정에서 언젠가 앉을 확률 = 1 - (1-pBoard)·∏(1-q)
       standingMinutes 서서 가는 시간 (사양서 5.4 — 경로 정렬의 1순위 키)
       perSegment      구간별 [{minutes, standingProb}] — 상세 화면용 */
  function ride(opt) {
    var veh = vehicleOf(opt.vehicle);
    var seats = veh.seats;
    var alpha = opt.alpha === undefined ? ALPHA_DEFAULT : opt.alpha;
    var segs = opt.segments || [];
    var total = 0, i;
    for (i = 0; i < segs.length; i++) total += segs[i].minutes;

    // 광역버스: 탔으면 앉은 것이고, 못 타면 이 경로가 성립하지 않는다.
    if (veh.standing === false) {
      var free = opt.freeSeats !== undefined
        ? opt.freeSeats
        : Math.max(0, seats - (segs.length ? segs[0].load : 0));
      var pb = pBoardExpress(free);
      return {
        pBoard: pb, pDuring: 0, pSeated: pb,
        standingMinutes: 0, totalMinutes: total,
        boardable: pb,                       // 탑승 자체가 불확실한 유일한 차종
        perSegment: segs.map(function (s) { return { minutes: s.minutes, standingProb: 0 }; })
      };
    }

    if (!segs.length) {
      return { pBoard: 1, pDuring: 0, pSeated: 1, standingMinutes: 0, totalMinutes: 0, boardable: 1, perSegment: [] };
    }

    var pb0 = pBoard(segs[0].load, seats);
    var standing = 1 - pb0;          // 아직 서 있을 확률
    var standMin = standing * segs[0].minutes;
    var per = [{ minutes: segs[0].minutes, standingProb: standing }];

    for (i = 1; i < segs.length; i++) {
      // 구간 i 를 시작하는 정거장 = 구간 i-1 이 끝나는 정거장. 거기서 사람이 내린다.
      var q = pSitAtStop(segs[i - 1].alightAtEnd || 0, segs[i - 1].load, seats, alpha,
                         segs[i - 1].boardAtEnd || 0);
      standing *= (1 - q);
      standMin += standing * segs[i].minutes;
      per.push({ minutes: segs[i].minutes, standingProb: standing });
    }

    var pSeated = 1 - standing;
    var pDuring = pb0 >= 1 ? 0 : (pSeated - pb0) / (1 - pb0);   // 못 앉고 탄 조건부
    /* 「가다가 앉을 가능성 91%」라고만 말하면 못 믿는다 — **어디쯤에서** 앉게 되는지까지
       말해야 근거가 선다(사용자 요구). 못 앉고 탄 사람이 앉게 되는 정거장의 **중앙값**:
       서 있을 확률이 처음의 절반 아래로 떨어지는 첫 정거장. 그 정거장 도착이
       fromPos + i 다. 절반까지 안 떨어지면(내릴 때까지 서기 쉬움) null. */
    var seatAtIdx = null, seatAtMin = null, s0 = 1 - pb0;
    if (s0 > 0.02) {
      var acc = 0;
      for (i = 1; i < per.length; i++) {
        acc += per[i - 1].minutes;
        if (per[i].standingProb <= s0 * 0.5) { seatAtIdx = i; seatAtMin = acc; break; }
      }
    }
    return {
      pBoard: pb0, pDuring: pDuring, pSeated: pSeated,
      seatAtIdx: seatAtIdx, seatAtMinutes: seatAtMin,
      standingMinutes: standMin, totalMinutes: total,
      boardable: 1, perSegment: per
    };
  }

  // ── 분산을 살린 판 (사양서 4.2) ──────────────────────────────────────────
  /* 표준정규의 역함수 — Acklam 근사(|오차| < 1.15e-9).
     분산 역산(expectedMaxZ)과 분포 적분(rideSpread) 양쪽이 쓴다. */
  function invNorm(p) {
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var lo = 0.02425, q, r;
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p < lo) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    if (p > 1 - lo) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }

  /* n 번 뽑았을 때 최댓값의 기대 z 값 (Blom 근사).
     T-DATA 는 시간대별 평균·최대·운행횟수를 함께 주므로 이걸로 표준편차를 역산한다. */
  function expectedMaxZ(n) { return invNorm((n - 0.375) / (n + 0.25)); }

  /* 평균·최대·운행횟수 → 표준편차 추정. 운행이 2회 미만이면 최대=평균이라 0. */
  function sdFromMeanMax(mean, max, trips) {
    if (!(trips >= 2)) return 0;
    var z = expectedMaxZ(trips);
    if (!(z > 0)) return 0;
    return Math.max(0, (max - mean) / z);
  }

  /* 차 한 대의 「붐빔 정도」를 잠재변수 z 하나로 보고, 그 z 를 9개 층으로 나눠
     ride() 를 평균낸다. 한 대가 붐비면 그 대는 모든 정거장에서 붐비므로
     구간마다 따로 흔들면 안 된다 — 같은 z 를 전 구간에 먹인다.

     segments 의 각 원소에 load 대신 {load, loadSd} 를 준다(loadSd 없으면 0). */
  function rideSpread(opt) {
    var nodes = opt.nodes || 9;
    var segs = opt.segments || [];
    var acc = null, k;
    for (k = 0; k < nodes; k++) {
      var z = invNorm((k + 0.5) / nodes);
      var shifted = segs.map(function (s) {
        return {
          load: Math.max(0, s.load + z * (s.loadSd || 0)),
          minutes: s.minutes,
          alightAtEnd: s.alightAtEnd
        };
      });
      var r = ride({ vehicle: opt.vehicle, alpha: opt.alpha, segments: shifted, freeSeats: opt.freeSeats });
      if (!acc) {
        acc = { pBoard: 0, pDuring: 0, pSeated: 0, standingMinutes: 0, totalMinutes: r.totalMinutes,
                boardable: 0, perSegment: r.perSegment.map(function (p) { return { minutes: p.minutes, standingProb: 0 }; }) };
      }
      acc.pBoard += r.pBoard / nodes;
      acc.pDuring += r.pDuring / nodes;
      acc.pSeated += r.pSeated / nodes;
      acc.standingMinutes += r.standingMinutes / nodes;
      acc.boardable += r.boardable / nodes;
      for (var i = 0; i < r.perSegment.length; i++) acc.perSegment[i].standingProb += r.perSegment[i].standingProb / nodes;
    }
    return acc;
  }

  // ── 5.4 경로 정렬 ────────────────────────────────────────────────────────
  /* 정렬 키와 화면 문구는 한 곳에 둔다. 사양서 6.2-⑤ 의 버그가
     "서서가는시간으로 정렬해 놓고 배지엔 앉는다고 썼다"였다.
     문구를 고치려면 여기를 고치고, 그러면 테스트가 정렬 키와의 일치를 다시 본다. */
  /* ★ 정렬 = 못 앉는 시간 (D-77, 2026-09-05 사용자 지시) ★
     서는 시간만 재면 「서기 3분 + 걷기 30분」이 「서기 8분 + 걷기 5분」을 이긴다 —
     발로 버티기는 매한가지다. 카드 머리기사(D-75)의
     「못 앉는 시간 = 서는 시간 + 걷는 시간」과 같은 잣대로 세운다. */
  function noSitMinutes(j) { return (j.standingMinutes || 0) + (j.walkMinutes || 0); }
  var SORT_KEY = 'standingMinutes+walkMinutes';
  /* 배지 문구는 사용자가 정했다 (2026-09-05): 짧고 부드럽게 「서는 시간이 가장 짧음」.
     정렬 자체는 못 앉는 시간(위) 그대로다 — 정렬의 정확한 문장은 목록 머리의
     「못 앉는 시간이 짧은 순으로 놓았습니다」가 담당한다. */
  var SORT_BADGE = '서는 시간이 가장 짧음';

  /* 1순위 못 앉는 시간, 동점이면 총 소요시간. */
  function compareRoutes(a, b) {
    var d = noSitMinutes(a) - noSitMinutes(b);
    if (Math.abs(d) > 1e-9) return d;
    return a.totalMinutes - b.totalMinutes;
  }
  function sortRoutes(list) { return list.slice().sort(compareRoutes); }

  // ── 화면 문구 (사양서 7.3: 전문용어 금지, 색만으로 전달 금지) ────────────
  function describeSeats(load, seats) {
    var e = emptySeats(load, seats);
    if (e === 0) return seats + '자리가 모두 찼습니다';
    return seats + '자리 가운데 ' + e + '자리 비어 있습니다';
  }

  /* 색과 항상 같이 나갈 문구. 색만 보고 판단하게 두지 않는다(사양서 7.3).

     ★ 다섯 단계 ★ (2026-09-04 사용자 지시)
     세 단계로는 30% 와 5% 가 같은 말이 됐다 — 그 둘은 전혀 다른 얘기다.
     경계는 20%마다 자른다. 위쪽이 열려 있는 구간(80% 이상)이 가장 좋은 칸이다. */
  var SEAT_LEVELS = [
    { min: 0.80, tone: 'best', text: '웬만하면 앉아 갑니다' },
    // 사용자가 준 말은 「앉을 확률 높음」이지만, 앞에 「앉을 확률 79%」가 붙으므로
    // 그대로 두면 「앉을 확률 79% · 앉을 확률 높습니다」로 겹친다. 뜻은 같게 두고 겹침만 피한다.
    { min: 0.60, tone: 'good', text: '앉을 가능성 높습니다' },
    { min: 0.40, tone: 'mid',  text: '앉을 수도, 설 수도 있습니다' },
    { min: 0.20, tone: 'low',  text: '앉기 힘듭니다' },
    { min: 0,    tone: 'bad',  text: '못 앉습니다' }
  ];
  function levelOf(pSeated) {
    for (var i = 0; i < SEAT_LEVELS.length; i++)
      if (pSeated >= SEAT_LEVELS[i].min) return SEAT_LEVELS[i];
    return SEAT_LEVELS[SEAT_LEVELS.length - 1];
  }
  function toneOf(pSeated) { return levelOf(pSeated).tone; }
  function seatPhrase(pSeated) {
    var l = levelOf(pSeated);
    return { tone: l.tone, text: l.text };
  }

  /* 퍼센트로 정확히 말한다 (2026-09-04 사용자 지시).
     「서서 가실 수 있습니다」는 30% 와 5% 를 같은 말로 뭉갠다 — 그 둘은 전혀 다른 얘기다.
     색은 그대로 두되(한눈에 보이라고) **글자에 숫자가 들어가므로** 색만으로 알리는 것이 아니다
     (사양서 7.3). 확률을 모르는 구간은 숫자를 지어내지 않고 「알 수 없음」이라고 쓴다. */
  /* 이름에 「탈 때」를 넣는다. 밖에서 꼬리말로 붙였더니
     「앉을 확률 0% · 못 앉습니다  탈 때 바로」 뒤에 「가다가…」가 이어져
     **「탈때바로가다가」** 로 읽혔다. 뜻이 이름 안에 있어야 한 줄로 읽힌다. */
  /* 여정(경로 전체)용 문구. 구간과 다르다 — 여정은 「탈 때」가 여러 번이라
     「탈 때 앉을 확률 75%」라고 쓰면 거짓말이 된다(구간마다 100%와 68%였다).
     이 값의 정체는 **타자마자 앉은 채로 가는 시간의 비율(기댓값)** 이므로 그렇게 말한다.
     다섯 단계 분류(SEAT_LEVELS)와 퍼센트 표기는 그대로다. */
  function seatChanceJourney(pSeated) {
    if (pSeated == null || isNaN(pSeated))
      return { tone: 'bad', text: '앉아 가는 시간을 알 수 없음', label: '자료가 없습니다', percent: null };
    var pct = Math.round(pSeated * 100), l = levelOf(pSeated);
    /* 0% 는 문장으로 (사용자 지시) — 「타는 시간의 0%는 앉아 갑니다」는 어색하다.
       label 은 비운다 — 붙이면 「…못 앉아 갑니다 · 못 앉습니다」로 같은 말이 두 번이다. */
    if (pct <= 0)
      return { tone: l.tone, text: '타는 동안 못 앉아 갑니다', label: '', percent: 0 };
    /* 90 초과는 숫자를 입에 담지 않는다 (D-73 사용자 지시: 백 프로 절대 금지, 아무리
       확실해도 90 까지만). 괄호의 분수(타는 N분 중 M분)는 그대로 나가므로 산수는 닫힌
       채, 문장에서만 확신을 뺀다. label 은 「웬만하면 앉아 갑니다」와 겹쳐 비운다. */
    if (pct > 90)
      return { tone: l.tone, text: '웬만하면 타는 내내 앉아 갑니다', label: '', percent: pct };
    return { tone: l.tone, text: '타는 시간의 ' + pct + '%는 앉아 갑니다', label: l.text, percent: pct };
  }

  function seatChance(pSeated) {
    if (pSeated === null || pSeated === undefined || isNaN(pSeated))
      return { tone: 'bad', text: '탈 때 앉을 확률 알 수 없음', label: '자료가 없습니다', percent: null };
    /* ★ 확률 「표기」의 상한은 90 (D-73, 사용자 지시) ★
       계산이 97·100 이어도 입 밖으로는 90 까지만 — 예측이 확신을 말하면
       한 번의 반례로 신뢰가 무너진다. 다섯 단계 분류는 원값으로 매긴다. */
    var pct = Math.min(90, Math.round(pSeated * 100));
    var l = levelOf(pSeated);
    return { tone: l.tone, text: '탈 때 앉을 확률 ' + pct + '%', label: l.text, percent: pct };
  }

  /* "서서 가는 시간 11분". 어르신에게는 확률보다 이 쪽이 와닿는다(사양서 5.4). */
  function standingPhrase(minutes) {
    var m = Math.round(minutes);
    if (m <= 0) return '서는 시간 없음';
    return '서는 시간 ' + m + '분';
  }

  return {
    VEHICLES: VEHICLES, SEAT_RATIO_SUBWAY: SEAT_RATIO_SUBWAY,
    ALPHA_DEFAULT: ALPHA_DEFAULT, K_RATIO: K_RATIO, P_STOP_CAP: P_STOP_CAP,
    vehicleOf: vehicleOf,
    loadFromCongestion: loadFromCongestion, congestionFromLoad: congestionFromLoad,
    emptySeats: emptySeats, standingCount: standingCount,
    pBoard: pBoard, pBoardExpress: pBoardExpress, pSitAtStop: pSitAtStop,
    ride: ride, rideSpread: rideSpread,
    invNorm: invNorm, expectedMaxZ: expectedMaxZ, sdFromMeanMax: sdFromMeanMax,
    SORT_KEY: SORT_KEY, SORT_BADGE: SORT_BADGE, noSitMinutes: noSitMinutes,
    compareRoutes: compareRoutes, sortRoutes: sortRoutes,
    describeSeats: describeSeats, SEAT_LEVELS: SEAT_LEVELS, levelOf: levelOf, toneOf: toneOf,
    seatPhrase: seatPhrase, seatChance: seatChance,
    seatChanceJourney: seatChanceJourney, standingPhrase: standingPhrase
  };
});
