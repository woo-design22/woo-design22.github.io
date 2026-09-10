# -*- coding: utf-8 -*-
"""
Z-Anatomy 의 Startup.blend 에서 오른쪽 손목 부위만 뽑아 뷰어용 데이터로 만든다.

    blender --background <Startup.blend> --python extract.py

결과는 data/wrist.bin (기하) + data/wrist.json (메타) 두 개다.
build_app.py 가 이 둘을 읽어 index.html 의 데이터 블록에 넣는다
(fly-brain 의 build_app.py 와 같은 방식).

원본은 CC BY-SA 4.0 이다. 파생물도 같은 라이선스로 나가야 한다.
"""

import bpy
import bmesh
import math
import json
import os
import struct
from collections import defaultdict
from mathutils import Vector

# ─────────────────────────────────────────────────────────────
# 설정
# ─────────────────────────────────────────────────────────────

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

ANCHOR = "Scaphoid bone.r"   # 오른쪽 손목의 기준점
REGION_R = 0.075             # 기준점에서 7.5cm 상자 안에 걸치는 것만 가져온다

# 근육만 무겁다(전체의 64%). 목표 정점 수를 넘으면 그 층만 줄인다.
DECIMATE = {"5_근육": 0.35}   # 피부는 줄이지 않는다 — 각이 져 조각처럼 보인다

# 신경·혈관은 커브다. 굵기가 0 이면 선으로만 보이므로 관으로 만들어 준다.
CURVE_BEVEL = {"3_천부맥관": 0.0009, "6_심부맥관": 0.0011}

# 층 분류. **순서가 곧 우선순위**다 — 위에서 먼저 걸린 것이 이긴다.
# 예: "Palmar radio-ulnar ligament" 는 인대(7)지 맥관(6)이 아니다.
RULES = [
    ("8_뼈", ["bone.r", "radius.r", "ulna.r", "phalanx", "metacarpal bone"]),
    ("7_인대관절낭", ["ligament", "capsule", "articular disc", "interosseous membrane"]),
    ("4_힘줄지지대", ["tendon sheath", "retinaculum", "tendon."]),
    ("2_근막", ["fascia", "aponeurosis"]),
    ("1_피부표면", ["region of wrist", "region of forearm", "palm.", "dorsum of hand",
                    "surfaces of digits", "nail plate", "perionyx", "border of forearm",
                    "foveola"]),
    ("3_천부맥관", ["cephalic vein", "basilic vein", "antebrachial vein", "venous network",
                    "cutaneous nerve", "digital veins"]),
    ("6_심부맥관", ["nerve", "artery", "arteries", "arch", "veins", "anastomosis"]),
    ("5_근육", ["flexor", "extensor", "abductor", "adductor", "opponens", "lumbrical",
                "interossei", "brachioradialis", "pronator", "palmaris"]),
]

# 뼈의 표지점(돌기·결절·관절면)은 이름이 ".j" 로 끝난다. 골절·압통점 설명에
# 반드시 필요하므로 버리지 않고 뼈 층으로 흡수한다.
LANDMARK_SUFFIX = ".j"

# 정점이 이보다 적으면 세분해서 매끄럽게 만든다. 없는 형상을 지어내는 것이 아니라
# 있는 형상의 각을 죽이는 것이다(관절원반 16, 배측 요척인대 8 처럼 거친 것이 많다).
COARSE_VERTS = 60

# 얇은 판에 줄 두께(mm). 근막·지대·관절낭은 종이가 아니라 조직이다.
# 두께가 없으면 옆에서 볼 때 사라지고 뚫린 자리가 시커먼 구멍이 된다.
SHEET_MM = {
    # 피부는 넣지 않는다. 원본이 부위별 조각으로 나뉘어 있어 두께를 주면
    # 조각마다 테두리가 생겨 판자를 이어 붙인 것처럼 보인다.
    "2_근막": 0.5,
    "4_힘줄지지대": 0.9,
    "7_인대관절낭": 0.7,
}


# **원본이 피부 조각마다 3mm Solidify 를 붙여 놨다.** 그대로 평가하면 조각마다
# 3mm 테두리가 서서 판자를 이어 붙인 것처럼 보인다. 피부는 얇은 껍질이므로 끈다.
# (원본 파일은 배경 실행이라 저장되지 않지만, 그래도 평가가 끝나면 되돌려 둔다.)
MUTE_SOLIDIFY = {"1_피부표면"}

# 원본 피부가 아주 거칠다 — 아래팔 앞면 293정점, 요골오목 15정점. 그대로 두면
# 각이 져 조각처럼 보인다. 정점 수에 따라 세분 단계를 정한다(없는 형상을 짓지 않는다).
SMOOTH_SUB = {"1_피부표면": (500, 2, 1)}   # (기준 정점, 미만이면 단계, 이상이면 단계)

# 세분(카트멀-클라크)은 표면을 안쪽으로 당긴다 — 실측 중앙값 0.1mm, 최대 0.64mm.
# 그만큼 피부가 오므라들어 바로 밑의 신근지대가 밖으로 삐져나왔다(직전 판에는 없던 일).
# 당긴 만큼 법선 방향으로 도로 밀어낸다. 피부는 가장 바깥이라 0.7mm 불어도 가릴 것이 없다.
PUFF_MM = {"1_피부표면": 0.7}


# 안쪽 구멍을 메울 층. 이어져 있어야 맞는 판만 넣는다.
# 관절낭은 넣지 않는다 — 그 구멍들은 뼈가 지나가는 실제 개구부다.
FILL_HOLES = {"1_피부표면", "2_근막"}


def boundary_loops(bm):
    """열린 모서리들을 이어 붙여 경계 고리별로 나눈다."""
    open_edges = [e for e in bm.edges if len(e.link_faces) == 1]
    if not open_edges:
        return []
    by_vert = {}
    for e in open_edges:
        for v in e.verts:
            by_vert.setdefault(v.index, []).append(e)
    seen, loops = set(), []
    for e0 in open_edges:
        if e0.index in seen:
            continue
        stack, group = [e0], []
        while stack:
            e = stack.pop()
            if e.index in seen:
                continue
            seen.add(e.index)
            group.append(e)
            for v in e.verts:
                for n in by_vert.get(v.index, ()):
                    if n.index not in seen:
                        stack.append(n)
        loops.append(group)
    return loops


def is_open(mesh):
    """경계가 열린 판인가. 모서리 하나를 면 하나만 쓰면 그 모서리는 테두리다."""
    use = {}
    for poly in mesh.polygons:
        vs = poly.vertices
        for k in range(len(vs)):
            a, b = vs[k], vs[(k + 1) % len(vs)]
            key = (a, b) if a < b else (b, a)
            use[key] = use.get(key, 0) + 1
    return any(v == 1 for v in use.values())

# 계통 이름표(.g)와 방향·기준면은 해부 구조가 아니다. 버린다.
DROP_EXACT = {"Abduction", "Distal", "Proximal", "Dorsal", "Palmar",
              "Coronal planes", "BezierCircle'"}
DROP_SUFFIX = (".g",)

LAYER_ORDER = ["1_피부표면", "2_근막", "3_천부맥관", "4_힘줄지지대",
               "5_근육", "6_심부맥관", "7_인대관절낭", "8_뼈"]


# ─────────────────────────────────────────────────────────────
# 도우미
# ─────────────────────────────────────────────────────────────

def world_bbox(obj):
    pts = [obj.matrix_world @ Vector(c[:]) for c in obj.bound_box]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    return min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)


def classify(name):
    """이름 하나를 층 하나에 배정한다. 못 하면 None."""
    if name in DROP_EXACT or name.endswith(DROP_SUFFIX):
        return None
    # 왼쪽 것은 애초에 안 본다. ".l" 로 끝나거나 ".el"/".ol" 같은 왼쪽 변형.
    low = name.lower()
    if low.endswith(".l") or low.endswith("l") and low[-3:-1] in (".e", ".o"):
        return None
    # ".j" 는 뼈 표면이 아니라 **이름표가 가리키는 지시점**이다(정점 2개짜리 마커).
    # 기하로 쓰면 면이 없어 버려질 뿐이므로 아래 landmark 단계에서 따로 거둔다.
    if name.endswith(LANDMARK_SUFFIX):
        return None
    for layer, pats in RULES:
        for p in pats:
            if p in low:
                return layer
    return None


def in_region(obj, box):
    try:
        b = world_bbox(obj)
    except Exception:
        return False
    return not (b[3] < box[0] or b[0] > box[3] or
                b[4] < box[1] or b[1] > box[4] or
                b[5] < box[2] or b[2] > box[5])


# ─────────────────────────────────────────────────────────────
# 1. 대상 고르기
# ─────────────────────────────────────────────────────────────

anchor = bpy.data.objects.get(ANCHOR)
if anchor is None:
    raise SystemExit("기준점 '%s' 을 못 찾았다. Startup.blend 가 맞는지 확인할 것." % ANCHOR)

ab = world_bbox(anchor)
cx, cy, cz = (ab[0] + ab[3]) / 2, (ab[1] + ab[4]) / 2, (ab[2] + ab[5]) / 2
box = (cx - REGION_R, cy - REGION_R, cz - REGION_R,
       cx + REGION_R, cy + REGION_R, cz + REGION_R)

picked = defaultdict(list)
for o in bpy.data.objects:
    if o.type not in ("MESH", "CURVE"):
        continue
    layer = classify(o.name)
    if layer is None:
        continue
    if not in_region(o, box):
        continue
    picked[layer].append(o)

print("[고름] 층별 개수")
for L in LAYER_ORDER:
    print("   %-12s %d" % (L, len(picked[L])))

# 표지점(landmark) 거두기 — 경상돌기·유구골 갈고리·주상골 결절처럼
# 골절과 압통점 설명에 꼭 필요한 자리들이다. 형상이 아니라 좌표만 쓴다.
landmarks = []
for o in bpy.data.objects:
    if not o.name.endswith(LANDMARK_SUFFIX):
        continue
    if not in_region(o, box):
        continue
    b = world_bbox(o)
    landmarks.append({
        "name": o.name[:-len(LANDMARK_SUFFIX)],
        "pos": [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2],
    })
print("[표지점] %d 개" % len(landmarks))


# ─────────────────────────────────────────────────────────────
# 2. 커브를 관(管)으로 바꾸기
# ─────────────────────────────────────────────────────────────
# 신경·혈관은 곡선 데이터다. 두께가 없으면 화면에서 안 보이므로 bevel 을 준다.
#
# **연산자(bpy.ops.object.convert)를 쓰지 않는다.** 그것은 "선택된" 객체에만
# 도는데 배경 실행에서는 선택 상태를 만들기가 번거롭고, 활성(active)만 지정하면
# 조용히 아무 일도 안 한다("No editable objects to convert"). 대신 굵기만 얹어
# 두고 아래 3단계의 new_from_object 가 평가된 결과를 메시로 돌려주게 한다 —
# 커브도 그렇게 하면 관 모양 메시가 그대로 나온다.

n_curve = 0
for layer, objs in picked.items():
    depth = CURVE_BEVEL.get(layer)
    for o in objs:
        if o.type != "CURVE":
            continue
        if depth and not o.data.bevel_depth:
            o.data.bevel_depth = depth
            o.data.bevel_resolution = 1      # 단면 8각. 관으로 보이기엔 충분하다.
        o.data.resolution_u = 2              # 길이 방향도 줄인다(기본 12는 과하다)
        n_curve += 1

print("[커브] 굵기를 준 것 %d 개" % n_curve)


# ─────────────────────────────────────────────────────────────
# 3. 기하 모으기
# ─────────────────────────────────────────────────────────────
# 좌표계를 바꾼다: Blender 는 Z 가 위, WebGL 은 Y 가 위다.
#   (x, y, z)_blender  ->  (x, z, -y)_webgl
# 그리고 손목 중심을 원점으로 옮기고 mm 단위로 키운다.

SCALE = 1000.0   # m -> mm

def to_view(v):
    return ((v.x - cx) * SCALE, (v.z - cz) * SCALE, -(v.y - cy) * SCALE)


depsgraph = bpy.context.evaluated_depsgraph_get()
parts = []
dropped = []      # 면이 없어 버린 것. 무엇이 빠졌는지 반드시 눈으로 확인한다.

for layer in LAYER_ORDER:
    ratio = DECIMATE.get(layer)
    for o in picked[layer]:
        mods = []

        # ① 정점이 모자란 것은 세분한다.
        #    원본이 거칠어 각진 조각처럼 보이는 구조가 많다(관절원반 16, 배측 요척인대 8).
        #    세분은 없는 해부를 지어내지 않는다 — 있는 형상을 매끄럽게 할 뿐이다.
        lv = 0
        if o.type == "MESH" and len(o.data.vertices) < COARSE_VERTS:
            lv = 1
        sm = SMOOTH_SUB.get(layer)
        if sm and o.type == "MESH":
            lv = max(lv, sm[1] if len(o.data.vertices) < sm[0] else sm[2])
        if lv:
            sub = o.modifiers.new("sub", "SUBSURF")
            sub.levels = sub.render_levels = lv
            mods.append(sub)

        # ①-2 원본이 붙여 둔 두께를 끈다(피부만).
        muted = []
        if layer in MUTE_SOLIDIFY:
            for m0 in o.modifiers:
                if m0.type == "SOLIDIFY" and m0.show_viewport:
                    m0.show_viewport = False
                    muted.append(m0)

        # ② 얇은 판에는 두께를 준다.
        #    근막·지대·관절낭은 종이가 아니라 조직이다. 두께가 없으면 옆에서 볼 때
        #    사라지고, 뚫린 자리가 시커먼 구멍으로 보인다.
        th = SHEET_MM.get(layer)
        if th and o.type == "MESH" and is_open(o.data):
            sol = o.modifiers.new("sol", "SOLIDIFY")
            sol.thickness = th / 1000.0
            sol.offset = 0.0                  # 원래 면을 가운데 두고 양쪽으로 부푼다
            sol.use_rim = True
            sol.use_rim_only = False
            mods.append(sol)

        # ②-2 세분이 당긴 만큼 도로 밀어낸다(피부만)
        pf = PUFF_MM.get(layer)
        if pf and o.type == "MESH":
            dsp = o.modifiers.new("puff", "DISPLACE")
            dsp.direction = "NORMAL"
            dsp.mid_level = 0.0
            dsp.strength = pf / 1000.0
            mods.append(dsp)

        # ③ 감량이 필요한 층이면 마지막에 줄인다
        if ratio and o.type == "MESH" and len(o.data.vertices) > 400:
            dec = o.modifiers.new("dec", "DECIMATE")
            dec.ratio = ratio
            mods.append(dec)

        # **모디파이어를 붙였으면 의존성 그래프를 다시 받아야 한다.**
        # 루프 밖에서 한 번 받아 둔 그래프로 평가하면 붙인 것이 반영되지 않는다
        # (그래서 세분·두께는 물론 감량까지 조용히 무시되고 있었다).
        if mods or muted:
            bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()

        # 커브든 메시든 평가된 결과를 메시로 받는다(커브는 bevel 이 얹힌 관이 나온다)
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        for m in mods:
            o.modifiers.remove(m)
        for m0 in muted:
            m0.show_viewport = True

        if me is None or not me.polygons:
            if me is not None:
                bpy.data.meshes.remove(me)
            dropped.append(o.name)
            continue

        me.transform(o.matrix_world)
        bm = bmesh.new()
        bm.from_mesh(me)

        # 이어져 있어야 맞는 판에서 안쪽 구멍을 메운다.
        # **관절낭은 건드리지 않는다** — 그 구멍 여섯 개는 뼈가 지나가는 실제 개구부다.
        # 바깥 테두리(가장 큰 고리)는 남기고 그보다 작은 고리만 막는다.
        if layer in FILL_HOLES:
            loops = boundary_loops(bm)
            if len(loops) > 1:
                biggest = max(len(x) for x in loops)
                inner = [e for lp in loops if len(lp) < biggest for e in lp]
                if inner:
                    bmesh.ops.holes_fill(bm, edges=inner, sides=0)

        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(me)
        bm.free()

        verts = [to_view(v.co) for v in me.vertices]
        tris = []
        for p in me.polygons:
            tris.extend(p.vertices[:3])
        bpy.data.meshes.remove(me)

        if not verts or not tris:
            dropped.append(o.name)
            continue

        parts.append({
            "name": o.name,
            "layer": layer,
            "verts": verts,
            "tris": tris,
        })

# ─────────────────────────────────────────────────────────────
# 3-b. 피부 조각의 경계를 서로 붙인다
# ─────────────────────────────────────────────────────────────
# 원본은 피부를 부위별 조각으로 나눠 놓았고(손바닥·손등·아래팔 앞뒤·좌우 가장자리…),
# 조각끼리 테두리를 공유하지 않는다 — 8,479 자리 중 313 자리만 겹쳤다. 그래서
# 0.1~3.5mm 씩 어긋나 조각 사이에 금이 보인다. 사람 피부는 이어져 있어야 한다.
#
# 고리를 통째로 붙이면(합집합 방식) 촘촘한 경계가 사슬처럼 이어져 한 점으로 무너진다.
# 그래서 **다른 조각마다 가장 가까운 것 하나씩만** 짝으로 잡고 그 평균으로 옮긴다.

WELD_LAYERS = {"1_피부표면"}
WELD_MM = 5.0


def boundary_idx(part):
    """모서리를 한 면만 쓰면 그 모서리는 테두리다. 그 끝점들을 돌려준다."""
    use = {}
    t = part["tris"]
    for i in range(0, len(t), 3):
        a1, b1, c1 = t[i], t[i + 1], t[i + 2]
        for x, y in ((a1, b1), (b1, c1), (c1, a1)):
            k = (x, y) if x < y else (y, x)
            use[k] = use.get(k, 0) + 1
    return {v for k, n in use.items() if n == 1 for v in k}


wgroup = [p for p in parts if p["layer"] in WELD_LAYERS]
if len(wgroup) > 1:
    bnd = []                       # (조각번호, 정점번호, 좌표)
    for pi, p in enumerate(wgroup):
        for vi in boundary_idx(p):
            bnd.append((pi, vi, p["verts"][vi]))
    cell = WELD_MM
    grid = defaultdict(list)
    for rec in bnd:
        v = rec[2]
        grid[(int(v[0] // cell), int(v[1] // cell), int(v[2] // cell))].append(rec)

    r2 = WELD_MM * WELD_MM
    moved = 0
    maxd = 0.0
    newpos = []
    for pi, vi, v in bnd:
        best = {}                  # 다른 조각별로 가장 가까운 것 하나씩
        gx, gy, gz = int(v[0] // cell), int(v[1] // cell), int(v[2] // cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for pj, vj, w in grid.get((gx + dx, gy + dy, gz + dz), ()):
                        if pj == pi:
                            continue
                        d = ((v[0] - w[0]) ** 2 + (v[1] - w[1]) ** 2 +
                             (v[2] - w[2]) ** 2)
                        if d <= r2 and (pj not in best or d < best[pj][0]):
                            best[pj] = (d, w)
        if not best:
            continue
        n = 1 + len(best)
        nx = (v[0] + sum(w[0] for _, w in best.values())) / n
        ny = (v[1] + sum(w[1] for _, w in best.values())) / n
        nz = (v[2] + sum(w[2] for _, w in best.values())) / n
        newpos.append((pi, vi, (nx, ny, nz)))
        moved += 1
        maxd = max(maxd, ((nx - v[0]) ** 2 + (ny - v[1]) ** 2 +
                          (nz - v[2]) ** 2) ** 0.5)

    for pi, vi, np_ in newpos:      # 원래 좌표로 다 계산한 뒤에 한꺼번에 옮긴다
        wgroup[pi]["verts"][vi] = np_
    print("[피부 붙이기] 경계 %d 개 중 %d 개를 이어 붙였다(최대 이동 %.2fmm)"
          % (len(bnd), moved, maxd))


# ─────────────────────────────────────────────────────────────
# 3-b2. 남은 실틈을 꿰매 없앤다
# ─────────────────────────────────────────────────────────────
# 정점을 서로 끌어당겨도 틈이 다 없어지지는 않는다. 두 조각의 모서리 나눔이 달라
# T자 이음이 생기고, 그 자리가 실처럼 가느다란 구멍으로 남는다. 화면에서 아주 밝은
# 화소를 세어 보면 그 대부분이 이 틈 너머로 비친 신근지대·근막이었다.
#
# 그래서 조각들을 **한 덩어리로 합쳐** ① 경계 정점만 골라 병합하고
# ② 그러고도 남은 가느다란 고리를 메운다. 면마다 원래 조각 번호를 달아 두었다가
# 끝나면 조각별로 도로 나눈다 — 화면의 부위 목록·검색이 조각 단위로 돌아야 한다.
# **안쪽 정점은 병합 대상에서 뺀다** — 손가락처럼 촘촘한 곳이 뭉개진다.
#
# 손톱과 조갑주위조직은 뺀다. 옆에 맞닿은 이웃이 아니라 피부 위에 얹힌 것이라
# 병합하면 손톱 윤곽이 뭉개진다.

STITCH_MM = 1.2        # 경계 정점이 이만큼 가까우면 같은 자리로 본다
STITCH_KEEP = 150.0    # 둘레가 이보다 긴 고리는 진짜 테두리다(아래팔을 자른 끝)
STITCH_SKIP = ("Nail plate", "Perionyx")

grp = [p for p in parts
       if p["layer"] == "1_피부표면" and not any(k in p["name"] for k in STITCH_SKIP)]
if len(grp) > 1:
    bm = bmesh.new()
    lay = bm.faces.layers.int.new("part")
    for pi, p in enumerate(grp):
        vm = [bm.verts.new(Vector(v)) for v in p["verts"]]
        t = p["tris"]
        for i in range(0, len(t), 3):
            try:
                f = bm.faces.new((vm[t[i]], vm[t[i + 1]], vm[t[i + 2]]))
            except ValueError:
                continue                      # 이미 있는 면
            f[lay] = pi + 1
    bm.verts.index_update(); bm.edges.index_update(); bm.faces.index_update()

    bv = list({v for e in bm.edges if len(e.link_faces) == 1 for v in e.verts})
    n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bv, dist=STITCH_MM)
    bm.verts.index_update(); bm.edges.index_update(); bm.faces.index_update()
    print("[피부 꿰매기] 경계 정점 %d 개 중 %d 자리를 하나로 합쳤다"
          % (len(bv), n0 - len(bm.verts)))

    loops = boundary_loops(bm)
    fill, keep = [], []
    for lp in loops:
        per = sum(e.calc_length() for e in lp)
        (keep if per > STITCH_KEEP else fill).append((per, lp))
    if fill:
        was = set(bm.faces)
        bmesh.ops.holes_fill(bm, edges=[e for _, lp in fill for e in lp], sides=0)
        bm.faces.ensure_lookup_table()
        made = [f for f in bm.faces if f not in was]

        # 넓은 구멍(둘레 40mm 넘는 것)을 평평한 판으로 덮으면 그 자리가 접시처럼
        # 도드라진다. 안쪽에 정점을 심고(poke) 테두리를 붙든 채 펴서 막을 만든다.
        # poke 는 모서리를 쪼개지 않으므로 옆면과 T자 이음이 생기지 않는다.
        wide = [q for q, _ in fill if q > 40.0]
        if wide and made:
            reg = [f for f in made if len(f.verts) > 8]
            if reg:
                # 네 번 심는다. 주위 살결보다 성기면 그 자리의 법선이 크게 튀어
                # 테두리가 선으로 보인다 — 결의 촘촘함을 비슷하게 맞춘다.
                inner = []
                for _ in range(4):
                    r = bmesh.ops.poke(bm, faces=reg)
                    reg = r["faces"]
                    inner.extend(r["verts"])
                # poke 는 다각형 한가운데에서 부챗살로 뻗는다. 그대로 두면 그 부챗살이
                # 살결에 방사형 주름으로 비친다. 삼각형 배치를 델로네에 가깝게 다시 짠다.
                def beautify(fs):
                    es = list({e for f in fs for e in f.edges
                               if len(e.link_faces) == 2})
                    if es:
                        bmesh.ops.beautify_fill(bm, faces=fs, edges=es)

                beautify(reg)
                for _ in range(30):
                    bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5,
                                          use_axis_x=True, use_axis_y=True,
                                          use_axis_z=True)

                # 그냥 펴면 최소곡면이 되어 살결보다 우묵하게 들어간다(접시처럼 보인다).
                # 주위 곡률을 잇도록 테두리에서 멀어질수록 법선 방향으로 부풀린다.
                # 부푸는 양은 원통 근사의 활꼴 높이 — 반너비²/(2·팔 반지름 25mm).
                rim = list({v for _, lp in fill for e in lp for v in e.verts})
                bm.normal_update()
                dist = []
                for v in inner:
                    d = min((v.co - w.co).length for w in rim)
                    dist.append(d)
                dmax = max(dist) if dist else 0.0
                if dmax > 1.0:
                    sag = min(dmax * dmax / 50.0, 4.0) * 1.15   # 뒤에 펴면서 줄어든다
                    for v, d in zip(inner, dist):
                        t = d / dmax
                        v.co += v.normal * (sag * math.sin(t * math.pi / 2.0))
                    beautify([f for f in bm.faces
                              if all(v in set(inner) for v in f.verts)])
                    for _ in range(14):     # 남은 잔주름을 펴 준다
                        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.3,
                                              use_axis_x=True, use_axis_y=True,
                                              use_axis_z=True)
                    # 막이 살결과 만나는 자리를 테두리 안쪽에서만 펴면 그 선이 그대로
                    # 남는다. 테두리 바깥 세 겹까지 같이 펴서 이어지게 한다.
                    # **테두리는 붙들어 둔다.** 테두리까지 풀면 막이 안쪽으로 끌려가
                    # 속이 비친다(비치는 화소가 89 -> 924 로 늘었다). 바깥 세 겹까지
                    # 펴 봐도 멀쩡한 살결이 끌려와 주름만 생겼다. 둘 다 되돌렸다.
                    print("   넓은 구멍 %d 개: 정점 %d 개를 심고 가운데를 %.1fmm 부풀렸다"
                          % (len(wide), len(inner), sag))
                else:
                    print("   넓은 구멍 %d 개에 정점 %d 개를 심었다"
                          % (len(wide), len(inner)))
        bm.verts.index_update(); bm.edges.index_update(); bm.faces.index_update()
    for q, lp in sorted(fill, key=lambda x: -x[0]):
        vs = {v for e in lp for v in e.verts}
        xs = [v.co.x for v in vs]; ys = [v.co.y for v in vs]; zs = [v.co.z for v in vs]
        print("   메운 고리: 둘레 %6.1fmm  정점 %4d  크기 %.1f x %.1f x %.1f mm"
              % (q, len(vs), max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)))
    print("[피부 꿰매기] 고리 %d 개 — 메움 %d, 남김 %d (%s)"
          % (len(loops), len(fill), len(keep),
             ", ".join("%.0fmm" % q for q, _ in sorted(keep, key=lambda x: -x[0])[:4])))

    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.index_update(); bm.faces.index_update()

    # 메우면서 생긴 면에는 조각 번호가 없다. 옆 면에서 물려받는다.
    for _ in range(4):
        left = 0
        for f in bm.faces:
            if f[lay]:
                continue
            got = 0
            for e in f.edges:
                for g2 in e.link_faces:
                    if g2 is not f and g2[lay]:
                        got = g2[lay]; break
                if got: break
            if got:
                f[lay] = got
            else:
                left += 1
        if not left:
            break
    for f in bm.faces:
        if not f[lay]:
            f[lay] = 1

    newv = [[] for _ in grp]; newt = [[] for _ in grp]; idx = [{} for _ in grp]
    for f in bm.faces:
        pi = f[lay] - 1
        for v in f.verts:
            if v.index not in idx[pi]:
                idx[pi][v.index] = len(newv[pi])
                newv[pi].append((v.co.x, v.co.y, v.co.z))
            newt[pi].append(idx[pi][v.index])
    for pi, p in enumerate(grp):
        if newv[pi]:
            p["verts"] = newv[pi]
            p["tris"] = newt[pi]
    bm.free()


# 피부를 밖으로 밀어 올려 속을 덮는 처리는 뺐다. 조각을 제대로 꿰맨 뒤로는
# 속이 비치는 화소가 100만 개 중 86개(0.008%)뿐이라 밀 이유가 없고,
# 밀면 그 자리가 혹처럼 도드라졌다.

print("[기하] 부위 %d 개, 정점 %d, 삼각형 %d"
      % (len(parts), sum(len(p["verts"]) for p in parts),
         sum(len(p["tris"]) for p in parts) // 3))


# ─────────────────────────────────────────────────────────────
# 4. 내보내기
# ─────────────────────────────────────────────────────────────
# 좌표를 16비트로 양자화한다. 손목 전체가 15cm 이므로 15cm/65535 = 2.3 마이크로미터,
# 화면에서 필요한 정밀도보다 훨씬 곱다. 실수로 넣으면 용량이 두 배가 된다.

allv = [c for p in parts for v in p["verts"] for c in v]
lo = [min(allv[i::3]) for i in range(3)]
hi = [max(allv[i::3]) for i in range(3)]
span = [max(hi[i] - lo[i], 1e-6) for i in range(3)]

os.makedirs(OUT_DIR, exist_ok=True)
buf = bytearray()
meta = []

for p in parts:
    voff = len(buf)
    for v in p["verts"]:
        for i in range(3):
            q = int(round((v[i] - lo[i]) / span[i] * 65535.0))
            buf += struct.pack("<H", max(0, min(65535, q)))
    toff = len(buf)
    wide = len(p["verts"]) > 65535
    fmt = "<I" if wide else "<H"
    for t in p["tris"]:
        buf += struct.pack(fmt, t)
    meta.append({
        "name": p["name"],
        "layer": p["layer"],
        "vOff": voff, "vCount": len(p["verts"]),
        "tOff": toff, "tCount": len(p["tris"]),
        "wide": wide,
    })

with open(os.path.join(OUT_DIR, "wrist.bin"), "wb") as f:
    f.write(buf)

with open(os.path.join(OUT_DIR, "wrist.json"), "w", encoding="utf-8") as f:
    json.dump({
        "source": "Z-Anatomy (BodyParts3D 기반), CC BY-SA 4.0",
        "region": "오른쪽 손목",
        "unit": "mm",
        "quant": {"lo": lo, "span": span, "bits": 16},
        "layerOrder": LAYER_ORDER,
        "parts": meta,
        # 표지점도 같은 좌표계(mm, Y 가 위, 손목 중심이 원점)로 맞춰 둔다
        "landmarks": [{"name": m["name"],
                       "pos": [round(c, 2) for c in to_view(Vector(m["pos"]))]}
                      for m in landmarks],
    }, f, ensure_ascii=False, indent=1)

print("[내보냄] data/wrist.bin  %.2f MB" % (len(buf) / 1048576.0))
print("[내보냄] data/wrist.json %d 부위" % len(meta))
