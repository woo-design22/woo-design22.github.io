# -*- coding: utf-8 -*-
"""전체 빌드 파이프라인.

  1. 원본 일러스트 컷아웃 정제   -> assets/illus_*.png, bg_cityscape.png
  2. 아이콘 · 도형 · 배경 생성   -> assets/*.png
  3. 제목 레터링 이미지          -> assets/title_line*.png
  4. 시안 PNG                    -> out/preview.png
  5. 편집 가능 PDF + 뒷정리      -> out/poster-editable.pdf
  6. 미리캔버스용 PPTX           -> out/poster-editable.pptx
"""
import os

PDF = r"C:\Claude\poster-editable\out\poster-editable.pdf"


def banner(n, title):
    print("\n" + "=" * 60)
    print("[%d/6] %s" % (n, title))
    print("=" * 60)


def main():
    import prep_illustrations
    import build_elements as E
    import build_title
    import render_preview
    import compose_pdf
    import postprocess_pdf
    import compose_pptx

    banner(1, "원본 일러스트 컷아웃 정제")
    for name, fn, src in prep_illustrations.JOBS:
        img = fn(src)
        img.save(os.path.join(prep_illustrations.OUT, name))
        print("%-24s %s" % (name, img.size))

    banner(2, "아이콘 · 도형 · 배경 생성")
    for fn in (E.build_category_icons, E.build_step_icons, E.build_chevron,
               E.build_cta_arrow, E.build_logo_mark, E.build_ring, E.build_ring_disc,
               E.build_panels, E.build_bg_sky, E.build_clouds, E.build_birds,
               E.build_leaves, E.build_small_icons, E.build_bullets, E.build_qr):
        fn()

    banner(3, "제목 레터링 이미지")
    build_title.render_lines([
        ([("작은 참여가", build_title.NAVY)], "title_line1.png"),
        ([("큰 변화", build_title.GREEN), ("를 만듭니다", build_title.NAVY)], "title_line2.png"),
    ])

    banner(4, "시안 PNG 렌더")
    render_preview.render()

    banner(5, "편집 가능 PDF")
    compose_pdf.build(PDF)
    postprocess_pdf.clean(PDF, PDF)

    banner(6, "미리캔버스용 PPTX")
    compose_pptx.build()

    print("\n완료.")


if __name__ == "__main__":
    main()
