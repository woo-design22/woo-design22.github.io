# -*- coding: utf-8 -*-
"""
Z-Anatomy 손목을 Blender 로 렌더한다(②번 길).

    blender --background <Startup.blend> --python render_blender.py -- [옵션]
      --frames 600     찍을 프레임 수
      --w 1280 --h 720 크기
      --engine eevee   eevee | cycles
      --samples 32     표본 수
      --test 1         3장만 찍어 보고 끝낸다(재질·조명 확인용)

**카메라 경로는 뷰어(index.html)의 anim(t) 와 같은 식을 쓴다.** 그래야 ①로 흐름을
잡아 놓고 그대로 ②로 갈아 끼울 수 있다. 한쪽만 고치면 그 순간 둘이 갈라진다.

층 벗기기는 hide_render 를 키프레임으로 껐다 켜서 만든다.
"""

import bpy
import math
import os
import sys
from collections import defaultdict
from mathutils import Vector

# ── 인자 ─────────────────────────────────────────────────────
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(name, default):
    if name in argv:
        return argv[argv.index(name) + 1]
    return default


FRAMES = int(opt("--frames", 600))
RW = int(opt("--w", 1280))
RH = int(opt("--h", 720))
ENGINE = opt("--engine", "eevee")
SAMPLES = int(opt("--samples", 32))
TEST = opt("--test", "0") == "1"

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "blender")
os.makedirs(OUT, exist_ok=True)

# ── 뷰어와 공유하는 규칙 ─────────────────────────────────────
ANCHOR = "Scaphoid bone.r"
REGION_R = 0.075
SCALE = 1000.0                      # m -> mm (뷰어와 같다)
LANDMARK_SUFFIX = ".j"
DROP_EXACT = {"Abduction", "Distal", "Proximal", "Dorsal", "Palmar",
              "Coronal planes", "BezierCircle'"}
DROP_SUFFIX = (".g",)
CURVE_BEVEL = {"3_천부맥관": 0.0009, "6_심부맥관": 0.0011}

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
LAYER_ORDER = ["1_피부표면", "2_근막", "3_천부맥관", "4_힘줄지지대",
               "5_근육", "6_심부맥관", "7_인대관절낭", "8_뼈"]


def classify(name):
    if name in DROP_EXACT or name.endswith(DROP_SUFFIX):
        return None
    low = name.lower()
    if low.endswith(".l") or (low.endswith("l") and low[-3:-1] in (".e", ".o")):
        return None
    if name.endswith(LANDMARK_SUFFIX):
        return None
    for layer, pats in RULES:
        for p in pats:
            if p in low:
                return layer
    return None


def world_bbox(o):
    pts = [o.matrix_world @ Vector(c[:]) for c in o.bound_box]
    xs = [p.x for p in pts]; ys = [p.y for p in pts]; zs = [p.z for p in pts]
    return min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)


# ── 대상 고르기 ──────────────────────────────────────────────
anchor = bpy.data.objects.get(ANCHOR)
if anchor is None:
    raise SystemExit("기준점 '%s' 를 못 찾았다." % ANCHOR)
ab = world_bbox(anchor)
CX, CY, CZ = (ab[0]+ab[3])/2, (ab[1]+ab[4])/2, (ab[2]+ab[5])/2
box = (CX-REGION_R, CY-REGION_R, CZ-REGION_R, CX+REGION_R, CY+REGION_R, CZ+REGION_R)


def in_region(o):
    try:
        b = world_bbox(o)
    except Exception:
        return False
    return not (b[3] < box[0] or b[0] > box[3] or
                b[4] < box[1] or b[1] > box[4] or
                b[5] < box[2] or b[2] > box[5])


picked = defaultdict(list)
for o in bpy.data.objects:
    if o.type not in ("MESH", "CURVE"):
        continue
    L = classify(o.name)
    if L and in_region(o):
        picked[L].append(o)

print("[고름]", {k: len(v) for k, v in picked.items()})

# 커브(신경·혈관)에 굵기를 준다 — 뷰어와 같은 값
for L, objs in picked.items():
    d = CURVE_BEVEL.get(L)
    for o in objs:
        if o.type == "CURVE":
            if d and not o.data.bevel_depth:
                o.data.bevel_depth = d
                o.data.bevel_resolution = 2
            o.data.resolution_u = 3

# ── 화면에서 다 치우고 우리 것만 남긴다 ──────────────────────
# 7,184개를 전부 켜 두면 사람 전체가 나온다. 렌더도 느려진다.
for o in bpy.data.objects:
    o.hide_render = True
    o.hide_viewport = True

keep = set()
for L in LAYER_ORDER:
    for o in picked[L]:
        o.hide_render = False
        o.hide_viewport = False
        keep.add(o.name)

# ── 재질 ─────────────────────────────────────────────────────
# 층마다 하나씩. 실제 조직에 가깝게 — 근육은 젖은 짙은 적갈색,
# 힘줄·인대는 흰빛 도는 상아색에 광택, 근막은 비친다.
def mat(name, base, rough, sss=0.0, alpha=1.0, spec=0.5, sss_col=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (base[0], base[1], base[2], 1)
    b.inputs["Roughness"].default_value = rough
    for key, val in (("Specular IOR Level", spec), ("Specular", spec)):
        if key in b.inputs:
            b.inputs[key].default_value = val
            break
    if sss > 0:
        for key in ("Subsurface Weight", "Subsurface"):
            if key in b.inputs:
                b.inputs[key].default_value = sss
                break
        c = sss_col or base
        if "Subsurface Radius" in b.inputs:
            b.inputs["Subsurface Radius"].default_value = (c[0]*0.02, c[1]*0.01, c[2]*0.008)
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, "blend_method") else m.blend_method
        try:
            m.show_transparent_back = False
        except Exception:
            pass
    return m


MATS = {
    "1_피부표면":   mat("피부",   (0.780, 0.520, 0.420), 0.45, sss=0.30),
    "2_근막":       mat("근막",   (0.930, 0.918, 0.880), 0.30, alpha=0.32, spec=0.7),
    "3_천부맥관":   mat("천부정맥", (0.180, 0.290, 0.520), 0.28, spec=0.6),
    "4_힘줄지지대": mat("힘줄",   (0.940, 0.925, 0.880), 0.24, sss=0.10, spec=0.75),
    "5_근육":       mat("근육",   (0.420, 0.075, 0.065), 0.30, sss=0.35, spec=0.65,
                        sss_col=(0.9, 0.25, 0.2)),
    "7_인대관절낭": mat("인대",   (0.880, 0.830, 0.700), 0.32, sss=0.08, spec=0.6),
    "8_뼈":         mat("뼈",     (0.930, 0.905, 0.845), 0.40, sss=0.12),
}
MAT_NERVE  = mat("신경",   (0.900, 0.820, 0.430), 0.38, sss=0.12)
MAT_ARTERY = mat("동맥",   (0.620, 0.090, 0.075), 0.26, spec=0.7)
MAT_VEIN   = mat("정맥",   (0.180, 0.290, 0.520), 0.28, spec=0.6)


def pick_mat(name, layer):
    n = name.lower()
    if layer in ("3_천부맥관", "6_심부맥관"):
        if "nerve" in n:
            return MAT_NERVE
        if "vein" in n or "venous" in n:
            return MAT_VEIN
        if "arter" in n or "arch" in n or "anastom" in n:
            return MAT_ARTERY
        return MAT_ARTERY
    return MATS[layer]


for L in LAYER_ORDER:
    for o in picked[L]:
        m = pick_mat(o.name, L)
        o.data.materials.clear()
        o.data.materials.append(m)
        # 원본은 슬롯이 두 개고 면이 1번을 가리키는 것이 있다. 그대로 두면
        # 우리 재질(0번)이 안 먹어 회색으로 나온다.
        if o.type == 'MESH':
            for pg in o.data.polygons:
                pg.material_index = 0

# ── 층 벗기기를 키프레임으로 ─────────────────────────────────
# 층 i 는 프레임 SEG*(i+1) 부터 사라진다. 뷰어의 seg=floor(t*8) 과 같은 계산이다.
SEG = FRAMES / float(len(LAYER_ORDER))
for i, L in enumerate(LAYER_ORDER):
    off = int(round(SEG * (i + 1)))
    for o in picked[L]:
        o.hide_render = False
        o.keyframe_insert("hide_render", frame=1)
        if off <= FRAMES:
            o.hide_render = False
            o.keyframe_insert("hide_render", frame=max(1, off - 1))
            o.hide_render = True
            o.keyframe_insert("hide_render", frame=off)
        o.hide_render = False
    # 뷰포트도 같이 (배경 실행에선 안 쓰이지만 열어 볼 때 헷갈리지 않게)

# ── 카메라 (뷰어의 anim(t) 와 같은 식) ───────────────────────
def view_to_blender(vx, vy, vz):
    """뷰어 좌표(mm, Y가 위, 손목 중심이 원점) -> 블렌더 월드(m)"""
    return (CX + vx / SCALE, CY - vz / SCALE, CZ + vy / SCALE)


def cam_at(t):
    az = -1.35 + t * 4.6
    el = 0.16 + 0.26 * math.sin(t * math.pi * 2)
    dist = 252 - 46 * math.sin(t * math.pi)
    vx = dist * math.cos(el) * math.sin(az)
    vy = dist * math.sin(el)
    vz = dist * math.cos(el) * math.cos(az)
    return view_to_blender(vx, vy, vz)


cam_data = bpy.data.cameras.new("cam")
# **렌즈 mm 로 적으면 안 된다.** 뷰어는 persp(0.72, ...) 로 세로 화각이 0.72 라디안(41도)이다.
# 42mm 라고 적었더니 센서 기준 세로 27도가 되어 손목이 화면 밖으로 밀려났다.
# 화각을 직접 맞춰야 ①과 ②의 구도가 같아진다.
cam_data.sensor_fit = 'VERTICAL'
cam_data.angle_y = 0.72
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.scene.collection.objects.link(cam)
cam.hide_render = False

target = bpy.data.objects.new("target", None)
bpy.context.scene.collection.objects.link(target)
target.location = (CX, CY, CZ)
target.hide_render = True
tr = cam.constraints.new('TRACK_TO')
tr.target = target
tr.track_axis = 'TRACK_NEGATIVE_Z'
tr.up_axis = 'UP_Y'

for f in range(1, FRAMES + 1):
    t = (f - 1) / float(FRAMES)
    cam.location = cam_at(t)
    cam.keyframe_insert("location", frame=f)

bpy.context.scene.camera = cam

# ── 조명 ─────────────────────────────────────────────────────
# 해부 그림은 대비가 너무 세면 형태가 뭉개진다. 주광 + 보조광 + 뒤광 셋.
def area(name, loc, energy, size):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = energy
    d.size = size
    ob = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = view_to_blender(*loc)
    c = ob.constraints.new('TRACK_TO')
    c.target = target
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'
    return ob


# **세기 단위에 주의.** 조명 자리는 뷰어 좌표(mm)로 적고 1000 을 나눠 옮기므로
# 실제 거리가 0.4m 안팎이다. 여기에 수십 W 를 때리면 전부 하얗게 날아간다
# (처음에 90W 로 두었다가 화면이 통째로 백지가 됐다). 이 거리에서는 한 자릿수가 맞다.
LIGHT = float(opt("--light", 1.0))
area("key",  (180, 220, 260), 30.0 * LIGHT, 0.25)
area("fill", (-260, 60, 120), 11.0 * LIGHT, 0.35)
area("rim",  (-60, 180, -280), 18.0 * LIGHT, 0.20)

# Z-Anatomy 의 Startup.blend 는 **해부 도해용 선화 템플릿**이다.
# Freestyle 이 켜져 있어 그냥 렌더하면 표면 없는 선 그림이 나온다(실측으로 확인).
sc0 = bpy.context.scene
sc0.render.use_freestyle = False
for vlx in sc0.view_layers:
    vlx.use_freestyle = False

# **합성(컴포지터)도 꺼야 한다.** 이 템플릿은 도해용 합성 트리를 갖고 있어서,
# 켜 둔 채로는 조명을 어떻게 바꾸든 최종 그림이 그 트리를 거쳐 나온다
# (조명을 10분의 1로 줄였는데 결과가 한 픽셀도 안 바뀌어서 찾아냈다).
sc0.render.use_compositing = False
sc0.render.use_sequencer = False
try:
    sc0.use_nodes = False
except Exception:
    pass
print("[파이프라인] freestyle=%s compositing=%s sequencer=%s"
      % (sc0.render.use_freestyle, sc0.render.use_compositing,
         sc0.render.use_sequencer))

# 월드는 노드 이름을 믿지 말고 새로 만들어 붙인다 — 템플릿의 이름이 다를 수 있다.
world = bpy.data.worlds.new("어두운 배경")
sc0.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
bgn = nt.nodes.new("ShaderNodeBackground")
bgn.inputs[0].default_value = (0.035, 0.042, 0.052, 1)
bgn.inputs[1].default_value = 0.9
outn = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(bgn.outputs[0], outn.inputs[0])

# Filmic 은 색을 눌러 회색으로 만든다. 해부 색을 정한 대로 보려면 Standard 가 맞다.
for vt in ('Standard', 'AgX', 'Filmic'):
    try:
        sc0.view_settings.view_transform = vt
        break
    except TypeError:
        continue
print("[색관리]", sc0.view_settings.view_transform, "· freestyle", sc0.render.use_freestyle)

# ── 렌더 설정 ────────────────────────────────────────────────
sc = bpy.context.scene
sc.render.resolution_x = RW
sc.render.resolution_y = RH
sc.render.resolution_percentage = 100
sc.render.fps = 30
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGB'
sc.render.film_transparent = False

if ENGINE == "cycles":
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
else:
    # Blender 4.2+ 는 EEVEE Next 다. 이름이 판마다 다르므로 있는 것을 쓴다.
    for name in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            sc.render.engine = name
            break
        except TypeError:
            continue
    ee = getattr(sc, "eevee", None)
    if ee:
        for k, v in (("taa_render_samples", max(16, SAMPLES)),
                     ("use_raytracing", True),
                     ("use_shadows", True)):
            if hasattr(ee, k):
                setattr(ee, k, v)

# 중간부터 이어 찍을 수 있게 한다. 긴 렌더는 도중에 끊기기 마련이라
# 처음부터 다시 돌리면 몇 시간을 버린다.
START = int(opt("--start", 1))
sc.frame_start = START
sc.frame_end = FRAMES

# **템플릿이 frame_step 을 2 로 두고 있다.** 그대로 두면 한 장 걸러 한 장씩만 찍혀
# 홀수 프레임만 남는다(실제로 그래서 600장 중 378장만 나왔다).
sc.frame_step = 1

# 이미 있는 프레임은 건너뛴다. 긴 렌더가 끊겼을 때 처음부터 다시 돌리지 않으려는 것.
sc.render.use_overwrite = False
sc.render.use_placeholder = False
print("[프레임] %d~%d · step %d · 덮어쓰기 %s"
      % (sc.frame_start, sc.frame_end, sc.frame_step, sc.render.use_overwrite))
if START > 1:
    print("[이어찍기] %d 번 프레임부터" % START)
sc.render.filepath = os.path.join(OUT, "f")
sc.render.use_file_extension = True

print("[설정] %dx%d · %s · %d프레임 · 표본 %d"
      % (RW, RH, sc.render.engine, FRAMES, SAMPLES))

def stats(path):
    """눈으로 짐작하지 말고 숫자로 본다. 날아갔는지(하양) 죽었는지(검정)를 바로 안다."""
    img = bpy.data.images.load(path)
    px = list(img.pixels)
    n = len(px) // 4
    tot = hot = dark = 0.0
    for i in range(0, len(px), 4):
        v = (px[i] + px[i+1] + px[i+2]) / 3.0
        tot += v
        if v > 0.97:
            hot += 1
        elif v < 0.06:
            dark += 1
    bpy.data.images.remove(img)
    return {"평균": round(tot / n, 3),
            "날아감%": round(hot / n * 100, 1),
            "어두움%": round(dark / n * 100, 1)}


if TEST:
    for f in (1, FRAMES // 2, FRAMES - 1):
        sc.frame_set(max(1, f))
        sc.render.filepath = os.path.join(OUT, "test_%04d" % f)
        bpy.ops.render.render(write_still=True)
        p = os.path.join(OUT, "test_%04d.png" % f)
        print("[시험] 프레임 %d ->" % f, stats(p))
    print("[끝] 시험 3장. 평균이 0.10~0.30, 날아감이 3%% 아래면 적당하다.")
else:
    bpy.ops.render.render(animation=True)
    print("[끝] %d 프레임을 %s 에 저장" % (FRAMES, OUT))
