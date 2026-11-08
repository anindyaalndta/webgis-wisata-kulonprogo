# -*- coding: utf-8 -*-
"""
Validasi silang: perhitungan SAW + penyaringan + rute dihitung ULANG secara independen dengan numpy
(tidak memakai kode JavaScript) lalu dibandingkan dengan keluaran sistem (tests/out/scenarios_js.json).
Jalankan: python tests/cross_check.py
"""
import json, os, math
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
wis = json.load(open(os.path.join(ROOT, 'data', 'wisata.geojson'), encoding='utf-8'))
M = json.load(open(os.path.join(ROOT, 'data', 'matriks_osrm.json')))
scen = json.load(open(os.path.join(ROOT, 'tests', 'out', 'scenarios_js.json'), encoding='utf-8'))
D = [f['properties'] for f in wis['features']]
idx = {i: k for k, i in enumerate(M['ids'])}
dur = np.array(M['dur'], float)
SIFAT = ['cost', 'cost', 'benefit', 'benefit']

laporan = []
semua_ok = True
for s in scen:
    p, o = s['params'], idx[s['asal_id']]
    # --- penyaringan
    lolos = []
    for d in D:
        t = dur[o, idx[d['id']]]
        if not d['in_scope'] and not p.get('sertakanLuar'):
            continue
        if p['kategori'] != 'semua' and d['kategori'] != p['kategori']:
            continue
        if p['ratingMin'] > 0 and (d['rating'] is None or d['rating'] < p['ratingMin']):
            continue
        if p['anggaran'] is not None and d['biaya_rp'] > p['anggaran']:
            continue
        if p['jamMaks'] is not None:
            butuh = t / 3600 + d['durasi_jam'] + (t / 3600 if p.get('pulang') else 0)
            if butuh > p['jamMaks'] + 1e-9:
                continue
        lolos.append((d, t))
    # --- SAW (matriks keputusan -> normalisasi -> preferensi)
    X = np.array([[max(1.0, t / 60), d['biaya_skala'], d['rating'] or 0.0, math.log1p(d['ulasan'] or 0)] for d, t in lolos])
    w = np.array(s['bobot'], float); w = w / w.sum()
    Rm = np.zeros_like(X)
    for j in range(4):
        if SIFAT[j] == 'cost':
            Rm[:, j] = X[:, j].min() / X[:, j]
        else:
            Rm[:, j] = X[:, j] / X[:, j].max() if X[:, j].max() > 0 else 0
    V = Rm @ w
    order = sorted(range(len(lolos)), key=lambda i: (-V[i], -(lolos[i][0]['ulasan'] or 0), lolos[i][0]['id']))
    ids_py = [lolos[i][0]['id'] for i in order]
    V_py = {lolos[i][0]['id']: V[i] for i in range(len(lolos))}
    # --- rute nearest neighbour atas 10 teratas
    pool = order[:10]
    cur, t_tot, biaya, rute = None, 0.0, 0, []
    batas = p['jamMaks'] * 3600 if p['jamMaks'] is not None else float('inf')
    angg = p['anggaran'] if p['anggaran'] is not None else float('inf')
    sisa = list(pool)
    while sisa and len(rute) < p['maksPemberhentian']:
        kand = sorted(sisa, key=lambda i: ((dur[idx[cur], idx[lolos[i][0]['id']]] if cur else lolos[i][1]), order.index(i)))
        pilih = None
        for i in kand:
            d, t0 = lolos[i]
            leg = dur[idx[cur], idx[d['id']]] if cur else t0
            back = t0 if p.get('pulang') else 0
            if t_tot + leg + d['durasi_jam'] * 3600 + back <= batas + 1e-6 and biaya + d['biaya_rp'] <= angg:
                pilih = (i, leg); break
        if not pilih:
            break
        i, leg = pilih
        d = lolos[i][0]
        rute.append(d['id']); t_tot += leg + d['durasi_jam'] * 3600; biaya += d['biaya_rp']; cur = d['id']
        sisa.remove(i)
    # --- bandingkan
    V_js = {r['id']: r['V'] for r in s['peringkat']}
    ids_js = [r['id'] for r in s['peringkat']]
    maxdiff = max(abs(V_js[k] - V_py[k]) for k in V_py) if V_py else 0.0
    ok = (ids_js == ids_py) and maxdiff < 1e-12 and (rute == s['rute']) and len(lolos) == s['n_lolos']
    semua_ok &= ok
    laporan.append(dict(kode=s['kode'], judul=s['judul'], asal=s['asal_nama'], n_alternatif=len(lolos),
                        peringkat_identik=ids_js == ids_py, selisih_V_maks=maxdiff, rute_identik=rute == s['rute'],
                        rute=[next(d['nama'] for d in D if d['id'] == i) for i in rute],
                        top5=[(next(d['nama'] for d in D if d['id'] == i), round(V_py[i], 4)) for i in ids_py[:5]],
                        status='IDENTIK' if ok else 'BERBEDA'))
    print('%s | alternatif=%d | peringkat identik=%s | selisih V maks=%.2e | rute identik=%s -> %s'
          % (s['kode'], len(lolos), ids_js == ids_py, maxdiff, rute == s['rute'], 'IDENTIK' if ok else 'BERBEDA'))

json.dump(laporan, open(os.path.join(ROOT, 'docs', 'validasi_silang.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('SEMUA SKENARIO IDENTIK' if semua_ok else 'ADA PERBEDAAN')
