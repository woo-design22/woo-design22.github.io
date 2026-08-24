# -*- coding: utf-8 -*-
"""
여러 감각 입력(설탕·쓴맛·물·청각 JON)에 대한 전뇌 LIF 반응을 돌리고, 브라우저 앱용 통합 부분 회로를 내보낸다.

    python run_multi.py --trials 10 --procs 4

결과: results/multi_summary.json  (설탕 30회 결과 sugarR_200Hz_x30.parquet 는 이미 있어야 함)
"""
import argparse
import json
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
from run_sugar import PATH_COMP, PATH_CON, PATH_RES, build_names, NEU_SUGAR, MN9  # noqa: E402

L = json.load(open(HERE / 'results' / 'neuron_lists.json'))
GROUPS = {                                   # 입력 그룹: 이름 → (FlyWire ID 목록, 한국어 이름)
    'sugar': (NEU_SUGAR, '설탕 감지'),
    'bitter': (L['neu_bitter'], '쓴맛 감지'),
    'water': (L['neu_water'], '물 감지'),
    'jon': (L['neu_JON_CE'] + L['neu_JON_F'] + L['neu_JON_D_m'], '더듬이 진동(JON)'),
}
SPECIAL = {                                  # 행동을 읽는 출력 뉴런
    MN9_id: nm for MN9_id, nm in MN9.items()
}
SPECIAL.update({L['id_aBN1']: 'aBN1', L['id_DN1_1']: 'DN1', L['id_DN2_l']: 'DN2'})
KIND_OF = {L['id_aBN1']: 'groom', L['id_DN1_1']: 'groom', L['id_DN2_l']: 'groom'}
for k in MN9: KIND_OF[k] = 'motor'

CONDS = [  # (실험 이름, 자극 그룹, Hz)
    ('sugarR_200Hz_x30', 'sugar', 200),
    ('bitter_200Hz', 'bitter', 200),
    ('water_200Hz', 'water', 200),
    ('jon_200Hz', 'jon', 200),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--trials', type=int, default=10)
    ap.add_argument('--procs', type=int, default=4)
    args = ap.parse_args()

    rates = {}   # cond key -> Series(flyid -> Hz)
    spikes_sugar = None
    for exp, grp, hz in CONDS:
        params = dict(default_params)
        n_run = 30 if exp.startswith('sugarR') else args.trials
        params['n_run'] = n_run
        params['r_poi'] = hz * Hz
        t0 = time.time()
        run_exp(exp_name=exp, neu_exc=GROUPS[grp][0], params=params,
                path_res=str(PATH_RES), path_comp=str(PATH_COMP), path_con=str(PATH_CON), n_proc=args.procs)
        df_spike = utl.load_exps([str(PATH_RES / f'{exp}.parquet')])
        df_rate, _ = utl.get_rate(df_spike, t_run=1.0, n_run=n_run)
        rates[grp] = df_rate[exp]
        print(f'{exp}: {len(df_spike)} spikes, {int((df_rate[exp] > 0).sum())} active, {time.time() - t0:.0f}s', flush=True)
        if grp == 'sugar':
            spikes_sugar = df_spike[df_spike['trial'] == 0]

    names = build_names()
    for fid, nm in SPECIAL.items(): names[fid] = nm
    df_comp = pd.read_csv(PATH_COMP, index_col=0)
    flyid2i = {fid: i for i, fid in enumerate(df_comp.index)}
    df_con = pd.read_parquet(PATH_CON)

    node_ids = set()
    for grp, r in rates.items(): node_ids |= {int(f) for f in r.index if r.loc[f] > 0}
    for grp, (ids, _) in GROUPS.items(): node_ids |= set(ids)
    node_ids |= set(SPECIAL)
    node_ids = sorted(node_ids)
    pos = {fid: k for k, fid in enumerate(node_ids)}
    keep = {flyid2i[f] for f in node_ids}
    i2fid = {flyid2i[f]: f for f in node_ids}
    sub = df_con[df_con['Presynaptic_Index'].isin(keep) & df_con['Postsynaptic_Index'].isin(keep)]
    edges = [[pos[i2fid[int(a)]], pos[i2fid[int(b)]], int(w)] for a, b, w in
             sub[['Presynaptic_Index', 'Postsynaptic_Index', 'Excitatory x Connectivity']].itertuples(index=False)]

    group_of = {}
    for grp, (ids, _) in GROUPS.items():
        for f in ids: group_of[f] = grp
    # 홉: 모든 입력에서 흥분성 연결만 따라 BFS (레이아웃용)
    adj = {}
    for a, b, w in edges:
        if w > 0: adj.setdefault(a, []).append(b)
    hop = {pos[f]: 0 for f in group_of}
    frontier = list(hop)
    while frontier:
        nxt = []
        for u in frontier:
            for v in adj.get(u, []):
                if v not in hop: hop[v] = hop[u] + 1; nxt.append(v)
        frontier = nxt

    nodes = []
    for fid in node_ids:
        nodes.append({
            'id': str(fid), 'name': names.get(fid, ''),
            'kind': 'input' if fid in group_of else KIND_OF.get(fid, 'other'),
            'group': group_of.get(fid, ''),
            'hop': hop.get(pos[fid], -1),
            'rates': {g: round(float(r.loc[fid]), 1) if fid in r.index else 0.0 for g, r in rates.items()},
        })
        nodes[-1]['rate'] = nodes[-1]['rates']['sugar']
    spikes = {}
    for fid, g in spikes_sugar.groupby('flywire_id'):
        k = pos.get(int(fid))
        if k is not None: spikes[str(k)] = sorted(int(round(float(t) * 10000)) for t in g['t'])

    out = {
        'source': 'Shiu et al. 2024 Nature (doi:10.1038/s41586-024-07763-9), FlyWire v630; LIF model run locally with Brian2',
        'exp_name': 'multi', 'n_trials': 30, 'stim_hz': 200, 't_run_ms': 1000,
        'groups': {g: {'label': lab, 'n': len(ids), 'trials': 30 if g == 'sugar' else args.trials} for g, (ids, lab) in GROUPS.items()},
        'nodes': nodes, 'edges': edges, 'spikes_trial0': spikes,
    }
    p = PATH_RES / 'multi_summary.json'
    p.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    print(f'union: {len(nodes)} neurons, {len(edges)} connections -> {p}')
    for g, r in rates.items():
        for fid, nm in SPECIAL.items():
            v = float(r.loc[fid]) if fid in r.index else 0.0
            if v: print(f'  {g:7s} {nm:6s} {v:6.1f} Hz')


if __name__ == '__main__':
    main()
