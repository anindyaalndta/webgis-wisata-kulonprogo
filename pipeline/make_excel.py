# -*- coding: utf-8 -*-
"""Workbook Excel berumus untuk validasi manual & instrumen kuesioner -> docs/
   python make_excel.py <ROOT_PROYEK>   (butuh tests/out/scenarios_js.json dari tests/export_scenarios.js)"""
import sys, os, json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as CL
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = sys.argv[1]
cfg = json.load(open(os.path.join(ROOT, 'data', 'config.json'), encoding='utf-8'))
scen = json.load(open(os.path.join(ROOT, 'tests', 'out', 'scenarios_js.json'), encoding='utf-8'))
HDR = PatternFill('solid', fgColor='1F5F4A'); HF = Font(bold=True, color='FFFFFF')
SUB = PatternFill('solid', fgColor='E3EFE9'); INP = PatternFill('solid', fgColor='FFF8E8')
thin = Side(style='thin', color='C9CFC6'); BD = Border(left=thin, right=thin, top=thin, bottom=thin)
K = ['C1 Waktu tempuh (menit)', 'C2 Biaya (skala 1-5)', 'C3 Rating', 'C4 ln(1+ulasan)']
SIFAT = ['cost', 'cost', 'benefit', 'benefit']

def hdr(ws, r, c, vals, fill=HDR, font=HF):
    for i, v in enumerate(vals):
        x = ws.cell(r, c + i, v); x.fill = fill; x.font = font; x.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True); x.border = BD

def widths(ws, w):
    for i, v in enumerate(w, 1):
        ws.column_dimensions[CL(i)].width = v

# ====================================================================== Validasi_AHP_SAW.xlsx
wb = Workbook()
ws = wb.active; ws.title = 'AHP'
ws['A1'] = 'Perhitungan AHP manual (metode normalisasi kolom) — matriks perbandingan berpasangan bawaan'; ws['A1'].font = Font(bold=True, size=12)
ws['A2'] = 'Sel kuning dapat diubah (segitiga atas); segitiga bawah otomatis = 1/nilai. Bandingkan dengan bobot eigenvector sistem.'
hdr(ws, 4, 1, ['Kriteria', 'C1', 'C2', 'C3', 'C4'])
A = cfg['ahp_default']
for i in range(4):
    ws.cell(5 + i, 1, ['C1 Waktu tempuh', 'C2 Biaya', 'C3 Rating', 'C4 Popularitas'][i]).font = Font(bold=True)
    for j in range(4):
        c = ws.cell(5 + i, 2 + j)
        if i == j: c.value = 1
        elif i < j: c.value = A[i][j]; c.fill = INP
        else: c.value = '=1/%s%d' % (CL(2 + i), 5 + j)
        c.number_format = '0.000'; c.border = BD
ws.cell(9, 1, 'Jumlah kolom').font = Font(bold=True)
for j in range(4):
    ws.cell(9, 2 + j, '=SUM(%s5:%s8)' % (CL(2 + j), CL(2 + j))).number_format = '0.000'
hdr(ws, 11, 1, ['Normalisasi', 'C1', 'C2', 'C3', 'C4', 'Bobot w (rata-rata baris)', 'A·w', '(A·w)/w', 'Bobot sistem (eigenvector)'])
for i in range(4):
    r = 12 + i
    ws.cell(r, 1, 'C%d' % (i + 1))
    for j in range(4):
        ws.cell(r, 2 + j, '=%s%d/%s$9' % (CL(2 + j), 5 + i, CL(2 + j))).number_format = '0.0000'
    ws.cell(r, 6, '=AVERAGE(B%d:E%d)' % (r, r)).number_format = '0.0000'
    ws.cell(r, 7).number_format = '0.0000'
    ws.cell(r, 7).value = '=B{0}*$F$12+C{0}*$F$13+D{0}*$F$14+E{0}*$F$15'.format(5 + i)
    ws.cell(r, 8, '=G%d/F%d' % (r, r)).number_format = '0.0000'
    ws.cell(r, 9, round(cfg['ahp_result']['w'][i], 6)).number_format = '0.0000'
rows = [('n', 4), ('λ maks = rata-rata (A·w)/w', '=AVERAGE(H12:H15)'), ('CI = (λmaks − n)/(n − 1)', '=(B18-B17)/(B17-1)'),
        ('RI (Saaty, n = 4)', 0.90), ('CR = CI/RI', '=B19/B20'), ('Kesimpulan', '=IF(B21<=0.1,"KONSISTEN (CR ≤ 0,10)","TIDAK KONSISTEN – ulangi penilaian")'),
        ('λ maks sistem (eigenvector)', round(cfg['ahp_result']['lambda_max'], 6)), ('CR sistem (eigenvector)', round(cfg['ahp_result']['cr'], 6))]
for k, (a, b) in enumerate(rows):
    ws.cell(17 + k, 1, a).font = Font(bold=True); c = ws.cell(17 + k, 2, b); c.number_format = '0.0000'
ws['A26'] = 'Catatan: metode normalisasi kolom adalah aproksimasi; sistem memakai eigenvector utama (power iteration). Selisih bobot keduanya sangat kecil.'
widths(ws, [30, 11, 11, 11, 11, 22, 11, 11, 24])

for s in scen:
    ws = wb.create_sheet('SAW_' + s['kode'])
    n = len(s['peringkat'])
    ws['A1'] = 'Validasi SAW skenario %s — %s' % (s['kode'], s['judul']); ws['A1'].font = Font(bold=True, size=12)
    p = s['params']
    ws['A2'] = 'Titik awal: %s | kategori: %s | waktu: %s jam | anggaran: %s | rating min: %s | alternatif lolos penyaringan: %d' % (
        s['asal_nama'], p['kategori'], p['jamMaks'] if p['jamMaks'] is not None else 'tidak dibatasi',
        p['anggaran'] if p['anggaran'] is not None else 'tidak dibatasi', p['ratingMin'] or 'tidak dibatasi', n)
    ws['A3'] = 'Bobot w'; ws['A3'].font = Font(bold=True)
    for j in range(4):
        c = ws.cell(3, 3 + j, s['bobot'][j]); c.number_format = '0.0000'; c.fill = INP
        ws.cell(4, 3 + j, SIFAT[j]).alignment = Alignment(horizontal='center')
    ws['A4'] = 'Sifat'; ws['A4'].font = Font(bold=True)
    hdr(ws, 6, 1, ['ID', 'Destinasi'] + ['X ' + k for k in K] + ['R C1', 'R C2', 'R C3', 'R C4', 'V (Excel)', 'Peringkat (Excel)', 'V (sistem)', 'Selisih |V|'])
    r0, r1 = 7, 7 + n - 1
    for i, a in enumerate(s['peringkat']):
        r = r0 + i
        ws.cell(r, 1, a['id']); ws.cell(r, 2, a['nama'])
        for j in range(4):
            ws.cell(r, 3 + j, a['x'][j]).number_format = '0.0000'
            col = CL(3 + j)
            f = ('=MIN(%s$%d:%s$%d)/%s%d' % (col, r0, col, r1, col, r)) if SIFAT[j] == 'cost' else ('=IF(MAX(%s$%d:%s$%d)=0,0,%s%d/MAX(%s$%d:%s$%d))' % (col, r0, col, r1, col, r, col, r0, col, r1))
            ws.cell(r, 7 + j, f).number_format = '0.0000'
        ws.cell(r, 11, '=G{0}*$C$3+H{0}*$D$3+I{0}*$E$3+J{0}*$F$3'.format(r)).number_format = '0.000000'
        ws.cell(r, 12, '=RANK(K%d,$K$%d:$K$%d,0)' % (r, r0, r1))
        ws.cell(r, 13, a['V']).number_format = '0.000000'
        ws.cell(r, 14, '=ABS(K%d-M%d)' % (r, r)).number_format = '0.0E+00'
        if i < 3:
            for c in range(1, 15): ws.cell(r, c).fill = SUB
    ws.cell(r1 + 2, 2, 'Selisih maksimum V Excel vs sistem').font = Font(bold=True)
    ws.cell(r1 + 2, 14, '=MAX(N%d:N%d)' % (r0, r1)).number_format = '0.0E+00'
    ws.cell(r1 + 3, 2, 'Rute nearest neighbour sistem (ID)').font = Font(bold=True)
    ws.cell(r1 + 3, 3, ' → '.join(str(x) for x in s['rute']))
    widths(ws, [6, 46, 12, 12, 11, 12, 9, 9, 9, 9, 12, 10, 12, 11])
    ws.freeze_panes = 'C7'
wb.save(os.path.join(ROOT, 'docs', 'Validasi_AHP_SAW.xlsx'))

# ====================================================================== Instrumen_Kuesioner_AHP_SUS.xlsx
wb = Workbook()
ws = wb.active; ws.title = 'AHP_Responden'
ws['A1'] = 'Rekap kuesioner perbandingan berpasangan AHP (skala Saaty)'; ws['A1'].font = Font(bold=True, size=12)
ws['A2'] = 'Isi nilai a_ij tiap responden (kuning): >1 bila kriteria kiri lebih penting, <1 (mis. 1/3 = 0,333) bila kriteria kanan lebih penting, 1 bila sama penting.'
pairs = [('C1 Waktu tempuh', 'C2 Biaya'), ('C1 Waktu tempuh', 'C3 Rating'), ('C1 Waktu tempuh', 'C4 Popularitas'),
         ('C2 Biaya', 'C3 Rating'), ('C2 Biaya', 'C4 Popularitas'), ('C3 Rating', 'C4 Popularitas')]
hdr(ws, 4, 1, ['Responden'] + ['%s vs %s' % p for p in pairs])
NR = 40
for r in range(5, 5 + NR):
    ws.cell(r, 1, 'R%02d' % (r - 4))
    for c in range(2, 8):
        x = ws.cell(r, c); x.fill = INP; x.border = BD; x.number_format = '0.000'
dv = DataValidation(type='decimal', operator='between', formula1='0.111', formula2='9', allow_blank=True,
                    error='Nilai harus antara 1/9 (0,111) dan 9'); ws.add_data_validation(dv); dv.add('B5:G%d' % (4 + NR))
rg = 5 + NR + 1
ws.cell(rg, 1, 'Rata-rata geometris').font = Font(bold=True)
for c in range(2, 8):
    ws.cell(rg, c, '=IFERROR(GEOMEAN(%s5:%s%d),"")' % (CL(c), CL(c), 4 + NR)).number_format = '0.000'
ws.cell(rg + 1, 1, 'Jumlah responden').font = Font(bold=True)
ws.cell(rg + 1, 2, '=COUNT(B5:B%d)' % (4 + NR))
# matriks agregat + AHP
b = rg + 3
ws.cell(b, 1, 'Matriks agregat & bobot (otomatis)').font = Font(bold=True, size=11)
hdr(ws, b + 1, 1, ['', 'C1', 'C2', 'C3', 'C4', 'Bobot w', 'A·w', '(A·w)/w'])
pos = {(0, 1): 'B', (0, 2): 'C', (0, 3): 'D', (1, 2): 'E', (1, 3): 'F', (2, 3): 'G'}
for i in range(4):
    r = b + 2 + i
    ws.cell(r, 1, 'C%d' % (i + 1)).font = Font(bold=True)
    for j in range(4):
        if i == j: v = 1
        elif i < j: v = '=%s%d' % (pos[(i, j)], rg)
        else: v = '=1/%s%d' % (pos[(j, i)], rg)
        ws.cell(r, 2 + j, v).number_format = '0.000'
cs = b + 6
ws.cell(cs, 1, 'Jumlah kolom')
for j in range(4):
    ws.cell(cs, 2 + j, '=SUM(%s%d:%s%d)' % (CL(2 + j), b + 2, CL(2 + j), b + 5)).number_format = '0.000'
for i in range(4):
    r = b + 2 + i
    ws.cell(r, 6, '=(B{0}/B${1}+C{0}/C${1}+D{0}/D${1}+E{0}/E${1})/4'.format(r, cs)).number_format = '0.0000'
    ws.cell(r, 7, '=B{0}*$F${1}+C{0}*$F${2}+D{0}*$F${3}+E{0}*$F${4}'.format(r, b + 2, b + 3, b + 4, b + 5)).number_format = '0.0000'
    ws.cell(r, 8, '=G%d/F%d' % (r, r)).number_format = '0.0000'
for k, (a, f) in enumerate([('λ maks', '=AVERAGE(H%d:H%d)' % (b + 2, b + 5)), ('CI', '=(B%d-4)/3' % (cs + 2)), ('RI', 0.9),
                            ('CR', '=B%d/B%d' % (cs + 3, cs + 4)), ('Kesimpulan', '=IF(B%d<=0.1,"KONSISTEN – bobot boleh dipakai","TIDAK KONSISTEN – telaah ulang responden")' % (cs + 5))]):
    ws.cell(cs + 2 + k, 1, a).font = Font(bold=True); ws.cell(cs + 2 + k, 2, f).number_format = '0.0000'
ws.cell(cs + 8, 1, 'Masukkan nilai rata-rata geometris ke tab "Metode AHP–SAW" pada WebGIS (kalkulator AHP), lalu klik "Pakai sebagai bobot rekomendasi". '
        'Untuk bobot default permanen, ubah AHP_DEFAULT pada pipeline/build_data.py dan jalankan ulang pipeline.')
widths(ws, [22] + [20] * 7)

ws = wb.create_sheet('SUS')
ws['A1'] = 'System Usability Scale (SUS) — 10 butir, skala 1 (sangat tidak setuju) s.d. 5 (sangat setuju)'; ws['A1'].font = Font(bold=True, size=12)
items = ['Saya akan sering menggunakan WebGIS ini.', 'WebGIS ini terlalu rumit.', 'WebGIS ini mudah digunakan.',
         'Saya butuh bantuan teknisi untuk memakai WebGIS ini.', 'Fitur-fitur WebGIS ini terintegrasi dengan baik.',
         'Terlalu banyak ketidakkonsistenan dalam WebGIS ini.', 'Kebanyakan orang akan cepat belajar memakai WebGIS ini.',
         'WebGIS ini sangat merepotkan untuk digunakan.', 'Saya merasa percaya diri memakai WebGIS ini.',
         'Saya perlu belajar banyak hal sebelum bisa memakai WebGIS ini.']
for i, t in enumerate(items):
    ws.cell(3 + i, 1, 'Q%d' % (i + 1)).font = Font(bold=True); ws.cell(3 + i, 2, t); ws.merge_cells('B%d:K%d' % (3 + i, 3 + i))
hdr(ws, 15, 1, ['Responden'] + ['Q%d' % i for i in range(1, 11)] + ['Skor SUS (0–100)'])
NR = 60
dv2 = DataValidation(type='whole', operator='between', formula1='1', formula2='5', allow_blank=True); ws.add_data_validation(dv2)
for r in range(16, 16 + NR):
    ws.cell(r, 1, 'R%02d' % (r - 15))
    for c in range(2, 12):
        x = ws.cell(r, c); x.fill = INP; x.border = BD
    dv2.add('B%d:K%d' % (r, r))
    odd = '+'.join('(%s%d-1)' % (CL(c), r) for c in (2, 4, 6, 8, 10))
    even = '+'.join('(5-%s%d)' % (CL(c), r) for c in (3, 5, 7, 9, 11))
    ws.cell(r, 12, '=IF(COUNT(B{0}:K{0})=10,({1}+{2})*2.5,"")'.format(r, odd, even)).number_format = '0.0'
e = 16 + NR + 1
for k, (a, f) in enumerate([('Jumlah responden lengkap', '=COUNT(L16:L%d)' % (15 + NR)), ('Rata-rata skor SUS', '=IFERROR(AVERAGE(L16:L%d),"")' % (15 + NR)),
                            ('Interpretasi (Bangor dkk., 2009)', '=IF(B{0}="","",IF(B{0}>=85.5,"Excellent (A)",IF(B{0}>=80.3,"Sangat baik",IF(B{0}>=68,"Baik / di atas rata-rata",IF(B{0}>=51,"Cukup (OK)","Kurang")))))'.format(e + 1))]):
    ws.cell(e + k, 1, a).font = Font(bold=True); ws.cell(e + k, 2, f).number_format = '0.0'
ws.cell(e + 4, 1, 'Rumus: butir ganjil = skor − 1; butir genap = 5 − skor; total × 2,5. Skor ≥ 68 dianggap di atas rata-rata.')
widths(ws, [30, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 16])
wb.save(os.path.join(ROOT, 'docs', 'Instrumen_Kuesioner_AHP_SUS.xlsx'))
print('ok')
