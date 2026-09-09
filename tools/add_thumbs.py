# 대문(index.html) 카드에 썸네일을 붙인다.
#
# 카드가 지금은 글자만 있어서 열세 개가 다 똑같이 생겼다. 왼쪽에 작은 그림 하나를 두면
# 훑어볼 때 눈이 걸린다. 그림은 thumbs/<폴더이름>.svg — 벡터라 다 합쳐 200KB 남짓이고
# 확대해도 안 깨진다.
#
# 설명이 긴 카드(축구·격리실)가 있으므로 세로 가운데가 아니라 **위쪽 정렬**이다.
# 가운데로 두면 긴 카드에서 그림만 허공에 뜬다.
#
# 사용법: python tools/add_thumbs.py
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, 'index.html')
THUMBS = os.path.join(ROOT, 'thumbs')

CSS_OLD = """  a.card {
    display: block;
    background: var(--surface);"""

CSS_NEW = """  a.card {
    display: flex;
    gap: 14px;
    align-items: flex-start;   /* 설명이 긴 카드가 있어 가운데가 아니라 위쪽에 맞춘다 */
    background: var(--surface);"""

CSS_ADD = """
  /* 썸네일: 밝은 타일 한 장. 어두운 화면에서도 그대로 밝게 둔다(앱 아이콘처럼 보이라고). */
  .card .thumb {
    flex: 0 0 52px; width: 52px; height: 52px;
    border-radius: 10px; border: 1px solid var(--line);
    background: #f4f4f2;
  }
  .card .body { min-width: 0; }   /* 긴 낱말이 칸을 밀어내지 않게 */
"""

CARD = re.compile(
    r'(<a class="card" href="([a-z0-9-]+)/">\s*\n)'
    r'(\s*)(<div class="name">.*?</div>\s*\n\s*<div class="desc">.*?</div>\s*\n)'
    r'(\s*</a>)',
    re.S)


def main():
    src = io.open(PAGE, encoding='utf-8').read()

    if '.card .thumb' in src:
        print('이미 붙어 있다 — 그만둔다'); return
    if CSS_OLD not in src:
        print('카드 CSS 를 못 찾았다 — 그만둔다'); return

    src = src.replace(CSS_OLD, CSS_NEW, 1)
    # .card .name 규칙 바로 앞에 썸네일 규칙을 끼워 넣는다
    anchor = '  .card .name {'
    src = src.replace(anchor, CSS_ADD.lstrip('\n') + anchor, 1)

    done, skipped = [], []

    def rep(m):
        head, slug, indent, inner, tail = m.groups()
        svg = os.path.join(THUMBS, slug + '.svg')
        if not os.path.exists(svg):
            skipped.append(slug)
            return m.group(0)
        done.append(slug)
        img = ('%s<img class="thumb" src="thumbs/%s.svg" alt="" loading="lazy" decoding="async">\n'
               % (indent, slug))
        body = '%s<div class="body">\n' % indent
        # 첫 줄의 들여쓰기는 정규식이 indent 로 떼어 갔으므로 되돌려 붙인 뒤 한 단 더 민다
        inner2 = ''.join('  ' + l if l.strip() else l
                         for l in (indent + inner).splitlines(True))
        return head + img + body + inner2 + '%s</div>\n' % indent + tail

    src = CARD.sub(rep, src)
    io.open(PAGE, 'w', encoding='utf-8', newline='\n').write(src)

    print('붙임 %d개: %s' % (len(done), ' '.join(done)))
    if skipped:
        print('건너뜀 %d개(그림 없음): %s' % (len(skipped), ' '.join(skipped)))


if __name__ == '__main__':
    main()
