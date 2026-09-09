# -*- coding: utf-8 -*-
"""
index.html 의 용어 사전에서 주장(기능·손상)을 뽑아 위험도별로 나눈다.

검증은 아무 데서나 시작하면 안 된다. 「요측수근굴근은 손목을 굽힌다」 같은 교과서
사실보다, 「가장 흔하다」·「10~15%」·고유명이 붙은 임상 주장이 훨씬 위험하다.
틀리면 사람이 잘못 배운다.
"""
import io
import json
import os
import re

S = io.open("index.html", encoding="utf-8").read()
BLK = S[S.index("var T={"):S.index("// 이름 끝의 좌우")]

# 한 항목: 'English name':{ko:'...', ...},
ENT = re.compile(r"'([^']+)':\{(.*?)\},\n", re.S)
FLD = lambda name, body: (
    re.search(r"\b" + name + r":'((?:[^'\\]|\\.)*)'", body).group(1)
    if re.search(r"\b" + name + r":'", body) else "")

rows = []
for m in ENT.finditer(BLK):
    en, body = m.group(1), m.group(2)
    rows.append({
        "en": en,
        "ko": FLD("ko", body),
        "la": FLD("la", body),
        "fn": FLD("fn", body),
        "inj": FLD("inj", body),
    })

EPONYM = ["콜리스", "스미스", "키엔벡", "드퀘르뱅", "베넷", "복서", "저지 핑거",
          "프로망", "바텐베르크", "테리 토머스", "SLAC", "마르티네-그루버",
          "헤버든", "뒤퓌트랑", "에섹스-로프레스티", "알렌", "핀켈스타인",
          "갈퀴손", "망치 손가락", "백조목", "소지구 망치", "교차 증후군",
          "기용관", "수근관 증후군", "척측 충돌", "원숭이손"]
STAT = ["가장 흔", "가장 많", "가장 드물", "%", "대부분", "드물다", "흔하다",
        "가장 크", "가장 먼저", "유일한"]

cat = {"고유명·증후군": [], "빈도·통계": [], "일반 서술": [], "설명 없음": []}
for r in rows:
    t = r["fn"] + " " + r["inj"] + " " + r["ko"]
    if any(e in t for e in EPONYM):
        cat["고유명·증후군"].append(r)
    elif any(e in t for e in STAT):
        cat["빈도·통계"].append(r)
    elif r["fn"] or r["inj"]:
        cat["일반 서술"].append(r)
    else:
        cat["설명 없음"].append(r)

print("전체 %d개 항목" % len(rows))
print("  기능 설명 있음 %d · 손상 설명 있음 %d"
      % (sum(1 for r in rows if r["fn"]), sum(1 for r in rows if r["inj"])))
print()
for k, v in cat.items():
    print("%-14s %3d개" % (k, len(v)))

print("\n=== 1순위: 고유명·증후군이 걸린 항목 ===")
for r in cat["고유명·증후군"]:
    print("   " + r["ko"])

print("\n=== 2순위: 빈도·통계 주장 ===")
for r in cat["빈도·통계"]:
    print("   " + r["ko"])

os.makedirs("out", exist_ok=True)
with io.open("out/claims.json", "w", encoding="utf-8") as f:
    json.dump({"rows": rows,
               "priority": {k: [r["en"] for r in v] for k, v in cat.items()}},
              f, ensure_ascii=False, indent=1)
print("\n→ out/claims.json 저장")
