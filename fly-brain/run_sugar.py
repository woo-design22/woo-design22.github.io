# -*- coding: utf-8 -*-
"""
초파리 전뇌 LIF 모델(Shiu et al. 2024, Nature)로 '설탕 감지 뉴런 자극 → 주둥이 운동뉴런(MN9) 발화' 실험을 재현한다.

사용법 (flybrain conda 환경):
    python run_sugar.py --trials 1          # 시간 측정용 1회
    python run_sugar.py --trials 30         # 논문과 같은 30회
    python run_sugar.py --trials 10 --freq 100

결과:
    results/<exp>.parquet        모든 스파이크 (모델 원본 출력)
    results/<exp>_rates.csv      뉴런별 평균 발화율(Hz)
    results/<exp>_summary.json   브라우저 시각화 앱용 부분 회로 + 1회차 스파이크 시각
"""
import argparse
import json
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
MODEL = HERE / 'model'
sys.path.insert(0, str(MODEL))

from brian2 import Hz, ms  # noqa: E402
from model import run_exp, default_params  # noqa: E402
import utils as utl  # noqa: E402

# 논문(FlyWire v630)과 같은 데이터를 쓴다. v783은 ID가 일부 달라 논문 ID 목록과 맞지 않는다.
PATH_COMP = MODEL / '2023_03_23_completeness_630_final.csv'
PATH_CON = MODEL / '2023_03_23_connectivity_630_final.parquet'
PATH_RES = HERE / 'results'

# 오른쪽 반구 순판(labellum) 설탕 감지 미각수용뉴런 21개 — example.ipynb / figures.ipynb 그대로
NEU_SUGAR = [
    720575940624963786, 720575940630233916, 720575940637568838, 720575940638202345, 720575940617000768,
    720575940630797113, 720575940632889389, 720575940621754367, 720575940621502051, 720575940640649691,
    720575940639332736, 720575940616885538, 720575940639198653, 720575940620900446, 720575940617937543,
    720575940632425919, 720575940633143833, 720575940612670570, 720575940628853239, 720575940629176663,
    720575940611875570,
]
# 주둥이(proboscis) 뻗기 운동뉴런 MN9 — 왼쪽/오른쪽
MN9 = {720575940660219265: 'MN9_L', 720575940645521262: 'MN9_R'}


def build_names():
    """FlyWire ID → 사람이 읽을 이름. 설탕 GRN, MN9, 그리고 저자들이 이름 붙인 SEZ 뉴런(sez_neurons.pickle)."""
    names = {f: f'sugar_{i + 1}' for i, f in enumerate(NEU_SUGAR)}
    names.update(MN9)
    with open(MODEL / 'sez_neurons.pickle', 'rb') as fh:
        sez = pickle.load(fh)
    for typ, ids in sez.items():
        for k, fid in enumerate(ids):
            names.setdefault(fid, f'{typ}_{k + 1}' if len(ids) > 1 else typ)
    return names


def export_subgraph(df_spike, df_rate, exp_name, names, t_run_s, params):
    """발화한 뉴런 + 설탕 GRN으로 이루어진 부분 회로를 JSON으로 내보낸다 (브라우저 앱용)."""
    df_comp = pd.read_csv(PATH_COMP, index_col=0)
    flyid2i = {fid: i for i, fid in enumerate(df_comp.index)}
    df_con = pd.read_parquet(PATH_CON)

    active = [int(f) for f in df_rate.index if df_rate.loc[f, exp_name] > 0]
    node_ids = sorted(set(active) | set(NEU_SUGAR) | set(MN9))
    idx = {fid: flyid2i[fid] for fid in node_ids}
    i2fid = {v: k for k, v in idx.items()}
    keep = set(idx.values())

    sub = df_con[df_con['Presynaptic_Index'].isin(keep) & df_con['Postsynaptic_Index'].isin(keep)]
    edges = [
        [i2fid[int(r.Presynaptic_Index)], i2fid[int(r.Postsynaptic_Index)], int(r._3)]
        for r in sub[['Presynaptic_Index', 'Postsynaptic_Index', 'Excitatory x Connectivity']].itertuples()
    ]

    nodes = []
    for fid in node_ids:
        rate = float(df_rate.loc[fid, exp_name]) if fid in df_rate.index else 0.0
        nodes.append({
            'id': str(fid),
            'name': names.get(fid, ''),
            'rate': round(rate, 1),
            'kind': 'input' if fid in NEU_SUGAR else ('motor' if fid in MN9 else 'other'),
        })
    pos = {str(fid): k for k, fid in enumerate(node_ids)}   # flywire id -> 노드 배열 인덱스

    # 설탕 GRN에서의 최단 홉 수 (흥분성 연결만 따라감, 레이아웃용)
    adj = {}
    for a, b, w in edges:
        if w > 0:
            adj.setdefault(str(a), []).append(str(b))
    hop = {str(f): 0 for f in NEU_SUGAR}
    frontier = list(hop)
    while frontier:
        nxt = []
        for u in frontier:
            for v in adj.get(u, []):
                if v not in hop:
                    hop[v] = hop[u] + 1
                    nxt.append(v)
        frontier = nxt
    for n in nodes:
        n['hop'] = hop.get(n['id'], -1)

    # 1회차(trial 0) 스파이크 시각 — 0.1ms 단위 정수, 노드 인덱스별 배열
    t0 = df_spike[(df_spike['exp_name'] == exp_name) & (df_spike['trial'] == 0)]
    spikes = {}
    for fid, g in t0.groupby('flywire_id'):
        k = pos.get(str(int(fid)))
        if k is not None:
            spikes[str(k)] = sorted(int(round(float(t) * 10000)) for t in g['t'])

    out = {
        'source': 'Shiu et al. 2024 Nature (doi:10.1038/s41586-024-07763-9), FlyWire v630; LIF model run locally with Brian2',
        'exp_name': exp_name,
        'n_trials': int(params['n_run']),
        'stim_hz': int(params['r_poi'] / Hz),
        't_run_ms': int(t_run_s * 1000),
        'params': {k: str(v) for k, v in params.items() if k not in ('eqs', 'eq_th', 'eq_rst')},
        'nodes': nodes,
        'edges': [[pos[str(a)], pos[str(b)], w] for a, b, w in edges],   # [pre_idx, post_idx, signed synapse count]
        'spikes_trial0': spikes,
    }
    p = PATH_RES / f'{exp_name}_summary.json'
    p.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    print(f'    Subgraph: {len(nodes)} neurons, {len(edges)} connections, '
          f'{sum(len(v) for v in spikes.values())} spikes in trial 0 -> {p}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--trials', type=int, default=1)
    ap.add_argument('--freq', type=int, default=200, help='설탕 GRN 자극 주파수(Hz)')
    ap.add_argument('--procs', type=int, default=3, help='병렬 프로세스 수 (각각 전체 모델을 메모리에 올림)')
    ap.add_argument('--name', default=None)
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    params = dict(default_params)
    params['n_run'] = args.trials
    params['r_poi'] = args.freq * Hz
    exp_name = args.name or f'sugarR_{args.freq}Hz_x{args.trials}'
    PATH_RES.mkdir(exist_ok=True)

    t0 = time.time()
    run_exp(exp_name=exp_name, neu_exc=NEU_SUGAR, params=params,
            path_res=str(PATH_RES), path_comp=str(PATH_COMP), path_con=str(PATH_CON),
            n_proc=args.procs, force_overwrite=args.force)
    print(f'    Wall time incl. setup: {time.time() - t0:.0f} s')

    names = build_names()
    df_spike = utl.load_exps([str(PATH_RES / f'{exp_name}.parquet')])
    t_run_s = float(params['t_run'] / ms) / 1000
    df_rate, df_std = utl.get_rate(df_spike, t_run=t_run_s, n_run=args.trials, flyid2name=names)
    df_rate = df_rate.sort_values(exp_name, ascending=False)
    df_rate.to_csv(PATH_RES / f'{exp_name}_rates.csv')

    n_spk = len(df_spike)
    n_act = int((df_rate[exp_name] > 0).sum())
    print(f'\n=== {exp_name}: {n_spk} spikes, {n_act} active neurons (of {127400}) ===')
    print('Top 25 by firing rate (Hz):')
    print(df_rate.head(25).to_string())
    print('\nProboscis motor neurons:')
    for fid, nm in MN9.items():
        r = float(df_rate.loc[fid, exp_name]) if fid in df_rate.index else 0.0
        s = float(df_std.loc[fid, exp_name]) if fid in df_std.index else 0.0
        print(f'  {nm} ({fid}): {r:.1f} ± {s:.1f} Hz')

    export_subgraph(df_spike, df_rate, exp_name, names, t_run_s, params)


if __name__ == '__main__':
    main()
