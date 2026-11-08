# -*- coding: utf-8 -*-
"""
Pipeline data WebGIS Wisata Kulon Progo Utara (Girimulyo, Kalibawang, Samigaluh)

Tahapan (sesuai Bab III proposal):
  1. Baca basis data potensi wisata (Excel, hasil ekstraksi Google Maps + kurasi tim)
  2. Pembersihan atribut (teks harga -> angka, karakter rusak, deskripsi terpotong)
  3. Overlay titik dengan batas kecamatan & kalurahan (RBI 1:25.000) -> isi Kecamatan/Desa,
     tandai titik di luar cakupan 3 kapanewon
  4. Penggabungan 5 pasangan duplikat (sesuai catatan basis data awal)
  5. Klasifikasi biaya (skala 1-5), durasi kunjungan, ringkasan QA
  6. Ekstraksi batas wilayah & jaringan jalan, matriks waktu/jarak jalan (OSRM)
  7. Ekspor: GeoJSON, data.js (untuk web), CSV, GeoPackage, SQL (PostgreSQL/PostGIS)

Jalankan dengan Python bawaan QGIS (sudah ada osgeo, shapely, numpy, openpyxl):
  python build_data.py <GDB_RBI> <XLSX_DATABASE> <OUT_DIR> [--no-osrm]
"""
import sys, os, re, json, math, csv, time, glob, statistics, urllib.request
from collections import Counter, defaultdict
import numpy as np
import openpyxl
from osgeo import ogr, gdal
from shapely import wkb
from shapely.geometry import Point, mapping, box
from shapely.strtree import STRtree

ogr.UseExceptions()
gdal.UseExceptions()

GDB, XLSX, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
USE_OSRM = '--no-osrm' not in sys.argv
os.makedirs(OUT, exist_ok=True)

TARGET_KEC = ['Girimulyo', 'Kalibawang', 'Samigaluh']
BBOX = (110.04, -7.84, 110.32, -7.58)          # minx, miny, maxx, maxy (tampilan peta)

# Pasangan duplikat dari "Catatan Basis Data Awal Potensi Wisata Kulon Progo Utara" (bagian 4.d)
# (No yang dipertahankan sebagai nama utama, No yang digabung, nama hasil penggabungan)
MERGE_PAIRS = [
    (48, 49, 'Air Terjun Kembang Soka'),
    (77, 84, 'Waduk Mini Embung Banjaroya (Embung Tonogoro)'),
    (46, 47, 'Ekowisata Sungai Mudal'),
    (83, 24, 'Gua Maria Watu Blencong (Dusun Boro Suci)'),
    (75, 87, 'Ancol Bridge - Bligo (Ancol Kalibawang)'),
]

# ------------------------------------------------------------------ konfigurasi metode
CRITERIA = [
    dict(kode='C1', key='waktu',  nama='Waktu tempuh',  sifat='cost',    satuan='menit',
         sumber='Routing jaringan jalan (OSRM)'),
    dict(kode='C2', key='biaya',  nama='Biaya kunjungan', sifat='cost',  satuan='skala 1-5',
         sumber='Basis data potensi wisata (harga tiket / paket menginap)'),
    dict(kode='C3', key='rating', nama='Rating',        sifat='benefit', satuan='skala 1-5',
         sumber='Google Maps'),
    dict(kode='C4', key='ulasan', nama='Popularitas (jumlah ulasan)', sifat='benefit',
         satuan='ln(1+ulasan)', sumber='Google Maps'),
]
# Matriks perbandingan berpasangan AWAL (Saaty) urutan C1..C4.
# CATATAN: nilai ini PENILAIAN SEMENTARA tim; harus diganti hasil kuesioner (geometric mean responden).
AHP_DEFAULT = [
    [1.0, 2.0, 1/2, 2.0],
    [1/2, 1.0, 1/3, 1.0],
    [2.0, 3.0, 1.0, 2.0],
    [1/2, 1.0, 1/2, 1.0],
]
BIAYA_BATAS = [(0, 1), (5000, 2), (15000, 3), (50000, 4)]   # <=batas -> skala ; selainnya 5
DURASI_KATEGORI = {            # jam di lokasi (asumsi tim, belum divalidasi survei)
    'Wisata Alam': 1.5, 'Wisata Alam-Buatan': 1.0, 'Religi dan Budaya': 0.75,
    'Agrowisata': 1.0, 'Akomodasi dan Rekreasi': 1.5,
}
DURASI_KATA_KUNCI = (['puncak', 'bukit', 'hill', 'gunung', 'view', 'gardu', 'sunrise', 'punthuk', 'tebing'], 1.0)

# ------------------------------------------------------------------ util
def clean_txt(v):
    if v is None:
        return None
    s = str(v).replace('�', '–').replace('\xa0', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s or None

def parse_rp(v):
    """'Rp5.000 - Rp15.000' -> (5000, 15000); 'Rp0' -> (0, 0); None -> None"""
    if v is None:
        return None
    nums = re.findall(r'\d{1,3}(?:\.\d{3})+|\d+', str(v))
    vals = [int(n.replace('.', '')) for n in nums]
    if not vals:
        return None
    return (min(vals), max(vals))

def trim_sentence(t):
    if not t:
        return t
    t = t.strip()
    if t.endswith('.'):
        return t
    i = t.rfind('.')
    return t[:i + 1] if i > 40 else t

def haversine(lat1, lon1, lat2, lon2):
    R = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))

def biaya_skala(rp):
    for batas, sk in BIAYA_BATAS:
        if rp <= batas:
            return sk
    return 5

def ahp(matrix):
    A = np.array(matrix, float)
    n = A.shape[0]
    vals, vecs = np.linalg.eig(A)
    k = np.argmax(vals.real)
    w = np.abs(vecs[:, k].real); w = w / w.sum()
    lam = float(vals[k].real)
    ci = (lam - n) / (n - 1)
    RI = {1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}
    cr = ci / RI[n] if RI[n] else 0
    return w.tolist(), lam, ci, cr

# ------------------------------------------------------------------ 1. baca Excel
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb.worksheets[0]
rows = list(ws.iter_rows(values_only=True))
hdr = [re.split(r'\s{2,}', str(h))[0].strip() if h else None for h in rows[0]]
raw = []
for r in rows[1:]:
    if r[1] is None:
        continue
    d = dict(zip(hdr, r))
    d['No'] = int(d['No'])
    raw.append(d)
print('Baris data mentah:', len(raw))

# ------------------------------------------------------------------ 3. batas wilayah (RBI)
ds = ogr.Open(GDB)

def read_layer(name, where=None, rect=None, fields=()):
    lyr = ds.GetLayerByName(name)
    if where:
        lyr.SetAttributeFilter(where)
    if rect:
        lyr.SetSpatialFilterRect(*rect)
    out = []
    for f in lyr:
        g = f.GetGeometryRef()
        if g is None:
            continue
        g = g.Clone(); g.FlattenTo2D()
        geom = wkb.loads(bytes(g.ExportToWkb()))
        out.append((geom, {k: f.GetField(k) for k in fields}))
    return out

kec_all = read_layer('ADMINISTRASI_AR_KECAMATAN', fields=('WADMKC', 'WADMKK'))
desa_all = read_layer('ADMINISTRASI_AR_DESAKEL', fields=('WADMKD', 'WADMKC', 'WADMKK'))

def locate(pt, items):
    tree_geoms = [g for g, _ in items]
    tree = STRtree(tree_geoms)
    for idx in tree.query(pt, predicate='intersects'):
        return items[int(idx)][1]
    # toleransi ~50 m untuk titik tepat di tepi poligon
    near = tree.nearest(pt)
    if tree_geoms[int(near)].distance(pt) < 0.0005:
        return items[int(near)][1]
    return None

# ------------------------------------------------------------------ 2+3. bersihkan & overlay
def norm_kec(k):
    if not k:
        return None
    k = clean_txt(k)
    return {'Grimulyo': 'Girimulyo'}.get(k, k)

recs = []
for d in raw:
    lat, lon = float(d['Latitude']), float(d['Longitude'])
    pt = Point(lon, lat)
    kec = locate(pt, kec_all)
    des = locate(pt, desa_all)
    masuk = parse_rp(d['Harga Masuk'])
    paket = parse_rp(d['Harga Paket Wisata'])
    makan = parse_rp(d['Range harga makan'])
    nama = clean_txt(d['Nama Objek Wisata'])
    menginap = bool(re.search(r'glamping|cabin|resort', nama, re.I))
    rec = dict(
        no_asal=[d['No']], nama=nama,
        kecamatan_excel=norm_kec(d['Kecamatan']), desa_excel=clean_txt(d['Desa/Kalurahan']),
        kecamatan=kec['WADMKC'] if kec else None, kabupaten=kec['WADMKK'] if kec else None,
        desa=des['WADMKD'] if des else None,
        lat=lat, lon=lon,
        jenis=clean_txt(d['Jenis']), kategori=clean_txt(d['Kategori']),
        deskripsi=trim_sentence(clean_txt(d['Deskripsi'])),
        rating=float(d['Rating']) if d['Rating'] is not None else None,
        ulasan=int(d['Reviews']) if d['Reviews'] is not None else None,
        masuk=masuk, paket=paket, makan=makan,
        harga_teks=clean_txt(d['Harga Masuk']), paket_teks=clean_txt(d['Harga Paket Wisata']),
        makan_teks=clean_txt(d['Range harga makan']),
        jam=clean_txt(d['Jam Operasional']), hari=clean_txt(d['Hari Operasional']),
        menginap=menginap, catatan=[],
    )
    recs.append(rec)

by_no = {r['no_asal'][0]: r for r in recs}

# ---- QA: kesesuaian Kecamatan/Desa Excel vs overlay
qa = dict(n_mentah=len(raw))
qa['kec_kosong_excel'] = sum(1 for r in recs if not r['kecamatan_excel'])
qa['kec_cocok'] = sum(1 for r in recs if r['kecamatan_excel'] and r['kecamatan_excel'] == r['kecamatan'])
qa['kec_beda'] = [(r['no_asal'][0], r['nama'], r['kecamatan_excel'], r['kecamatan']) for r in recs
                  if r['kecamatan_excel'] and r['kecamatan_excel'] != r['kecamatan']]
qa['desa_kosong_excel'] = sum(1 for r in recs if not r['desa_excel'])
qa['desa_cocok'] = sum(1 for r in recs if r['desa_excel'] and r['desa_excel'].lower() == (r['desa'] or '').lower())
qa['desa_beda'] = [(r['no_asal'][0], r['nama'], r['desa_excel'], r['desa']) for r in recs
                   if r['desa_excel'] and r['desa_excel'].lower() != (r['desa'] or '').lower()]

# ------------------------------------------------------------------ 4. gabung duplikat
merged_log = []
drop = set()
for keep, other, new_name in MERGE_PAIRS:
    a, b = by_no[keep], by_no[other]
    dist = haversine(a['lat'], a['lon'], b['lat'], b['lon'])
    ra, rb = a['rating'], b['rating']
    na, nb = a['ulasan'] or 0, b['ulasan'] or 0
    a['rating'] = round((ra * na + rb * nb) / (na + nb), 2) if (na + nb) else ra
    a['ulasan'] = na + nb
    a['nama'] = new_name
    a['no_asal'] = a['no_asal'] + b['no_asal']
    for fld in ('masuk', 'paket', 'makan', 'harga_teks', 'paket_teks', 'makan_teks', 'jam', 'hari'):
        if a[fld] is None and b[fld] is not None:
            a[fld] = b[fld]
    if len(b['deskripsi'] or '') > len(a['deskripsi'] or ''):
        a['deskripsi'] = b['deskripsi']
    a['catatan'].append('Gabungan 2 entri duplikat (asumsi, jarak %d m); konfirmasi saat ground check' % round(dist))
    drop.add(other)
    merged_log.append(dict(dipertahankan=keep, digabung=other, nama=new_name, jarak_m=round(dist),
                           rating_lama=[ra, rb], ulasan_lama=[na, nb], rating_baru=a['rating'], ulasan_baru=a['ulasan']))
recs = [r for r in recs if r['no_asal'][0] not in drop]
qa['n_setelah_gabung'] = len(recs)
qa['gabungan'] = merged_log

# ---- pasangan berdekatan yang TIDAK digabung (klaster)
close = []
for i in range(len(recs)):
    for j in range(i + 1, len(recs)):
        dd = haversine(recs[i]['lat'], recs[i]['lon'], recs[j]['lat'], recs[j]['lon'])
        if dd < 250:
            close.append((recs[i]['nama'], recs[j]['nama'], round(dd)))
qa['pasangan_dekat_tidak_digabung'] = close

# ------------------------------------------------------------------ 5. atribut turunan
# Aturan cakupan wilayah:
#  (a) titik berada di dalam poligon salah satu dari 3 kapanewon (overlay RBI 1:25.000)  -> dalam cakupan
#  (b) titik di luar poligon tetapi tercatat tim di kapanewon target DAN jaraknya <= TOL_BATAS dari poligon
#      -> "titik batas": tetap dalam cakupan, kecamatan/desa mengikuti catatan tim (selisih digitasi/skala peta)
#  (c) selain itu -> di luar cakupan (disimpan, tidak ikut rekomendasi secara bawaan)
from shapely.ops import unary_union
TOL_BATAS = 150.0   # meter
from pyproj import Transformer
from shapely.ops import transform as sh_transform
_tr = Transformer.from_crs(4326, 32749, always_xy=True).transform
_tgt_union = unary_union([g for g, a in kec_all if a['WADMKK'] == 'Kulon Progo' and a['WADMKC'] in TARGET_KEC])
_tgt_m = sh_transform(_tr, _tgt_union)
qa['titik_batas'] = []
for r in recs:
    inside = r['kabupaten'] == 'Kulon Progo' and r['kecamatan'] in TARGET_KEC
    r['jarak_ke_batas_m'] = round(_tgt_m.distance(sh_transform(_tr, Point(r['lon'], r['lat']))))
    if inside:
        r['in_scope'] = True; r['status_wilayah'] = 'Dalam cakupan'
    elif r['kecamatan_excel'] in TARGET_KEC and r['jarak_ke_batas_m'] <= TOL_BATAS:
        r['in_scope'] = True; r['status_wilayah'] = 'Dalam cakupan (titik batas)'
        qa['titik_batas'].append((r['nama'], r['kecamatan_excel'], r['kecamatan'], r['jarak_ke_batas_m']))
        r['catatan'].append('Titik batas: RBI menempatkan di %s (selisih %d m dari batas); mengikuti catatan tim' % (r['kecamatan'], r['jarak_ke_batas_m']))
        r['kecamatan'], r['kabupaten'] = r['kecamatan_excel'], 'Kulon Progo'
        if r['desa_excel']:
            r['desa'] = r['desa_excel']
    else:
        r['in_scope'] = False; r['status_wilayah'] = 'Di luar cakupan'
for r in recs:
    if not r['in_scope']:
        r['catatan'].append('Di luar cakupan 3 kapanewon (%s, %s)' % (r['kecamatan'], r['kabupaten']))
    # biaya
    if r['menginap'] and r['paket']:
        r['biaya_rp'] = int(round(r['paket'][0], -3)); r['biaya_dasar'] = 'paket menginap (batas bawah)'
        r['biaya_imputed'] = False
    elif r['masuk'] is not None:
        r['biaya_rp'] = int(round(sum(r['masuk']) / 2 / 500.0) * 500); r['biaya_dasar'] = 'tiket masuk (nilai tengah)'
        r['biaya_imputed'] = False
    else:
        r['biaya_rp'] = None; r['biaya_dasar'] = None; r['biaya_imputed'] = True

# imputasi biaya kosong dengan median kategori (hanya dari data yang diketahui)
med = {}
for kat in set(r['kategori'] for r in recs):
    v = [r['biaya_rp'] for r in recs if r['kategori'] == kat and r['biaya_rp'] is not None and not r['menginap']]
    med[kat] = int(round(statistics.median(v) / 500.0) * 500) if v else 0
for r in recs:
    if r['biaya_rp'] is None:
        r['biaya_rp'] = med[r['kategori']]
        r['biaya_dasar'] = 'estimasi: median kategori (data tiket belum ada)'
        r['catatan'].append('Harga tiket belum tercatat; diestimasi dari median kategori')
    r['biaya_skala'] = biaya_skala(r['biaya_rp'])
    if r['rating'] is None:
        r['catatan'].append('Belum ada rating/ulasan di Google Maps')
    # durasi
    dur = DURASI_KATEGORI[r['kategori']]
    if r['kategori'] == 'Wisata Alam' and any(k in r['nama'].lower() for k in DURASI_KATA_KUNCI[0]):
        dur = DURASI_KATA_KUNCI[1]
    r['durasi_jam'] = dur
    r['gmaps_url'] = 'https://www.google.com/maps/search/?api=1&query=%.7f,%.7f' % (r['lat'], r['lon'])

# urut: kecamatan target dahulu, lalu nama -> beri id berurutan
recs.sort(key=lambda r: (not r['in_scope'], r['kategori'], r['nama'].lower()))
for i, r in enumerate(recs, 1):
    r['id'] = i

qa['n_in_scope'] = sum(r['in_scope'] for r in recs)
qa['n_out_scope'] = [(r['id'], r['nama'], r['kecamatan'], r['kabupaten']) for r in recs if not r['in_scope']]
qa['per_kategori_in_scope'] = Counter(r['kategori'] for r in recs if r['in_scope'])
qa['per_kecamatan_in_scope'] = Counter(r['kecamatan'] for r in recs if r['in_scope'])
qa['rating_kosong'] = [r['nama'] for r in recs if r['rating'] is None]
qa['biaya_imputasi'] = [(r['nama'], r['biaya_rp']) for r in recs if r['biaya_imputed']]
qa['median_biaya_kategori'] = med
uls = [r['ulasan'] for r in recs if r['ulasan']]
qa['ulasan_stat'] = dict(n=len(uls), median=statistics.median(uls), mean=round(statistics.mean(uls), 1),
                         max=max(uls), p90=float(np.percentile(uls, 90)),
                         skewness=float(((np.array(uls) - np.mean(uls)) ** 3).mean() / np.std(uls) ** 3),
                         skewness_ln=float(((np.log1p(uls) - np.log1p(uls).mean()) ** 3).mean() / np.log1p(uls).std() ** 3))

# ------------------------------------------------------------------ 6. batas wilayah & jalan untuk peta
rect = BBOX
kec_feats = []
for g, a in read_layer('ADMINISTRASI_AR_KECAMATAN', rect=rect, fields=('WADMKC', 'WADMKK')):
    if not g.intersects(box(*BBOX)):
        continue
    kec_feats.append(dict(type='Feature', properties=dict(
        kecamatan=a['WADMKC'], kabupaten=a['WADMKK'],
        target=(a['WADMKK'] == 'Kulon Progo' and a['WADMKC'] in TARGET_KEC)),
        geometry=mapping(g.simplify(0.0002).intersection(box(*BBOX)) if not g.within(box(*BBOX)) else g.simplify(0.0002))))

desa_feats = []
for g, a in desa_all:
    if a['WADMKK'] == 'Kulon Progo' and a['WADMKC'] in TARGET_KEC:
        desa_feats.append(dict(type='Feature', properties=dict(desa=a['WADMKD'], kecamatan=a['WADMKC']),
                               geometry=mapping(g.simplify(0.0001))))
qa['n_desa_target'] = len(desa_feats)
qa['luas_km2_kecamatan_target'] = {}

road_feats = []
cnt = Counter()
for g, a in read_layer('JALAN_LN_25K', rect=rect, fields=('REMARK', 'NAMOBJ')):
    kls = a['REMARK']
    if kls not in ('Jalan Arteri', 'Jalan Kolektor', 'Jalan Lokal'):
        continue
    cnt[kls] += 1
    gs = g.simplify(0.00004)
    if gs.is_empty:
        continue
    road_feats.append(dict(type='Feature', properties=dict(kelas=kls.replace('Jalan ', '')), geometry=mapping(gs)))
qa['jalan_segmen'] = dict(cnt)

# luas kecamatan target (km2), proyeksi UTM 49S
from pyproj import Transformer
from shapely.ops import transform as sh_transform
tr = Transformer.from_crs(4326, 32749, always_xy=True).transform
for g, a in kec_all:
    if a['WADMKK'] == 'Kulon Progo' and a['WADMKC'] in TARGET_KEC:
        qa['luas_km2_kecamatan_target'][a['WADMKC']] = round(sh_transform(tr, g).area / 1e6, 2)
qa['luas_km2_desa'] = {}
for g, a in desa_all:
    if a['WADMKK'] == 'Kulon Progo' and a['WADMKC'] in TARGET_KEC:
        qa['luas_km2_desa'][a['WADMKC'] + '/' + a['WADMKD']] = round(sh_transform(tr, g).area / 1e6, 2)

# ------------------------------------------------------------------ OSRM matriks
matrix = None
if USE_OSRM:
    coords = ';'.join('%.6f,%.6f' % (r['lon'], r['lat']) for r in recs)
    url = 'https://router.project-osrm.org/table/v1/driving/%s?annotations=duration,distance' % coords
    print('Meminta matriks OSRM untuk %d titik ...' % len(recs))
    req = urllib.request.Request(url, headers={'User-Agent': 'PRGG-UGM-WebGIS-KulonProgo/1.0'})
    resp = json.load(urllib.request.urlopen(req, timeout=120))
    assert resp['code'] == 'Ok', resp
    dur = np.array(resp['durations'], float)
    dst = np.array(resp['distances'], float)
    snap = [w['distance'] for w in resp['sources']]
    matrix = dict(ids=[r['id'] for r in recs],
                  dur=np.rint(dur).astype(int).tolist(),      # detik
                  dist=np.rint(dst).astype(int).tolist(),     # meter
                  snap_m=[round(s) for s in snap])
    qa['osrm_snap_gt_300m'] = [(r['id'], r['nama'], round(s)) for r, s in zip(recs, snap) if s > 300]
    # perbandingan jarak jalan vs garis lurus
    ratios, byk = [], defaultdict(list)
    for i in range(len(recs)):
        for j in range(i + 1, len(recs)):
            hv = haversine(recs[i]['lat'], recs[i]['lon'], recs[j]['lat'], recs[j]['lon'])
            if hv > 1500 and dst[i][j] > 0:
                ratio = dst[i][j] / hv
                ratios.append(ratio)
    ratios = np.array(ratios)
    qa['jalan_vs_lurus'] = dict(n_pasang=int(len(ratios)), rata2=float(ratios.mean()), median=float(np.median(ratios)),
                                p10=float(np.percentile(ratios, 10)), p90=float(np.percentile(ratios, 90)),
                                selisih_rata2_persen=float((ratios.mean() - 1) * 100))
    # kecepatan rata-rata jaringan
    sp = []
    for i in range(len(recs)):
        for j in range(len(recs)):
            if i != j and dur[i][j] > 60:
                sp.append(dst[i][j] / dur[i][j] * 3.6)
    qa['kecepatan_rata2_kmh'] = float(np.mean(sp))
    qa['kecepatan_median_kmh'] = float(np.median(sp))

# ------------------------------------------------------------------ AHP default
w, lam, ci, cr = ahp(AHP_DEFAULT)
config = dict(criteria=CRITERIA, ahp_default=AHP_DEFAULT, ahp_result=dict(w=w, lambda_max=lam, ci=ci, cr=cr),
              biaya_batas=BIAYA_BATAS, durasi_kategori=DURASI_KATEGORI,
              kategori=['Wisata Alam', 'Wisata Alam-Buatan', 'Religi dan Budaya', 'Agrowisata', 'Akomodasi dan Rekreasi'],
              bbox=BBOX, target_kec=TARGET_KEC, tanggal_build=time.strftime('%Y-%m-%d'))
print('AHP default: w=%s CR=%.4f' % (np.round(w, 4), cr))

# ------------------------------------------------------------------ 7. ekspor
def props(r):
    keys = ['id', 'nama', 'kecamatan', 'desa', 'kabupaten', 'kategori', 'jenis', 'deskripsi', 'rating', 'ulasan',
            'harga_teks', 'paket_teks', 'makan_teks', 'jam', 'hari', 'biaya_rp', 'biaya_skala', 'biaya_dasar',
            'biaya_imputed', 'menginap', 'durasi_jam', 'in_scope', 'status_wilayah', 'gmaps_url', 'no_asal', 'catatan']
    return {k: r[k] for k in keys}

wisata_fc = dict(type='FeatureCollection', features=[
    dict(type='Feature', properties=props(r), geometry=dict(type='Point', coordinates=[round(r['lon'], 7), round(r['lat'], 7)]))
    for r in recs])
kec_fc = dict(type='FeatureCollection', features=kec_feats)
desa_fc = dict(type='FeatureCollection', features=desa_feats)
road_fc = dict(type='FeatureCollection', features=road_feats)

def round_coords(o, nd=5):
    if isinstance(o, float):
        return round(o, nd)
    if isinstance(o, (list, tuple)):
        return [round_coords(x, nd) for x in o]
    if isinstance(o, dict):
        return {k: round_coords(v, nd) if k == 'coordinates' else (round_coords_feat(v, nd) if k in ('geometry', 'features') else v) for k, v in o.items()}
    return o

def round_coords_feat(v, nd):
    if isinstance(v, list):
        return [round_coords(x, nd) for x in v]
    return round_coords(v, nd)

for fc in (kec_fc, desa_fc, road_fc):
    for ft in fc['features']:
        ft['geometry'] = round_coords(ft['geometry'], 5)

def dump(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

dd = os.path.join(OUT, 'data'); os.makedirs(dd, exist_ok=True)
dump(os.path.join(dd, 'wisata.geojson'), wisata_fc)
dump(os.path.join(dd, 'kapanewon.geojson'), kec_fc)
dump(os.path.join(dd, 'kalurahan.geojson'), desa_fc)
dump(os.path.join(dd, 'jalan.geojson'), road_fc)
if matrix:
    dump(os.path.join(dd, 'matriks_osrm.json'), matrix)
dump(os.path.join(dd, 'config.json'), config)

# data.js : dibaca web langsung (tanpa fetch, sehingga index.html bisa dibuka dari file lokal)
with open(os.path.join(dd, 'data.js'), 'w', encoding='utf-8') as f:
    f.write('/* Dihasilkan otomatis oleh pipeline/build_data.py - jangan diedit manual */\n')
    f.write('window.WISATA=' + json.dumps(wisata_fc, ensure_ascii=False, separators=(',', ':')) + ';\n')
    f.write('window.KAPANEWON=' + json.dumps(kec_fc, ensure_ascii=False, separators=(',', ':')) + ';\n')
    f.write('window.KALURAHAN=' + json.dumps(desa_fc, ensure_ascii=False, separators=(',', ':')) + ';\n')
    f.write('window.JALAN=' + json.dumps(road_fc, ensure_ascii=False, separators=(',', ':')) + ';\n')
    f.write('window.MATRIKS=' + json.dumps(matrix, separators=(',', ':')) + ';\n')
    f.write('window.CONFIG=' + json.dumps(config, ensure_ascii=False, separators=(',', ':')) + ';\n')

# CSV
dbd = os.path.join(OUT, 'db'); os.makedirs(dbd, exist_ok=True)
with open(os.path.join(dbd, 'wisata_bersih.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    cols = ['id', 'nama', 'kecamatan', 'desa', 'kabupaten', 'kategori', 'jenis', 'lat', 'lon', 'rating', 'ulasan',
            'harga_teks', 'paket_teks', 'makan_teks', 'biaya_rp', 'biaya_skala', 'biaya_dasar', 'durasi_jam',
            'jam', 'hari', 'in_scope', 'menginap', 'no_asal', 'catatan', 'deskripsi']
    wr = csv.writer(f); wr.writerow(cols)
    for r in recs:
        row = []
        for c in cols:
            v = r.get(c)
            if isinstance(v, list):
                v = '; '.join(str(x) for x in v)
            row.append(v)
        wr.writerow(row)

# GeoPackage (untuk QGIS)
# GeoPackage 1.2 (tipe geometri eksplisit) + Shapefile cadangan -> export_gis.py
import subprocess
subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'export_gis.py'), OUT], check=True)

# SQL PostgreSQL/PostGIS
def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, list):
        v = '; '.join(str(x) for x in v)
    return "'" + str(v).replace("'", "''") + "'"

with open(os.path.join(dbd, 'schema_postgis.sql'), 'w', encoding='utf-8') as f:
    f.write('''-- Skema basis data WebGIS Wisata Kulon Progo Utara (PostgreSQL 15 + PostGIS 3)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS kategori_wisata (
  id_kategori SMALLSERIAL PRIMARY KEY,
  nama        TEXT UNIQUE NOT NULL,
  durasi_jam  NUMERIC(3,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS destinasi_wisata (
  id            INTEGER PRIMARY KEY,
  nama          TEXT NOT NULL,
  id_kategori   SMALLINT REFERENCES kategori_wisata(id_kategori),
  kecamatan     TEXT, kalurahan TEXT, kabupaten TEXT,
  jenis_google  TEXT,
  deskripsi     TEXT,
  rating        NUMERIC(2,1),
  ulasan        INTEGER,
  harga_teks    TEXT, paket_teks TEXT, makan_teks TEXT,
  jam_operasional TEXT, hari_operasional TEXT,
  biaya_rp      INTEGER NOT NULL,
  biaya_skala   SMALLINT NOT NULL CHECK (biaya_skala BETWEEN 1 AND 5),
  biaya_dasar   TEXT,
  biaya_estimasi BOOLEAN NOT NULL DEFAULT FALSE,
  menginap      BOOLEAN NOT NULL DEFAULT FALSE,
  durasi_jam    NUMERIC(3,2) NOT NULL,
  dalam_cakupan BOOLEAN NOT NULL,
  gmaps_url     TEXT,
  no_asal       TEXT,
  catatan       TEXT,
  geom          geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_destinasi_geom ON destinasi_wisata USING GIST (geom);

CREATE TABLE IF NOT EXISTS kriteria (
  kode TEXT PRIMARY KEY, nama TEXT NOT NULL, sifat TEXT NOT NULL CHECK (sifat IN ('benefit','cost')),
  satuan TEXT, sumber TEXT, bobot_default NUMERIC(6,5) NOT NULL
);

-- Matriks waktu/jarak antar-destinasi berdasarkan jaringan jalan (OSRM)
CREATE TABLE IF NOT EXISTS matriks_jalan (
  id_asal INTEGER REFERENCES destinasi_wisata(id), id_tujuan INTEGER REFERENCES destinasi_wisata(id),
  durasi_detik INTEGER NOT NULL, jarak_meter INTEGER NOT NULL, PRIMARY KEY (id_asal, id_tujuan)
);

-- Contoh query: destinasi dalam cakupan pada radius 10 km dari titik awal
-- SELECT nama, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(110.2255,-7.6680),4326)::geography) AS jarak_m
-- FROM destinasi_wisata WHERE dalam_cakupan ORDER BY jarak_m LIMIT 10;
''')
with open(os.path.join(dbd, 'seed_postgis.sql'), 'w', encoding='utf-8') as f:
    f.write('-- Data awal (dihasilkan otomatis oleh pipeline/build_data.py)\nBEGIN;\n')
    kats = config['kategori']
    for i, k in enumerate(kats, 1):
        f.write("INSERT INTO kategori_wisata VALUES (%d, %s, %s) ON CONFLICT DO NOTHING;\n" % (i, q(k), q(DURASI_KATEGORI[k])))
    for c, wv in zip(CRITERIA, w):
        f.write("INSERT INTO kriteria VALUES (%s,%s,%s,%s,%s,%.5f) ON CONFLICT DO NOTHING;\n" %
                (q(c['kode']), q(c['nama']), q(c['sifat']), q(c['satuan']), q(c['sumber']), wv))
    for r in recs:
        f.write("INSERT INTO destinasi_wisata VALUES (%d,%s,%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%d,%d,%s,%s,%s,%s,%s,%s,%s,%s,ST_SetSRID(ST_MakePoint(%.7f,%.7f),4326));\n" % (
            r['id'], q(r['nama']), kats.index(r['kategori']) + 1, q(r['kecamatan']), q(r['desa']), q(r['kabupaten']),
            q(r['jenis']), q(r['deskripsi']), q(r['rating']), q(r['ulasan']), q(r['harga_teks']), q(r['paket_teks']),
            q(r['makan_teks']), q(r['jam']), q(r['hari']), r['biaya_rp'], r['biaya_skala'], q(r['biaya_dasar']),
            q(r['biaya_imputed']), q(r['menginap']), r['durasi_jam'], q(r['in_scope']), q(r['gmaps_url']),
            q(r['no_asal']), q(r['catatan']), r['lon'], r['lat']))
    if matrix:
        ids = matrix['ids']
        for i, a in enumerate(ids):
            for j, b in enumerate(ids):
                if a != b:
                    f.write("INSERT INTO matriks_jalan VALUES (%d,%d,%d,%d);\n" % (a, b, matrix['dur'][i][j], matrix['dist'][i][j]))
    f.write('COMMIT;\n')

# QA ke JSON untuk laporan
def jsonable(o):
    if isinstance(o, Counter):
        return dict(o)
    raise TypeError
os.makedirs(os.path.join(OUT, 'docs'), exist_ok=True)
with open(os.path.join(OUT, 'docs', 'qa_data.json'), 'w', encoding='utf-8') as f:
    json.dump(qa, f, ensure_ascii=False, indent=1, default=jsonable)
with open(os.path.join(dd, 'qa.js'), 'w', encoding='utf-8') as f:
    f.write('/* Ringkasan kendali mutu data - dihasilkan otomatis oleh pipeline/build_data.py */\n')
    f.write('window.QA=' + json.dumps(qa, ensure_ascii=False, separators=(',', ':'), default=jsonable) + ';\n')
print(json.dumps({k: v for k, v in qa.items() if k not in ('pasangan_dekat_tidak_digabung', 'desa_beda', 'luas_km2_desa')},
                 ensure_ascii=False, indent=1, default=jsonable)[:6000])
print('Selesai. Destinasi:', len(recs), '| dalam cakupan:', qa['n_in_scope'])
