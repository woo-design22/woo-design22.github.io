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
DECIMATE = {"5_근육": 0.45}

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
        # 감량이 필요한 층이면 모디파이어를 얹고 평가한다
        mod = None
        if ratio and o.type == "MESH" and len(o.data.vertices) > 400:
            mod = o.modifiers.new("dec", "DECIMATE")
            mod.ratio = ratio

        # 커브든 메시든 평가된 결과를 메시로 받는다(커브는 bevel 이 얹힌 관이 나온다)
        ev = o.evaluated_get(depsgraph)
        me = bpy.data.meshes.new_from_object(ev)
        if mod:
            o.modifiers.remove(mod)

        if me is None or not me.polygons:
            if me is not None:
                bpy.data.meshes.remove(me)
            dropped.append(o.name)
            continue

        me.transform(o.matrix_world)
        bm = bmesh.new()
        bm.from_mesh(me)
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
