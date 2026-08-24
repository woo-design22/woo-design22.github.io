# 공익 프로젝트 포스터 — 편집 가능 변환

원본 포스터 이미지를 미리캔버스에서 **요소별로 따로 움직일 수 있는** 파일로 재구성한 것.

## 결과물 (`out/`)

| 파일 | 크기 | 용도 |
|---|---|---|
| `poster-editable.pdf` | 7.8 MB | **주 결과물.** 미리캔버스 업로드용 |
| `poster-editable.pptx` | 5.0 MB | 예비. PDF 임포트가 마음에 안 들 때 |
| `preview.png` | 1.1 MB | 배치 확인용 시안 |

A4 세로 (210 × 297 mm) 정확히 일치.

## 미리캔버스에서 요소가 통째로 잡히던 문제

기존 PDF에서 *그림은 제 크기로 잡히는데 나머지는 포스터 전체 크기로 움직이던* 원인은
도형·배경·구분선이 **PDF 벡터 패스**로 들어가 있었기 때문이다. 임포터는 벡터 드로잉을
페이지 단위로 한 덩어리로 묶는다.

이번 변환은 그 경로를 아예 없앴다.

* 텍스트를 제외한 **모든 요소가 개별 이미지**다. 초록 CTA 바, 크림색 카드 패널,
  하단 네이비 바, 세로 구분선까지 전부 자기 크기에 맞는 PNG로 들어간다.
* PDF 콘텐츠 스트림에 **벡터 연산자가 0개**다 — 사각형(`re`), 베지어(`c/v/y`),
  직선(`l`), 채우기/선(`f/S/B`), 클리핑(`W n`) 모두 없음.
* **Form XObject 0개**, **페이지 투명도 그룹 없음**. Form XObject의 BBox가 페이지
  크기면 그 안의 모든 것이 페이지 크기로 잡히는데, 그 구조를 만들지 않았다.
* 이미지 37개가 `q … cm … Do … Q` 로 **44번 독립 배치**된다 (반복 사용 7건 포함).

`src/verify_pdf.py` 로 매번 확인할 수 있다.

## 가장자리가 흐려지거나 잘리던 문제

아이콘·도형은 전부 **마스크 기반**으로 만들었다.

1. 형태를 8배 확대한 8bit 알파 마스크에 그린다.
2. LANCZOS로 최종 크기까지 줄인다.
3. 줄인 마스크를 **단색 RGB**에 알파로 씌운다.

RGB가 균일하므로 축소할 때 투명 픽셀의 색이 새어나오는 후광(fringe)이 **원리적으로**
생기지 않는다. 여기에 모든 PNG는 사방에 투명 여백(3~10%)을 넣어, 안티에일리어싱
경계가 비트맵 끝에 닿아 잘리는 일이 없다.

선(stroke)은 쓰지 않았다. 모든 글리프가 촘촘히 샘플링한 베지어의 **채워진 폴리곤**이라
선이 끊기거나 이음매가 어긋나지 않는다. 사람 모양 아이콘은 손가락 같은 세부를 그리지
않고 매끈한 실루엣으로 처리했다.

## 원본 비율 유지

일러스트와 제목은 가로·세로 중 **한 쪽 치수만 지정**하고 나머지는 원본 비율로
계산한다 (`src/layout.py`). 찌그러지지 않는다.

제목 두 줄은 같은 세로 밴드로 잘라내 픽셀 높이가 동일하다 — 배치할 때 높이만 같게
주면 두 줄의 글자 크기가 정확히 일치한다.

## 요소 구성

**편집 가능한 텍스트 (37개 블록)** — Noto Sans KR Regular/Medium/Bold 임베드, ToUnicode 포함.
헤드라인, 리드 문장, 링 안 글자, CTA 문구, 카드 3열 제목·설명·항목, 하단 안내, 연락처.

**이미지 (39종)**

| 분류 | 파일 |
|---|---|
| 인물 일러스트 | `illus_planting` `illus_boy_box` `illus_wheelchair` |
| 배경 | `bg_sky` `bg_cityscape` `cloud_a~c` `birds_a~b` `leaf_a~c` |
| 제목 레터링 | `title_line1` `title_line2` |
| 도형/패널 | `panel_cta` `panel_card` `panel_footer` `divider_v` `footer_sep` |
| 순환 링 | `ring` `ring_disc` |
| 분류 아이콘 | `icon_cat_env` `icon_cat_share` `icon_cat_youth` |
| 절차 아이콘 | `step_qr` `step_form` `step_join` `chevron` |
| 기타 | `logo_mark` `cta_arrow` `qr_code` `icon_phone(_navy)` `icon_globe(_navy)` `bullet_green/blue/teal` |

QR코드는 `https://www.happyshare.or.kr` 로 실제 인코딩돼 있다.

## 다시 빌드하기

```bash
python src/build_all.py
```

`src/layout.py` 한 곳이 PDF·PPTX·시안 PNG를 모두 구동한다. 위치를 바꾸려면 거기만 고친다.

| 파일 | 역할 |
|---|---|
| `layout.py` | 배치 정의 (mm, 좌상단 원점) |
| `gfx.py` | 마스크 렌더링 헬퍼 |
| `prep_illustrations.py` | 원본 컷아웃 정제 (알파 정규화·디스필·패딩) |
| `build_elements.py` | 아이콘·도형·배경 생성 |
| `build_title.py` | 제목 레터링 이미지 |
| `render_preview.py` | 시안 PNG |
| `compose_pdf.py` → `postprocess_pdf.py` | PDF 조립 + 뒷정리 |
| `compose_pptx.py` | PPTX 조립 |
| `verify_pdf.py` / `verify_pptx.py` | 구조 검증 / PowerPoint 렌더 검증 |

## 원본 일러스트 출처

인물 3종과 도시 배경은 `C:\Users\User\.codex\generated_images\` 에 있던 원본
생성 이미지를 그대로 썼다. 다시 그리지 않았으므로 사람 얼굴·손 묘사가 원본 품질
그대로다. 도시 배경은 마젠타 크로마키를 제거해 하늘을 투명하게 만들었다.
