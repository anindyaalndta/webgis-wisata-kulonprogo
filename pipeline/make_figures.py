# -*- coding: utf-8 -*-
"""Membuat gambar laporan (peta lokasi, diagram alir, arsitektur, analisis) -> docs/gambar/
   python make_figures.py <ROOT_PROYEK> <SHP_DIY.gpkg>"""
import sys, os, json, math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
from matplotlib.patches import FancyBboxPatch, Polygon as MplPoly, FancyArrowPatch
from matplotlib.lines import Line2D
from osgeo import ogr
from shapely import wkb
from shapely.geometry import shape

ROOT, GPKG = sys.argv[1], sys.argv[2]
OUT = os.path.join(ROOT, 'docs', 'gambar'); os.makedirs(OUT, exist_ok=True)
J = lambda p: json.load(open(os.path.join(ROOT, 'data', p), encoding='utf-8'))
wis, kec, desa, jalan, M, cfg = J('wisata.geojson'), J('kapanewon.geojson'), J('kalurahan.geojson'), J('jalan.geojson'), J('matriks_osrm.json'), J('config.json')
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9})
KC = {'Wisata Alam': '#2f8f5b', 'Wisata Alam-Buatan': '#2c7fb8', 'Religi dan Budaya': '#8a4fa3', 'Agrowisata': '#c9921a', 'Akomodasi dan Rekreasi': '#d0573a'}
FOREST = '#1f5f4a'

def polys(geom):
    g = shape(geom)
    return list(g.geoms) if g.geom_type.startswith('Multi') or g.geom_type == 'GeometryCollection' else [g]

def draw_poly(ax, geom, **kw):
    for p in polys(geom):
        if p.geom_type == 'Polygon':
            ax.add_patch(MplPoly(np.array(p.exterior.coords), closed=True, **kw))

def north_arrow(ax, x, y, s=0.012):
    ax.annotate('', xy=(x, y + s * 2.2), xytext=(x, y), arrowprops=dict(arrowstyle='-|>', lw=1.6, color='k'), zorder=20)
    ax.text(x, y + s * 2.5, 'U', ha='center', va='bottom', fontsize=11, fontweight='bold', zorder=20)

def scale_bar(ax, x, y, km=5, lat=-7.7):
    deg = km / (111.32 * math.cos(math.radians(lat)))
    for i in range(km):
        ax.add_patch(plt.Rectangle((x + i * deg / km, y), deg / km, 0.0025, facecolor='k' if i % 2 == 0 else 'w', edgecolor='k', lw=0.6, zorder=20))
    ax.text(x, y - 0.002, '0', ha='center', va='top', fontsize=7)
    ax.text(x + deg, y - 0.002, '%d km' % km, ha='center', va='top', fontsize=7)

# ------------------------------------------------------------------ 1. Peta sebaran destinasi
fig = plt.figure(figsize=(8.3, 8.8), dpi=200)
ax = fig.add_axes([0.08, 0.2, 0.88, 0.74])
x0, x1, y0, y1 = 110.06, 110.30, -7.80, -7.60
for f in kec['features']:
    t = f['properties']['target']
    draw_poly(ax, f['geometry'], facecolor='#e7f0ea' if t else '#f4f2ec', edgecolor=FOREST if t else '#9aa59e',
              lw=1.6 if t else 0.6, ls='-' if t else (0, (4, 3)), zorder=2 if t else 1)
for f in desa['features']:
    draw_poly(ax, f['geometry'], facecolor='none', edgecolor='#6f9a86', lw=0.4, ls=(0, (2, 2)), zorder=3)
RS = {'Arteri': ('#d9542b', 1.4), 'Kolektor': ('#e89a2c', 1.0), 'Lokal': ('#d8c79a', 0.4)}
for f in jalan['features']:
    g = shape(f['geometry'])
    for ln in (g.geoms if g.geom_type.startswith('Multi') else [g]):
        xy = np.array(ln.coords)
        c, w = RS[f['properties']['kelas']]
        ax.plot(xy[:, 0], xy[:, 1], color=c, lw=w, zorder=4)
for f in kec['features']:
    p = f['properties']; c = shape(f['geometry']).representative_point()
    if x0 < c.x < x1 and y0 < c.y < y1:
        ax.text(c.x, c.y, p['kecamatan'].upper(), ha='center', va='center', zorder=9, fontsize=10 if p['target'] else 6.5,
                fontweight='bold' if p['target'] else 'normal', color=FOREST if p['target'] else '#7b867f', alpha=0.85)
for f in wis['features']:
    p = f['properties']; x, y = f['geometry']['coordinates']
    ax.scatter(x, y, s=34 if p['in_scope'] else 22, c=KC[p['kategori']] if p['in_scope'] else '#ffffff',
               edgecolors='white' if p['in_scope'] else KC[p['kategori']], linewidths=0.8 if p['in_scope'] else 1.2, zorder=10)
ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_aspect(1 / math.cos(math.radians(7.7)))
ax.set_xticks(np.arange(110.08, 110.30, 0.04)); ax.set_yticks(np.arange(-7.80, -7.59, 0.04))
ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: '%.2f°BT' % v))
ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: '%.2f°LS' % -v))
ax.tick_params(labelsize=7); ax.grid(color='#888', lw=0.3, alpha=0.4)
north_arrow(ax, 110.29, -7.625); scale_bar(ax, 110.07, -7.79)
h = [Line2D([], [], marker='o', ls='', color=c, markeredgecolor='white', markersize=7, label=k) for k, c in KC.items()]
h += [Line2D([], [], marker='o', ls='', color='white', markeredgecolor='#666', markersize=6, label='Objek di luar 3 kapanewon'),
      Line2D([], [], color=FOREST, lw=1.6, label='Batas kapanewon kajian'),
      Line2D([], [], color='#6f9a86', lw=0.6, ls=(0, (2, 2)), label='Batas kalurahan'),
      Line2D([], [], color='#e89a2c', lw=1.2, label='Jalan kolektor (RBI)'), Line2D([], [], color='#d8c79a', lw=0.8, label='Jalan lokal (RBI)')]
ax.legend(handles=h, loc='upper center', bbox_to_anchor=(0.5, -0.06), ncol=3, fontsize=7.5, frameon=False)
ax.set_title('Peta Sebaran Destinasi Wisata Kapanewon Girimulyo, Kalibawang, dan Samigaluh', fontsize=10.5, fontweight='bold', color=FOREST)
fig.text(0.08, 0.02, 'Sumber: basis data potensi wisata (Google Maps, kurasi tim, 2026); batas wilayah & jalan RBI 1:25.000 (BIG).\nSistem koordinat WGS 84 (EPSG:4326).', fontsize=6.5, color='#555')
ds = ogr.Open(GPKG); lyr = ds.GetLayer(0)
axi = fig.add_axes([0.765, 0.215, 0.18, 0.17])
for ft in lyr:
    g = ft.GetGeometryRef().Clone(); g.FlattenTo2D(); geo = wkb.loads(bytes(g.ExportToWkb()))
    kp = ft.GetField('Kab_Kota') == 'KULON PROGO'
    draw_poly(axi, geo.__geo_interface__, facecolor='#cfe2d6' if kp else '#efefea', edgecolor='#555', lw=0.4)
axi.add_patch(plt.Rectangle((x0, y0), x1 - x0, y1 - y0, fill=False, edgecolor='#d0573a', lw=1.2))
axi.set_xlim(109.98, 110.86); axi.set_ylim(-8.22, -7.52); axi.set_aspect(1 / math.cos(math.radians(7.8)))
axi.set_xticks([]); axi.set_yticks([]); axi.set_title('D.I. Yogyakarta', fontsize=7)
fig.savefig(os.path.join(OUT, 'peta_sebaran.png'), dpi=200); plt.close(fig)

# ------------------------------------------------------------------ util diagram
def box(ax, x, y, w, h, txt, fc='#ffffff', ec=FOREST, fs=7.8, color='#1d2a24', bold=False):
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h, boxstyle='round,pad=0.006,rounding_size=0.012', fc=fc, ec=ec, lw=1.1))
    ax.text(x, y, txt, ha='center', va='center', fontsize=fs, color=color, fontweight='bold' if bold else 'normal', linespacing=1.25)

def arrow(ax, a, b, color='#333', rad=0):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle='-|>', mutation_scale=10, lw=1, color=color,
                                 connectionstyle='arc3,rad=%s' % rad, shrinkA=0, shrinkB=0))

# ------------------------------------------------------------------ 2. Diagram alir pelaksanaan (2 kolom)
fig, ax = plt.subplots(figsize=(7.4, 9.6), dpi=200); ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
W, H = 0.42, 0.058
L = [('Mulai', 'start'), ('Studi literatur & koordinasi', ''), ('Pengumpulan data:\nExcel potensi wisata, RBI 1:25.000, OSM', 'in'),
     ('Pembersihan atribut & overlay\nbatas kapanewon/kalurahan', ''), ('Gabung duplikat, cek cakupan,\nklasifikasi 5 kategori', ''),
     ('Basis data spasial & nonspasial\n(GeoJSON, GeoPackage, PostGIS)', 'db'), ('Penentuan kriteria C1–C4', ''),
     ('Perbandingan berpasangan AHP\n(kuesioner, skala Saaty)', ''), ('CR ≤ 0,10 ?', 'dec'), ('Bobot default AHP', 'db')]
R = [('Panduan 5 pertanyaan saat web dibuka:\nlokasi, jenis wisata, waktu, anggaran, rating', 'in'), ('Waktu & jarak tempuh\n(OSRM, jaringan jalan OSM)', ''),
     ('Penyaringan destinasi\nsesuai batasan pengguna', ''), ('SAW: normalisasi benefit/cost\n& nilai preferensi V', ''),
     ('Peringkat destinasi', 'db'), ('Rute nearest neighbour\n(10 teratas, batas waktu/anggaran)', ''),
     ('Pembangunan WebGIS\n(Leaflet, data.js, OSRM)', ''), ('Pengujian: validasi silang,\nblack-box, SUS', ''), ('Laporan & penyajian hasil', 'out'), ('Selesai', 'start')]
FC = {'start': FOREST, 'in': '#eef4fb', 'db': '#e7f0ea', 'dec': '#fff8e8', 'out': '#fbefe9', '': '#ffffff'}
ysL = np.linspace(0.95, 0.06, len(L)); ysR = np.linspace(0.95, 0.06, len(R))
xL, xR = 0.25, 0.75
for (t, k), y in zip(L, ysL):
    if k == 'dec':
        ax.add_patch(MplPoly([[xL, y + 0.035], [xL + 0.16, y], [xL, y - 0.035], [xL - 0.16, y]], closed=True, fc=FC[k], ec=FOREST, lw=1.1))
        ax.text(xL, y, t, ha='center', va='center', fontsize=8, fontweight='bold')
    else:
        box(ax, xL, y, W, H, t, fc=FC[k], color='white' if k == 'start' else '#1d2a24', bold=k == 'start')
for (t, k), y in zip(R, ysR):
    box(ax, xR, y, W, H, t, fc=FC[k], color='white' if k == 'start' else '#1d2a24', bold=k == 'start')
for i in range(len(L) - 1):
    top = ysL[i] - (0.035 if L[i][1] == 'dec' else H / 2)
    bot = ysL[i + 1] + (0.035 if L[i + 1][1] == 'dec' else H / 2)
    arrow(ax, (xL, top), (xL, bot))
for i in range(len(R) - 1):
    arrow(ax, (xR, ysR[i] - H / 2), (xR, ysR[i + 1] + H / 2))
yd = ysL[8]
ax.plot([xL - 0.16, 0.015, 0.015], [yd, yd, ysL[7]], color='#b4442f', lw=1)
arrow(ax, (0.015, ysL[7]), (xL - W / 2, ysL[7]), color='#b4442f')
ax.text(0.02, (yd + ysL[7]) / 2, 'Tidak', fontsize=7, color='#b4442f')
ax.text(xL + 0.01, (yd + ysL[9]) / 2 + 0.005, 'Ya', fontsize=7, color=FOREST)
# bobot -> SAW
ax.plot([xL + W / 2, 0.5], [ysL[9], ysL[9]], color=FOREST, lw=1)
ax.plot([0.5, 0.5], [ysL[9], ysR[3]], color=FOREST, lw=1)
arrow(ax, (0.5, ysR[3]), (xR - W / 2, ysR[3]), color=FOREST)
ax.text(0.51, (ysL[9] + ysR[3]) / 2, 'bobot w\n(dapat diubah\npengguna)', fontsize=6.5, color=FOREST)
# basis data -> penyaringan
ax.plot([xL + W / 2, 0.47], [ysL[5], ysL[5]], color='#2c7fb8', lw=1)
ax.plot([0.47, 0.47], [ysL[5], ysR[2]], color='#2c7fb8', lw=1)
arrow(ax, (0.47, ysR[2]), (xR - W / 2, ysR[2]), color='#2c7fb8')
ax.text(0.25, 0.995, 'A. Penyiapan data & bobot', ha='center', fontsize=9, fontweight='bold', color=FOREST)
ax.text(0.75, 0.995, 'B. Rekomendasi, rute & sistem', ha='center', fontsize=9, fontweight='bold', color=FOREST)
fig.savefig(os.path.join(OUT, 'diagram_alir.png'), dpi=200, bbox_inches='tight'); plt.close(fig)

# ------------------------------------------------------------------ 3. Arsitektur sistem
fig, ax = plt.subplots(figsize=(8.2, 4.6), dpi=200); ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
def tier(x, title, items, fc):
    ax.add_patch(FancyBboxPatch((x - 0.15, 0.08), 0.3, 0.8, boxstyle='round,pad=0.005,rounding_size=0.02', fc=fc, ec=FOREST, lw=1.2))
    ax.text(x, 0.83, title, ha='center', fontsize=9, fontweight='bold', color=FOREST)
    for i, t in enumerate(items):
        box(ax, x, 0.7 - i * 0.135, 0.26, 0.1, t, fs=7.2)
tier(0.17, 'Data (pipeline)', ['Excel potensi wisata\n(88 entri)', 'RBI 1:25.000 BIG\n(batas, jalan)', 'pipeline/build_data.py\n(QGIS-Python: GDAL, Shapely)', 'GeoJSON · GeoPackage\n· SQL PostGIS · data.js'], '#f3f7f4')
tier(0.5, 'Logika (rekom.js)', ['AHP: eigenvector,\nλmaks, CI, CR', 'Penyaringan batasan\npengguna', 'SAW: normalisasi &\nnilai preferensi V', 'Rute nearest neighbour\n(batas waktu & anggaran)'], '#f6f3ea')
tier(0.83, 'Presentasi (browser)', ['index.html + app.js\n(UI 5 tab)', 'Leaflet 1.9.4:\npeta, lapisan, marker', 'Layanan eksternal:\nOSRM, Nominatim, tile', 'Unduh GeoJSON/CSV\n& tabel perhitungan'], '#eef4fb')
arrow(ax, (0.32, 0.48), (0.35, 0.48)); arrow(ax, (0.65, 0.48), (0.68, 0.48))
arrow(ax, (0.68, 0.40), (0.65, 0.40))
fig.savefig(os.path.join(OUT, 'arsitektur.png'), dpi=200, bbox_inches='tight'); plt.close(fig)

# ------------------------------------------------------------------ 4. Rasio jarak jalan / garis lurus & kecepatan
P = {f['properties']['id']: f for f in wis['features']}
ids = M['ids']; dist = np.array(M['dist'], float); dur = np.array(M['dur'], float)
def hav(a, b):
    (lo1, la1), (lo2, la2) = P[a]['geometry']['coordinates'], P[b]['geometry']['coordinates']
    R_ = 6371008.8; p1, p2 = math.radians(la1), math.radians(la2)
    h_ = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 2 * R_ * math.asin(math.sqrt(h_))
rat, hv = [], []
for i in range(len(ids)):
    for j in range(i + 1, len(ids)):
        h_ = hav(ids[i], ids[j])
        if h_ > 1500 and dist[i][j] > 0:
            rat.append(dist[i][j] / h_); hv.append(h_ / 1000)
rat = np.array(rat)
fig, axs = plt.subplots(1, 2, figsize=(8.4, 3.3), dpi=200)
axs[0].hist(rat, bins=40, color='#2b7a60', edgecolor='white')
axs[0].axvline(rat.mean(), color='#c8862a', lw=1.5, label='rata-rata %.2f' % rat.mean())
axs[0].axvline(np.median(rat), color='#8a4fa3', lw=1.2, ls='--', label='median %.2f' % np.median(rat))
axs[0].set_xlabel('Jarak jalan / jarak garis lurus'); axs[0].set_ylabel('Jumlah pasangan destinasi'); axs[0].legend(fontsize=7, frameon=False)
axs[0].set_title('a) Rasio jarak (n = %d pasangan)' % len(rat), fontsize=9)
axs[1].scatter(hv, rat, s=3, alpha=0.35, color='#2c7fb8')
axs[1].set_xlabel('Jarak garis lurus (km)'); axs[1].set_ylabel('Rasio'); axs[1].set_title('b) Rasio terhadap jarak garis lurus', fontsize=9)
for a in axs:
    a.spines[['top', 'right']].set_visible(False); a.grid(alpha=0.25)
fig.tight_layout(); fig.savefig(os.path.join(OUT, 'rasio_jarak.png'), dpi=200); plt.close(fig)

# ------------------------------------------------------------------ 5. Bobot AHP & profil
K = ['C1 Waktu tempuh', 'C2 Biaya', 'C3 Rating', 'C4 Popularitas']
prof = {'AHP bawaan': cfg['ahp_result']['w'], 'Dekat': [.5, .15, .2, .15], 'Hemat': [.15, .55, .15, .15], 'Populer': [.15, .1, .3, .45], 'Seimbang': [.25] * 4}
fig, ax = plt.subplots(figsize=(8, 3.0), dpi=200)
cols = ['#2b7a60', '#c8862a', '#2c7fb8', '#8a4fa3']
yy = np.arange(len(prof))[::-1]
for (name, w), y in zip(prof.items(), yy):
    left = 0
    for j, v in enumerate(w):
        ax.barh(y, v, left=left, color=cols[j], edgecolor='white', height=0.6)
        if v > 0.07:
            ax.text(left + v / 2, y, '%.1f%%' % (v * 100), ha='center', va='center', fontsize=7, color='white')
        left += v
ax.set_yticks(yy); ax.set_yticklabels(list(prof.keys())); ax.set_xlim(0, 1)
ax.xaxis.set_major_formatter(mticker.PercentFormatter(1.0))
ax.legend([plt.Rectangle((0, 0), 1, 1, color=c) for c in cols], K, ncol=4, fontsize=7, loc='upper center', bbox_to_anchor=(0.5, -0.15), frameon=False)
ax.spines[['top', 'right']].set_visible(False)
fig.tight_layout(); fig.savefig(os.path.join(OUT, 'bobot_profil.png'), dpi=200); plt.close(fig)
print('gambar selesai:', sorted(os.listdir(OUT)))
