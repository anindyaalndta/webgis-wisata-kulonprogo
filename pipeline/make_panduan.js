/*
 * Panduan pengerjaan step-by-step untuk tim (5 orang) -> docs/Panduan_Pengerjaan_Step_by_Step.docx
 *   NODE_PATH=<node_modules berisi docx> node pipeline/make_panduan.js
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle,
  ShadingType, LevelFormat, TableOfContents, Footer, PageNumber, VerticalAlign, PageOrientation
} = require('docx');

const ROOT = path.join(__dirname, '..');
const FONT = 'Arial';
const CW = 9026;                                  // A4, margin 2,5 cm
const GREEN = '1F5F4A';

/* ------------------------------------------------------------------ helper */
function runs(text, base = {}) {
  const out = []; const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith('`')) out.push(new TextRun({ text: t.slice(1, -1), font: 'Consolas', size: (base.size || 21) - 1, color: '7A3E00', ...base, bold: false }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (t, o = {}) => new Paragraph({ children: runs(t, o.run), alignment: o.align || AlignmentType.JUSTIFIED, spacing: { after: o.after != null ? o.after : 120, line: 300 }, keepNext: o.keepNext });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)], keepNext: true });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)], keepNext: true });
const NUMS = []; let nref = 0;
function numbered(items) {
  const ref = 'n' + (nref++);
  NUMS.push({ reference: ref, levels: [
    { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 500, hanging: 360 } } } },
    { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 360 } } } }] });
  return items.map((it) => {
    const [t, l] = Array.isArray(it) ? it : [it, 0];
    return new Paragraph({ numbering: { reference: ref, level: l }, children: runs(t), spacing: { after: 60, line: 290 }, alignment: AlignmentType.LEFT });
  });
}
const bullets = (items) => items.map((t) => new Paragraph({ numbering: { reference: 'bul', level: 0 }, children: runs(t), spacing: { after: 50, line: 290 } }));
const code = (lines) => lines.map((l, i) => new Paragraph({
  children: [new TextRun({ text: l || ' ', font: 'Consolas', size: 18, color: '1D2A24' })],
  shading: { fill: 'F2F4EF', type: ShadingType.CLEAR, color: 'auto' }, spacing: { after: 0, before: i === 0 ? 60 : 0, line: 250 },
  indent: { left: 200, right: 200 }, border: i === 0 ? { top: { style: BorderStyle.SINGLE, size: 4, color: 'C9CFC6' } } : undefined
})).concat([new Paragraph({ children: [], spacing: { after: 100 } })]);
const bd = { style: BorderStyle.SINGLE, size: 4, color: 'AEB8B1' };
const borders = { top: bd, bottom: bd, left: bd, right: bd };
function cell(t, w, o = {}) {
  const items = Array.isArray(t) ? t : String(t).split('\n');
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.TOP,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 }, columnSpan: o.span,
    children: items.map((line) => new Paragraph({ children: runs(line, { size: o.size || 19, bold: o.bold, color: o.color }), spacing: { after: 30, line: 260 } }))
  });
}
function table(head, rows, ratio, o = {}) {
  const s = ratio.reduce((a, b) => a + b, 0); const W = ratio.map((r) => Math.round(r / s * CW)); W[W.length - 1] += CW - W.reduce((a, b) => a + b, 0);
  const tr = [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, W[i], { bold: true, fill: o.headFill || 'DCEAE2' })) })];
  rows.forEach((r, ri) => tr.push(new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, W[i], { fill: (o.zebra && ri % 2) ? 'F7F8F4' : (o.firstCol && i === 0 ? 'F2F6F3' : undefined), bold: o.firstCol && i === 0 })) })));
  return [new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: W, rows: tr }), new Paragraph({ children: [], spacing: { after: 120 } })];
}
const NOTE = (t, fill = 'FFF5DC') => [new Table({
  width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
  rows: [new TableRow({ children: [new TableCell({ width: { size: CW, type: WidthType.DXA }, shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.SINGLE, size: 24, color: 'B8862B' } },
    margins: { top: 80, bottom: 80, left: 160, right: 120 }, children: [new Paragraph({ children: runs(t, { size: 20 }), spacing: { after: 0, line: 280 } })] })] })]
}), new Paragraph({ children: [], spacing: { after: 120 } })];

/*
 * Satu langkah kerja: kartu info + langkah + gerbang mutu (cek -> bila gagal)
 */
function langkah(no, judul, info, isi, gerbang) {
  const out = [H3(`Langkah ${no} — ${judul}`)];
  out.push(...table(['Penanggung jawab', 'Masukan', 'Keluaran', 'Waktu'], [[info.pj, info.masuk, info.keluar, info.waktu]], [1.6, 2.4, 2.6, 0.9]));
  isi.forEach((blok) => {
    if (typeof blok === 'string') out.push(P(blok));
    else if (blok.langkah) out.push(...numbered(blok.langkah));
    else if (blok.kode) out.push(...code(blok.kode));
    else if (blok.catatan) out.push(...NOTE(blok.catatan));
    else if (blok.tabel) out.push(...table(blok.tabel[0], blok.tabel[1], blok.tabel[2]));
    else out.push(blok);                     // Paragraph/Table siap pakai
  });
  if (gerbang) {
    out.push(new Paragraph({ children: [new TextRun({ text: `Gerbang mutu langkah ${no}`, bold: true, color: GREEN, size: 20 })], spacing: { before: 60, after: 60 }, keepNext: true }));
    out.push(...table(['Cek (lulus jika …)', 'Bila belum lulus, perbaiki dengan …'], gerbang, [1, 1.15], { headFill: 'F6ECD6' }));
  }
  return out;
}

/* ================================================================== isi */
const tim = [
  ['A', 'Mirdha Dhea Permata', 'Manajer proyek & AHP', 'Jadwal, notulen, kuesioner AHP, uji CR, koordinasi pengujian'],
  ['B', 'Maulida Fi Nurrin', 'Data spasial & jaringan jalan', 'Batas wilayah, QGIS, overlay, OSRM, peta lokasi'],
  ['C', 'Muhammad Frisky Makarim', 'Basis data & SAW', 'Kamus data, basis data, perhitungan SAW, validasi Excel'],
  ['D', 'Anindya R Putri Alindita', 'Inventarisasi & klasifikasi', 'Verifikasi atribut, ground check, kategori, administrasi'],
  ['E', 'Kharisma Alawiyah', 'Pengembang WebGIS', 'Kode web, integrasi, navigasi, deployment, laporan akhir']
];

const sampul = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2200, after: 200 }, children: [new TextRun({ text: 'PANDUAN PENGERJAAN STEP-BY-STEP', bold: true, size: 36, color: GREEN })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: 'WebGIS Rekomendasi Destinasi dan Rute Wisata Kapanewon Girimulyo, Kalibawang, dan Samigaluh', bold: true, size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'Dari pengumpulan data hingga WebGIS dapat diakses publik — untuk tim 5 orang', size: 22, italics: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1800 }, children: [new TextRun({ text: 'Termasuk navigasi rute di dalam WebGIS (tanpa Google Maps)', size: 22, italics: true })] }),
  ...tim.map((t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: `${t[0]}. ${t[1]} — ${t[2]}`, size: 21 })] })),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400 }, children: [new TextRun({ text: 'Proyek Rekayasa Geodesi-Geomatika · Departemen Teknik Geodesi FT UGM · 2026', size: 20, color: '555555' })] })
];

const pengantar = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('Daftar Isi')] }),
  new TableOfContents('Daftar Isi', { hyperlink: true, headingStyleRange: '1-3' }),
  H1('0. Cara Memakai Panduan Ini'),
  P('Panduan ini menjabarkan pekerjaan dari nol sampai WebGIS dapat dibuka siapa saja melalui internet. Pekerjaan dibagi menjadi **9 fase** dan **40 langkah**. Setiap langkah memuat penanggung jawab, masukan, keluaran, perkiraan waktu, dan **gerbang mutu**: daftar cek yang harus lulus sebelum pindah ke langkah berikutnya. Bila suatu cek belum lulus, kolom kanan gerbang mutu menunjukkan apa yang harus diperbaiki dan langkah mana yang perlu diulang. Dengan begitu kekurangan di tahap awal tidak terbawa sampai akhir.'),
  P('Purwarupa yang sudah jadi (folder `WebGIS-Wisata-KulonProgo-Utara`) dapat dipakai sebagai **acuan dan pembanding**. Setiap langkah menyebutkan berkas acuannya, sehingga tim dapat membangun ulang sendiri lalu mencocokkan hasilnya.'),
  H2('0.1 Pembagian peran'),
  ...table(['Kode', 'Nama', 'Peran utama', 'Tanggung jawab'], tim, [0.5, 2, 1.8, 3.6], { firstCol: true }),
  P('Kode A–E dipakai pada seluruh panduan. Setiap langkah punya satu penanggung jawab utama (**PJ**) dan minimal satu **pemeriksa** dari anggota lain. Prinsipnya: pekerjaan seseorang selalu dicek orang lain sebelum dianggap selesai.'),
  H2('0.2 Gambaran fase'),
  ...table(['Fase', 'Isi', 'PJ utama', 'Bulan (rencana)'], [
    ['1. Persiapan', 'Kesepakatan lingkup, instal perangkat, repositori bersama', 'A', 'Sep'],
    ['2. Data destinasi', 'Pengumpulan, pembersihan, overlay, duplikat, klasifikasi, ground check', 'D + B', 'Sep–Okt'],
    ['3. Jaringan jalan', 'OSRM, matriks waktu tempuh, analisis jarak jalan', 'B', 'Okt'],
    ['4. Pembobotan AHP', 'Kriteria, kuesioner, agregasi, uji CR', 'A', 'Nov'],
    ['5. SAW & rute', 'Matriks keputusan, normalisasi, peringkat, nearest neighbour, validasi Excel', 'C', 'Nov–Des'],
    ['6. Pembangunan WebGIS', 'Peta, panduan 5 pertanyaan, rekomendasi, rute, navigasi di WebGIS', 'E (+C)', 'Des–Jan'],
    ['7. Pengujian', 'Uji unit, validasi silang, black-box, uji lapangan navigasi, SUS', 'A (+semua)', 'Feb'],
    ['8. Publikasi', 'GitHub, GitHub Pages/Vercel, HTTPS, uji dari ponsel', 'E', 'Feb'],
    ['9. Laporan & presentasi', 'Laporan akhir, gladi presentasi, serah terima data', 'semua', 'Mar–Mei']
  ], [1.6, 4.2, 1.1, 1.2], { firstCol: true }),
  H2('0.3 Aturan kerja tim'),
  ...bullets([
    '**Satu sumber kebenaran:** data mentah di Google Drive bersama (folder `00_mentah`, hanya-baca); data olahan dan kode di repositori GitHub.',
    '**Rapat mingguan 30 menit** (dipimpin A): progres, hambatan, gerbang mutu yang belum lulus. Notulen disimpan di `docs/notulen/`.',
    '**Penamaan berkas:** `YYYYMMDD_nama_versi`, misalnya `20261020_wisata_bersih_v2.xlsx`. Jangan menimpa berkas orang lain.',
    '**Setiap perubahan data** dicatat di lembar `log_perubahan` (tanggal, siapa, apa, alasan).',
    '**Keputusan metode** (misalnya aturan titik batas, skala biaya) dicatat beserta alasannya, karena akan ditanyakan saat sidang.'
  ])
];

/* ------------------------------------------------------------------ fase 1 */
const fase1 = [
  H1('1. Fase Persiapan'),
  ...langkah('1.1', 'Menyepakati lingkup dan kriteria', { pj: 'A (pemeriksa: semua)', masuk: 'Proposal, notulensi 21 Sep 2026, arahan dosen', keluar: 'Dokumen lingkup 1 halaman (ditandatangani tim)', waktu: '1 hari' }, [
    { langkah: [
      'Tetapkan wilayah: 3 kapanewon (Girimulyo, Kalibawang, Samigaluh) dan perlakuan objek di luar wilayah (disimpan, tidak direkomendasikan secara bawaan).',
      'Tetapkan 5 kategori wisata: Wisata Alam, Wisata Alam-Buatan, Religi dan Budaya, Agrowisata, Akomodasi dan Rekreasi, beserta definisi singkat masing-masing.',
      'Tetapkan 5 pertanyaan masukan pengguna (lokasi awal, jenis wisata, waktu, anggaran, rating minimum) dan pilihan jawabannya.',
      'Tetapkan kriteria SAW tentatif: waktu tempuh dan biaya (cost), rating dan popularitas (benefit), serta fasilitas bila datanya tersedia.',
      'Tetapkan fitur wajib WebGIS: panduan 5 pertanyaan, peringkat, rute, **navigasi di dalam WebGIS**, transparansi perhitungan, unduh data.'
    ] }
  ], [
    ['Semua anggota dan dosen pembimbing menyetujui dokumen lingkup.', 'Bawa ke rapat berikutnya; ubah poin yang diperdebatkan, lalu minta persetujuan ulang.'],
    ['Setiap kategori punya definisi dan contoh objek.', 'Lengkapi definisi dengan mengacu ke Bab II.1 proposal.']
  ]),
  ...langkah('1.2', 'Menyiapkan perangkat', { pj: 'E (pemeriksa: semua)', masuk: 'Laptop setiap anggota', keluar: 'Perangkat terpasang di 5 laptop', waktu: '1 hari' }, [
    { tabel: [['Perangkat', 'Versi disarankan', 'Dipakai oleh'], [
      ['QGIS (LTR)', '3.40 / 3.44', 'B, C, D'], ['Microsoft Excel', '365', 'semua'], ['Visual Studio Code', 'terbaru', 'C, E'],
      ['Node.js', 'LTS (22/24)', 'E (server lokal & uji)'], ['Git + akun GitHub', 'terbaru', 'semua'], ['Peramban Chrome/Edge', 'terbaru', 'semua']
    ], [2, 1.4, 2]] },
    'Python sudah tersedia di dalam QGIS (`C:\\Program Files\\QGIS ...\\apps\\Python312\\python.exe`), lengkap dengan GDAL, Shapely, NumPy, dan openpyxl. Tidak perlu memasang Python terpisah.'
  ], [
    ['Perintah `node --version`, `git --version` berhasil; QGIS dapat dibuka.', 'Pasang ulang; pada Windows pastikan opsi "Add to PATH" dicentang.']
  ]),
  ...langkah('1.3', 'Membuat repositori dan struktur folder', { pj: 'E (pemeriksa: A)', masuk: 'Akun GitHub tim', keluar: 'Repositori `webgis-wisata-kulonprogo` berisi struktur folder', waktu: '½ hari' }, [
    { kode: ['webgis-wisata-kulonprogo/', '├─ index.html, css/, js/          ← antarmuka (E)', '├─ data/                           ← data siap web (C)', '├─ db/                             ← GeoPackage, CSV, SQL (C)', '├─ pipeline/                       ← skrip olah data (B, C)', '├─ tests/                          ← pengujian (A, E)', '└─ docs/                           ← laporan, notulen, gambar (A)'] },
    { langkah: ['Buat repositori di GitHub (visibilitas *Public* agar bisa memakai GitHub Pages gratis).', 'Undang anggota lain sebagai *collaborator*.', 'Buat cabang kerja per anggota (`data-d`, `web-e`, dan seterusnya); gabungkan ke `main` melalui *pull request* yang diperiksa satu anggota lain.'] }
  ], [
    ['Kelima anggota bisa *clone*, *commit*, dan membuat *pull request*.', 'Periksa undangan collaborator; latih alur Git bersama pada berkas README.']
  ])
];

/* ------------------------------------------------------------------ fase 2 */
const fase2 = [
  H1('2. Fase Data Destinasi'),
  ...langkah('2.1', 'Mengumpulkan data mentah', { pj: 'D (data destinasi), B (data spasial)', masuk: 'Google Maps, data Pak Dedi, Ina-Geoportal, Dinas Pariwisata', keluar: 'Folder `00_mentah` lengkap + daftar sumber', waktu: '1–2 minggu' }, [
    { tabel: [['Data', 'Sumber', 'Format', 'PJ'], [
      ['Potensi wisata (nama, koordinat, kategori, harga, jam, rating, ulasan)', 'Google Maps + kurasi tim; Dinas Pariwisata', 'XLSX', 'D'],
      ['Batas kecamatan & kalurahan, jaringan jalan', 'RBI 1:25.000 (Ina-Geoportal BIG)', 'File Geodatabase', 'B'],
      ['Batas kabupaten DIY (peta indeks)', 'Data Pak Dedi / BIG', 'GPKG/SHP', 'B'],
      ['Jaringan jalan untuk routing', 'OpenStreetMap melalui OSRM', 'API', 'B']
    ], [3, 2.6, 1.2, 0.5]] },
    'Untuk setiap destinasi, catat atribut berikut: **nama, latitude, longitude, kategori, deskripsi, rating, jumlah ulasan, harga tiket, harga paket, kisaran harga makan, jam operasional, hari operasional, fasilitas** (toilet, parkir, warung, musala). Atribut fasilitas belum ada pada data purwarupa, jadi isilah sejak awal agar dapat dijadikan kriteria.'
  ], [
    ['Setiap baris punya nama dan koordinat desimal (lintang negatif, misalnya -7.6680).', 'Cari ulang koordinat di Google Maps (klik kanan → salin koordinat).'],
    ['Sumber dan tanggal pengambilan setiap data dicatat.', 'Lengkapi daftar sumber; rating dan ulasan bisa berubah dari waktu ke waktu.']
  ]),
  ...langkah('2.2', 'Menyusun kamus data', { pj: 'C (pemeriksa: D)', masuk: 'Daftar atribut 2.1', keluar: 'Kamus data (nama kolom, tipe, satuan, aturan isi)', waktu: '½ hari' }, [
    'Tetapkan nama kolom yang konsisten, tanpa spasi, misalnya `nama, kapanewon, kalurahan, lat, lon, kategori, rating, ulasan, harga_min, harga_max, jam_buka, jam_tutup, fasilitas_toilet, ...`. Acuannya Lampiran A laporan.',
    { catatan: '**Perbaikan dari purwarupa:** pada data awal, harga ditulis sebagai teks (misalnya "Rp5.000 - Rp15.000") dan jam bercampur dengan keterangan. Mulai sekarang pisahkan harga menjadi dua kolom angka (`harga_min`, `harga_max`) dan jam menjadi `jam_buka` serta `jam_tutup` (format 08:00). Dengan begitu pembersihan otomatis tidak diperlukan dan jam operasional dapat dipakai sebagai penyaring.' }
  ], [
    ['Setiap kolom punya tipe dan contoh isian.', 'Diskusikan dengan C dan E kolom apa yang dibutuhkan web.']
  ]),
  ...langkah('2.3', 'Membersihkan atribut di Excel', { pj: 'D (pemeriksa: C)', masuk: 'Excel mentah + kamus data', keluar: '`wisata_bersih_v1.xlsx`', waktu: '2–3 hari' }, [
    { langkah: [
      'Seragamkan ejaan kapanewon (misalnya "Grimulyo" menjadi "Girimulyo") dan kategori (hanya 5 nilai yang diizinkan; gunakan *Data Validation → List*).',
      'Ubah teks harga menjadi angka di kolom `harga_min`/`harga_max`; gratis = 0; kosong tetap kosong (jangan diisi 0).',
      'Perbaiki karakter rusak (misalnya "�" menjadi "–") dengan *Find & Replace*.',
      'Pastikan rating berada di rentang 1–5 dan ulasan berupa bilangan bulat ≥ 0.',
      'Tandai baris yang ragu di kolom `catatan` untuk diprioritaskan saat *ground check*.'
    ] },
    'Acuan otomatis: `pipeline/build_data.py` (fungsi `parse_rp`, `clean_txt`) melakukan pembersihan yang sama dan dapat dipakai untuk mengecek hasil kerja manual.'
  ], [
    ['Tidak ada kategori di luar 5 nilai; filter kolom kategori hanya menampilkan 5 pilihan.', 'Kembali ke 2.3 butir 1; diskusikan objek yang ambigu dengan A dan D.'],
    ['Semua harga terisi angka atau sengaja dikosongkan.', 'Telusuri sumber harga; bila tidak ada, catat sebagai data gap untuk ground check (2.7).']
  ]),
  ...langkah('2.4', 'Memasukkan titik ke QGIS dan mengecek koordinat', { pj: 'B (pemeriksa: D)', masuk: '`wisata_bersih_v1.xlsx` (simpan sebagai CSV UTF-8)', keluar: 'Lapisan titik `wisata` (EPSG:4326)', waktu: '½ hari' }, [
    { langkah: [
      'QGIS: *Layer → Add Layer → Add Delimited Text Layer* → pilih CSV, X = `lon`, Y = `lat`, CRS = EPSG:4326.',
      'Tambahkan peta dasar OSM (*XYZ Tiles → OpenStreetMap*) dan batas kecamatan RBI.',
      'Periksa visual: titik yang jatuh di laut, di luar DIY, atau tertukar lintang/bujur.',
      'Simpan sebagai GeoPackage: *klik kanan → Export → Save Features As → GeoPackage*.'
    ] }
  ], [
    ['Semua titik tampil di sekitar Kulon Progo utara; tidak ada titik di (0,0) atau di laut.', 'Perbaiki koordinat di Excel (2.3), lalu ulangi 2.4.']
  ]),
  ...langkah('2.5', 'Overlay batas wilayah dan menentukan cakupan', { pj: 'B (pemeriksa: D)', masuk: 'Lapisan `wisata` + poligon kecamatan & kalurahan RBI', keluar: 'Kolom `kapanewon`, `kalurahan`, `status_wilayah` terisi', waktu: '1 hari' }, [
    { langkah: [
      'QGIS: *Vector → Data Management Tools → Join Attributes by Location* (titik **within** poligon) dengan lapisan kecamatan, lalu kalurahan.',
      'Bandingkan hasil overlay dengan kolom kapanewon dari Excel; tandai yang berbeda.',
      'Untuk titik yang berbeda, ukur jarak ke batas (*Processing → Distance to nearest hub* atau alat ukur). Jika ≤ 150 m dan catatan tim menyebut kapanewon target, beri status **"Dalam cakupan (titik batas)"**.',
      'Titik lain di luar 3 kapanewon diberi status **"Di luar cakupan"** (tetap disimpan).'
    ] },
    { catatan: '**Hasil purwarupa:** 4 titik batas (Kebun Teh Nglinggo, Puncak 9 Bukit Ngisis, Isis Hill, Ancol Bridge) dan 13 objek di luar cakupan. Titik batas wajib dikonfirmasi saat ground check (2.7), misalnya dengan menanyakan perangkat kalurahan.' }
  ], [
    ['Kolom kapanewon dan kalurahan terisi untuk semua titik dalam cakupan.', 'Periksa CRS kedua lapisan (harus sama), lalu ulangi Join.'],
    ['Setiap selisih overlay vs Excel punya keputusan tertulis.', 'Catat di `log_perubahan` beserta alasan (skala 1:25.000, batas sungai, dan sebagainya).']
  ]),
  ...langkah('2.6', 'Mendeteksi dan memutuskan duplikat', { pj: 'D (pemeriksa: B)', masuk: 'Lapisan `wisata` hasil 2.5', keluar: 'Daftar pasangan duplikat + keputusan gabung/pisah', waktu: '½ hari' }, [
    { langkah: [
      'QGIS: *Vector → Analysis Tools → Distance Matrix* (lapisan ke dirinya sendiri, k = 3) → saring pasangan berjarak < 250 m (ubah ke UTM 49S terlebih dahulu agar satuannya meter).',
      'Periksa nama dan foto di Google Maps: entri yang sama digabung, sedangkan objek berbeda dalam satu kawasan dipertahankan.',
      'Aturan penggabungan: ulasan dijumlahkan, rating dirata-rata tertimbang jumlah ulasan, atribut kosong diisi dari pasangannya.'
    ] }
  ], [
    ['Setiap pasangan < 250 m punya keputusan.', 'Konfirmasi lapangan (2.7) untuk pasangan yang meragukan.']
  ]),
  ...langkah('2.7', 'Ground check (verifikasi lapangan)', { pj: 'D (pendamping: A, B)', masuk: 'Daftar prioritas: titik batas, duplikat, data kosong, ulasan tinggi', keluar: 'Formulir verifikasi + foto + koordinat GPS', waktu: '2–4 hari lapangan' }, [
    { langkah: [
      'Susun rute survei memakai fitur rute WebGIS purwarupa (sekaligus menguji navigasi, lihat 7.4).',
      'Di setiap objek: rekam koordinat GPS gerbang/parkir, foto, harga tiket aktual, jam buka, fasilitas (toilet, parkir, warung, musala, akses kendaraan), dan perkiraan lama kunjungan.',
      'Wawancara singkat pengelola: jumlah pengunjung rata-rata, hari ramai, rencana pengembangan.',
      'Perbarui Excel (`wisata_bersih_v2.xlsx`) dan catat semua perubahan di `log_perubahan`.'
    ] },
    { catatan: '**Mengisi kekurangan purwarupa:** ground check menjawab empat celah sekaligus, yaitu (1) konfirmasi 5 duplikat dan 4 titik batas, (2) data fasilitas untuk kriteria ke-5, (3) durasi kunjungan nyata yang menggantikan asumsi per kategori, dan (4) waktu tempuh nyata untuk kalibrasi OSRM (3.3).' }
  ], [
    ['≥ 90% destinasi dalam cakupan terverifikasi (atau semua yang berulasan ≥ 100).', 'Jadwalkan survei tambahan; bagi wilayah per anggota.'],
    ['Koordinat lapangan berbeda > 50 m dari data awal sudah diperbarui.', 'Ganti koordinat dengan hasil GPS lapangan.']
  ]),
  ...langkah('2.8', 'Klasifikasi dan atribut turunan', { pj: 'D (pemeriksa: C)', masuk: '`wisata_bersih_v2.xlsx`', keluar: 'Kolom `kategori`, `biaya_rp`, `biaya_skala`, `durasi_jam`, `skor_fasilitas`', waktu: '1 hari' }, [
    { tabel: [['Atribut', 'Aturan'], [
      ['biaya_rp', 'Nilai tengah harga tiket; untuk objek menginap dipakai batas bawah harga paket menginap.'],
      ['biaya_skala (C2)', 'Gratis = 1; ≤ Rp5.000 = 2; ≤ Rp15.000 = 3; ≤ Rp50.000 = 4; > Rp50.000 = 5.'],
      ['durasi_jam', 'Hasil ground check; bila belum ada: Alam 1,5; puncak/bukit 1,0; Alam-Buatan 1,0; Religi 0,75; Agro 1,0; Akomodasi 1,5.'],
      ['skor_fasilitas (C5, baru)', 'Jumlah fasilitas yang ada (0–5): toilet, parkir, warung, musala, akses mobil.']
    ], [1.6, 5]] }
  ], [
    ['Tidak ada sel kosong pada atribut turunan untuk destinasi dalam cakupan.', 'Isi dari ground check atau gunakan aturan cadangan, lalu tandai sebagai "estimasi".']
  ]),
  ...langkah('2.9', 'Membangun basis data dan berkas web', { pj: 'C (pemeriksa: E)', masuk: '`wisata_bersih_v2.xlsx`, RBI', keluar: '`db/*.gpkg`, `db/*.csv`, `data/*.geojson`, `data/data.js`', waktu: '1 hari' }, [
    'Cara manual: dari QGIS, ekspor lapisan ke GeoJSON (EPSG:4326, presisi koordinat 6 desimal) dan GeoPackage. Cara otomatis: jalankan pipeline acuan berikut.',
    { kode: ['"C:\\Program Files\\QGIS 3.44.11\\apps\\Python312\\python.exe" pipeline/build_data.py ^', '    "<RBI25K_KULONPROGOgdb.gdb>" "<wisata_bersih_v2.xlsx>" .'] },
    'Untuk QGIS desktop, sediakan juga berkas proyek `.qgz` (`pipeline/make_qgis_project.py`) agar data dapat dibuka cukup dengan klik ganda.'
  ], [
    ['GeoPackage terbuka di QGIS: 4 lapisan valid, CRS EPSG:4326.', 'Pastikan tipe geometri eksplisit (MultiPolygon/MultiLineString) dan format GPKG 1.2 (`pipeline/export_gis.py`).'],
    ['Jumlah fitur di GeoJSON = jumlah baris Excel dalam cakupan.', 'Cari baris yang hilang (koordinat kosong atau salah format), lalu ulangi 2.3–2.9.']
  ])
];

/* ------------------------------------------------------------------ fase 3 */
const fase3 = [
  H1('3. Fase Jaringan Jalan dan Waktu Tempuh'),
  ...langkah('3.1', 'Memilih dan menguji layanan routing', { pj: 'B (pemeriksa: E)', masuk: 'Koordinat 2 destinasi', keluar: 'Catatan uji OSRM (jarak, waktu)', waktu: '½ hari' }, [
    'Gunakan OSRM (Open Source Routing Machine) di atas data OpenStreetMap. Uji dengan membuka URL berikut di peramban; hasilnya berupa JSON berisi `distance` (meter) dan `duration` (detik).',
    { kode: ['https://router.project-osrm.org/route/v1/driving/110.2255,-7.6680;110.1161,-7.7628?overview=false'] },
    { catatan: 'Server OSRM publik gratis, tetapi dibatasi sekitar 1 permintaan per detik dan tidak dijamin selalu tersedia. Untuk demo dan uji akademik sudah memadai; untuk operasional jangka panjang lihat 8.5.' }
  ], [
    ['Respons berstatus `"code":"Ok"`.', 'Periksa urutan koordinat (OSRM memakai **bujur,lintang**), lalu cek koneksi.']
  ]),
  ...langkah('3.2', 'Membuat matriks waktu/jarak antar-destinasi', { pj: 'B (pemeriksa: C)', masuk: 'Daftar destinasi (≤ 100 titik)', keluar: '`data/matriks_osrm.json` (detik & meter)', waktu: '½ hari' }, [
    'Gunakan layanan *Table* OSRM: satu permintaan untuk semua titik (`/table/v1/driving/{lon,lat;...}?annotations=duration,distance`). Simpan nilai `sources[].distance` untuk mengetahui jarak titik ke jalan terdekat.'
  ], [
    ['Tidak ada nilai `null` pada matriks.', 'Geser koordinat titik ke gerbang/parkir yang terhubung jalan (hasil 2.7), lalu ulangi.'],
    ['Titik yang berjarak > 300 m ke jalan sudah diperiksa.', 'Purwarupa: Puncak Kuda Sembrani (320 m); pastikan koordinat parkirnya.']
  ]),
  ...langkah('3.3', 'Analisis jarak jalan dan kalibrasi waktu tempuh', { pj: 'B (pemeriksa: A)', masuk: 'Matriks OSRM + catatan waktu tempuh lapangan', keluar: 'Rasio jalan/garis lurus, faktor koreksi waktu', waktu: '1 hari' }, [
    'Hitung rasio jarak jalan terhadap jarak garis lurus untuk semua pasangan berjarak > 1,5 km. Pada purwarupa rata-ratanya **1,74**, yang memperkuat alasan memakai routing jaringan jalan. Bandingkan waktu OSRM dengan waktu nyata yang dicatat saat ground check pada minimal 10 ruas.',
    { catatan: '**Perbaikan:** kecepatan rata-rata model OSRM sekitar 43 km/jam, kemungkinan terlalu optimistis untuk jalan menanjak di Menoreh. Jika waktu nyata rata-rata lebih lama, misalnya 1,3 kali, tambahkan faktor koreksi waktu tempuh pada sistem (dikalikan ke waktu OSRM) dan laporkan dasar perhitungannya.' }
  ], [
    ['Selisih waktu OSRM vs nyata dilaporkan (rata-rata dan rentang).', 'Tambah ruas uji; catat dengan stopwatch dan GPS.']
  ])
];

/* ------------------------------------------------------------------ fase 4 */
const fase4 = [
  H1('4. Fase Pembobotan AHP'),
  ...langkah('4.1', 'Menetapkan kriteria final', { pj: 'A (pemeriksa: C)', masuk: 'Ketersediaan data (Fase 2–3)', keluar: 'Tabel kriteria: kode, nama, sifat, satuan, sumber', waktu: '½ hari' }, [
    { tabel: [['Kode', 'Kriteria', 'Sifat', 'Nilai'], [['C1', 'Waktu tempuh', 'cost', 'menit (OSRM)'], ['C2', 'Biaya kunjungan', 'cost', 'skala 1–5'], ['C3', 'Rating', 'benefit', '1–5'], ['C4', 'Popularitas', 'benefit', 'ln(1 + ulasan)'], ['C5 (baru)', 'Kelengkapan fasilitas', 'benefit', '0–5 (dari ground check)']], [0.8, 2, 1, 2]] },
    'Jika C5 ditambahkan, kuesioner AHP menjadi 10 pasangan perbandingan (n = 5, RI = 1,12).'
  ], [
    ['Setiap kriteria punya data untuk ≥ 95% destinasi.', 'Bila belum, tunda kriteria tersebut atau lengkapi datanya lewat 2.7.']
  ]),
  ...langkah('4.2', 'Menyusun dan menyebar kuesioner AHP', { pj: 'A (pendamping: D)', masuk: 'Tabel kriteria', keluar: 'Jawaban responden (Google Form → Excel)', waktu: '1–2 minggu' }, [
    { langkah: ['Buat Google Form dari Lampiran C laporan: satu pertanyaan per pasangan dengan skala 9…1…9.', 'Responden: minimal 15–30 orang (wisatawan, pengelola, perangkat kapanewon, pakar pariwisata); catat kategori responden.', 'Uji coba form ke 2 orang terlebih dahulu agar arah skala dipahami.'] }
  ], [
    ['Jumlah responden sesuai target.', 'Perpanjang waktu, sebar lewat pengelola desa wisata.']
  ]),
  ...langkah('4.3', 'Mengolah AHP dan uji konsistensi', { pj: 'A (pemeriksa: C)', masuk: 'Jawaban responden', keluar: 'Bobot w, λmaks, CI, CR', waktu: '1 hari' }, [
    { langkah: ['Masukkan jawaban ke `docs/Instrumen_Kuesioner_AHP_SUS.xlsx` lembar *AHP_Responden*.', 'Hitung CR setiap responden; jawaban dengan CR > 0,10 ditinjau atau dikeluarkan (catat jumlahnya).', 'Gabungkan dengan rata-rata geometris (sudah berumus di lembar tersebut), lalu hitung bobot dan CR agregat.', 'Cocokkan dengan kalkulator AHP di tab "Metode AHP–SAW" WebGIS.'] }
  ], [
    ['CR agregat ≤ 0,10.', 'Tinjau responden dengan CR tinggi; jangan "memperbaiki" angka responden tanpa konfirmasi.'],
    ['Bobot Excel = bobot kalkulator web (selisih < 0,005).', 'Periksa urutan kriteria dan arah perbandingan (a₁₂ vs a₂₁).']
  ]),
  ...langkah('4.4', 'Menetapkan bobot default sistem', { pj: 'C (pemeriksa: A)', masuk: 'Matriks agregat', keluar: 'Bobot default di sistem', waktu: '1 jam' }, [
    'Ganti `AHP_DEFAULT` pada `pipeline/build_data.py` dengan matriks agregat, lalu jalankan ulang pipeline (2.9). Bobot ini menggantikan **penilaian sementara tim** (CR 0,017) yang dipakai purwarupa.'
  ], [
    ['Tab Metode menampilkan bobot baru dan CR ≤ 0,10.', 'Pastikan `data/data.js` sudah dibangun ulang dan peramban di-*refresh* (Ctrl+F5).']
  ])
];

/* ------------------------------------------------------------------ fase 5 */
const fase5 = [
  H1('5. Fase Perhitungan SAW dan Rute'),
  ...langkah('5.1', 'Menyusun matriks keputusan dan normalisasi di Excel', { pj: 'C (pemeriksa: A)', masuk: 'Data 2.9, matriks OSRM, bobot 4.4', keluar: 'Lembar Excel SAW per skenario', waktu: '1 hari' }, [
    { langkah: ['Pilih titik awal (misalnya Gerbosari) dan ambil waktu tempuh ke semua destinasi dari matriks/OSRM.', 'Terapkan penyaringan sesuai jawaban pengguna (kategori, waktu, anggaran, rating).', 'Normalisasi: cost r = MIN(kolom)/x; benefit r = x/MAX(kolom).', 'Nilai preferensi V = Σ w·r (SUMPRODUCT); urutkan dengan RANK.'] },
    'Acuan berumus: `docs/Validasi_AHP_SAW.xlsx` (4 skenario).'
  ], [
    ['Contoh hitung tangan 3 destinasi sama dengan hasil Excel.', 'Periksa sifat kriteria (cost/benefit) dan bobot yang dinormalisasi (Σw = 1).']
  ]),
  ...langkah('5.2', 'Menyusun rute nearest neighbour', { pj: 'C (pemeriksa: E)', masuk: '10 destinasi teratas SAW, matriks OSRM', keluar: 'Urutan kunjungan per skenario', waktu: '½ hari' }, [
    { langkah: ['Mulai dari titik awal; pilih kandidat terdekat (waktu tempuh) di antara 10 teratas.', 'Tambahkan kandidat hanya jika total waktu (tempuh + kunjungan [+ pulang]) ≤ waktu tersedia dan total biaya ≤ anggaran.', 'Ulangi sampai tidak ada kandidat layak atau jumlah maksimum pemberhentian tercapai.'] },
    { catatan: '**Perbaikan opsional:** nearest neighbour dapat menghasilkan rute bolak-balik. Tambahkan perbaikan 2-opt (tukar urutan dua ruas bila total waktu berkurang) atau gunakan layanan *Trip* OSRM, lalu bandingkan total waktunya dengan NN.' }
  ], [
    ['Rute tidak melanggar batas waktu dan anggaran pada semua skenario.', 'Periksa apakah durasi kunjungan dan waktu pulang ikut dihitung.']
  ])
];

/* ------------------------------------------------------------------ fase 6 */
const fase6 = [
  H1('6. Fase Pembangunan WebGIS'),
  P('Fase ini dikerjakan E (antarmuka dan integrasi) bersama C (logika perhitungan). Kode acuan ada di folder purwarupa: `index.html`, `css/style.css`, `js/app.js` (antarmuka), `js/rekom.js` (AHP–SAW–rute), dan `js/navigasi.js` (navigasi).'),
  ...langkah('6.1', 'Kerangka halaman dan peta', { pj: 'E (pemeriksa: B)', masuk: '`data/data.js`', keluar: 'Halaman dengan peta, batas wilayah, dan marker destinasi', waktu: '2 hari' }, [
    { kode: ['<link rel="stylesheet" href="vendor/leaflet/leaflet.css">', '<div id="map"></div>', '<script src="vendor/leaflet/leaflet.js"></script>', '<script src="data/data.js"></script>', '<script>', '  const map = L.map("map").setView([-7.705, 110.185], 12);', '  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",', '    { attribution: "&copy; OpenStreetMap" }).addTo(map);', '  L.geoJSON(window.KAPANEWON).addTo(map);', '  L.geoJSON(window.WISATA).addTo(map);', '</script>'] },
    'Simpan Leaflet di folder `vendor/` (bukan dari CDN) agar demo tetap jalan walau CDN bermasalah. Data dimuat sebagai `data.js` (bukan `fetch`), sehingga `index.html` juga dapat dibuka langsung dari berkas.'
  ], [
    ['70 marker tampil, batas 3 kapanewon terlihat, tidak ada error di Console (F12).', 'Periksa urutan `<script>` (Leaflet → data → app) dan path berkas.']
  ]),
  ...langkah('6.2', 'Panduan 5 pertanyaan saat web dibuka', { pj: 'E (pemeriksa: D)', masuk: 'Lingkup 1.1', keluar: 'Layar panduan layar penuh dengan 5 langkah + ringkasan', waktu: '2 hari' }, [
    { langkah: ['Pertanyaan 1 (lokasi): tombol GPS (`navigator.geolocation`), peta mini yang dapat diklik, pencarian nama tempat (Nominatim), pilihan cepat.', 'Pertanyaan 2–5: kartu/tombol pilihan + isian "lainnya".', 'Ringkasan jawaban dengan tautan "ubah"; tombol "Tampilkan Rekomendasi" langsung menjalankan perhitungan.', 'Tombol "Ubah preferensi" di header untuk membuka panduan kembali.'] }
  ], [
    ['Teks kelima pertanyaan persis sesuai lingkup; tombol Lanjut nonaktif sebelum lokasi diisi.', 'Sesuaikan teks; tambahkan validasi.'],
    ['Panduan nyaman dipakai di layar ponsel 390 px.', 'Ubah tata letak responsif (`@media`), uji dengan DevTools mode perangkat.']
  ]),
  ...langkah('6.3', 'Integrasi perhitungan AHP–SAW', { pj: 'C (pemeriksa: E)', masuk: 'Rumus 5.1', keluar: '`js/rekom.js` (fungsi `ahp`, `saring`, `saw`, `susunRute`)', waktu: '2 hari' }, [
    'Pisahkan logika perhitungan dari tampilan (berkas JS tersendiri tanpa dependensi) agar dapat diuji otomatis dengan Node.js (7.1).',
    { kode: ['function saw(alts, w) {            // alts: [{x:[c1,c2,c3,c4]}]', '  const ext = [0,1,2,3].map(j => SIFAT[j] === "cost"', '      ? Math.min(...alts.map(a => a.x[j]))', '      : Math.max(...alts.map(a => a.x[j])));', '  return alts.map(a => {', '    const r = a.x.map((x, j) => SIFAT[j] === "cost" ? ext[j] / x : x / ext[j]);', '    return { ...a, r, V: r.reduce((s, rj, j) => s + w[j] * rj, 0) };', '  }).sort((p, q) => q.V - p.V);', '}'] }
  ], [
    ['Hasil web = hasil Excel 5.1 untuk skenario yang sama (selisih < 10⁻⁹).', 'Bandingkan kolom per kolom pada tabel "Lihat perhitungan SAW".']
  ]),
  ...langkah('6.4', 'Waktu tempuh langsung dari lokasi pengguna', { pj: 'E (pemeriksa: B)', masuk: 'Titik awal pengguna', keluar: 'Waktu/jarak ke semua destinasi', waktu: '1 hari' }, [
    'Satu permintaan OSRM *Table* dengan `sources=0` (titik pengguna = indeks 0). Siapkan **cadangan** jika OSRM tidak menjawab: jarak garis lurus × 1,74 dengan kecepatan 43 km/jam (atau nilai kalibrasi 3.3), dan tampilkan label "estimasi".'
  ], [
    ['Pencarian tetap memberi hasil walau internet diputus (mode estimasi).', 'Tambahkan `try/catch` dan batas waktu (AbortController 15 detik).']
  ]),
  ...langkah('6.5', 'Tampilan hasil: peringkat, rute, dan transparansi', { pj: 'E (pemeriksa: C)', masuk: 'Keluaran `rekom.js`', keluar: 'Kartu kriteria, peringkat 10 besar, lini waktu rute, tabel perhitungan SAW', waktu: '2 hari' }, [
    { langkah: ['Kartu "Kriteria perjalanan Anda" (jawaban panduan).', 'Peringkat dengan nilai V dan batang kontribusi kriteria; marker bernomor; destinasi yang tidak lolos diredupkan.', 'Sub-tab rute: lini waktu kunjungan, total waktu/biaya, garis rute di jaringan jalan.', 'Tombol "Lihat perhitungan SAW" (X, R, V) dan "Destinasi tersaring" (beserta alasan).'] }
  ], [
    ['Penguji dapat menelusuri satu nilai V dari tabel sampai rumus.', 'Tambahkan kolom yang kurang (min/max, bobot) pada tabel transparansi.']
  ]),
  ...langkah('6.6', 'Navigasi rute di dalam WebGIS (tanpa Google Maps)', { pj: 'E (pemeriksa: B)', masuk: 'Urutan rute 5.2', keluar: 'Petunjuk arah berbahasa Indonesia + mode navigasi GPS + simulasi', waktu: '3–4 hari' }, [
    P('Navigasi dapat dibuat sepenuhnya di WebGIS karena OSRM menyediakan petunjuk langkah demi langkah (*steps*). Langkah pembuatannya sebagai berikut.'),
    { langkah: [
      '**Ambil rute + petunjuk.** Minta rute untuk titik awal dan semua pemberhentian sekaligus: `.../route/v1/driving/{lon,lat;...}?overview=full&geometries=geojson&steps=true`. Respons berisi `legs` (satu per pemberhentian), dan setiap leg berisi `steps` dengan `maneuver.type` (depart, turn, fork, roundabout, arrive, …), `maneuver.modifier` (left, right, slight left, …), `name` (nama jalan), `distance`, dan `geometry`.',
      '**Terjemahkan ke bahasa Indonesia.** Buat tabel terjemahan, misalnya turn + left menjadi "Belok kiri ke {nama jalan}", arrive menjadi "Tiba di {destinasi}", dan roundabout + exit 2 menjadi "Masuk bundaran, ambil jalan keluar ke-2". Acuan: fungsi `teksInstruksi` di `js/navigasi.js`.',
      '**Tampilkan daftar petunjuk** per pemberhentian, lengkap dengan ikon panah dan jarak. Klik satu langkah untuk memusatkan peta ke lokasi manuver.',
      '**Mode navigasi GPS.** `navigator.geolocation.watchPosition` memberi posisi setiap beberapa detik. Proyeksikan posisi ke garis rute untuk mendapatkan "jarak tempuh sepanjang rute", lalu tentukan langkah berikutnya, yaitu manuver pertama di depan posisi. Tampilkan banner: jarak ke manuver, kalimat petunjuk, pemberhentian tujuan, serta sisa jarak dan waktu.',
      '**Jalan pergi-pulang.** Bila rute melewati ruas yang sama dua kali, pilih proyeksi yang tidak mundur dari posisi terakhir agar petunjuk tidak melompat.',
      '**Keluar jalur.** Jika posisi menyimpang lebih dari 60 m (atau 1,5 × akurasi GPS) pada 3 pembacaan berturut-turut, minta rute baru dari posisi pengguna ke pemberhentian yang tersisa.',
      '**Tiba.** Saat sisa jarak leg < 25 m, tampilkan "Tiba di …" lalu lanjut ke leg berikutnya; di akhir rute, hentikan pelacakan.',
      '**Pelengkap.** Tombol "Ikuti posisi" (peta mengikuti pengguna), "Suara" (`speechSynthesis`, bahasa id-ID), "Akhiri navigasi", dan **Simulasi perjalanan** yang menggerakkan posisi di sepanjang rute untuk presentasi di dalam ruangan.'
    ] },
    { kode: ['navigator.geolocation.watchPosition(p => {', '  const st = Navigasi.statusNavigasi(model, p.coords.latitude, p.coords.longitude, lastS);', '  if (st.menyimpang < 60) lastS = st.sepanjang; else offCount++;', '  banner(st.keManuver, st.langkah.teks, st.tujuan.nama, st.sisaTotal);', '  if (offCount >= 3) hitungUlangRute(p.coords);', '}, err => alert(err.message), { enableHighAccuracy: true, maximumAge: 2000 });'] },
    { catatan: '**Penting:** peramban hanya mengizinkan GPS pada halaman **HTTPS** atau `localhost`. Karena itu navigasi GPS baru bisa diuji di ponsel setelah web dipublikasikan dengan HTTPS (8.2). Sebelum itu gunakan tombol Simulasi.' }
  ], [
    ['Daftar petunjuk tampil untuk semua pemberhentian dan kalimatnya wajar dalam bahasa Indonesia.', 'Tambah atau perbaiki entri tabel terjemahan untuk `maneuver.type` yang belum tertangani.'],
    ['Simulasi berjalan dari titik awal sampai "Anda telah tiba".', 'Periksa proyeksi posisi (jalan pergi-pulang) dan syarat tiba.'],
    ['Uji lapangan (7.4): petunjuk muncul sebelum belokan dan rute dihitung ulang saat salah belok.', 'Atur ambang jarak (60 m, 3 pembacaan) sesuai akurasi GPS ponsel.']
  ]),
  ...langkah('6.7', 'Tab Jelajah, Metode, Data, dan Tentang', { pj: 'E (pemeriksa: A)', masuk: 'Basis data, bobot AHP', keluar: 'Tab pelengkap', waktu: '2 hari' }, [
    { langkah: ['Jelajah: pencarian, filter kategori dan kapanewon, detail destinasi.', 'Metode: alur, kriteria, rumus, kalkulator AHP interaktif (menolak CR > 0,10).', 'Data & Mutu: rekap kategori × kapanewon, ringkasan kendali mutu, unduh GeoJSON/CSV.', 'Tentang: tim, sumber data, keterbatasan, atribusi OpenStreetMap/OSRM.'] }
  ], [
    ['Atribusi peta dasar dan sumber data tampil.', 'Tambahkan atribusi (wajib menurut lisensi OSM).']
  ])
];

/* ------------------------------------------------------------------ fase 7 */
const fase7 = [
  H1('7. Fase Pengujian'),
  ...langkah('7.1', 'Uji unit perhitungan dan navigasi', { pj: 'E (pemeriksa: C)', masuk: '`js/rekom.js`, `js/navigasi.js`', keluar: 'Laporan uji (semua lulus)', waktu: '1 hari' }, [
    { kode: ['npm test        # menjalankan tests/test_core.js dan tests/test_navigasi.js'] },
    'Purwarupa: 21 uji lulus (contoh buku Saaty, SAW hitung tangan, penyaringan, batas rute, terjemahan petunjuk, proyeksi posisi, jalan pergi-pulang, keluar jalur, simulasi rute 12 km).'
  ], [['Semua uji lulus.', 'Perbaiki kode, bukan uji, kecuali ujinya terbukti salah (diskusikan dengan pemeriksa).']]),
  ...langkah('7.2', 'Validasi silang terhadap Excel', { pj: 'C (pemeriksa: A)', masuk: 'Excel 5.1, keluaran web', keluar: 'Tabel validasi 4 skenario', waktu: '½ hari' }, [
    'Bandingkan V dan peringkat web dengan Excel (atau skrip `tests/cross_check.py`). Laporkan selisih maksimum dan kesamaan urutan.'
  ], [['Peringkat identik dan selisih V ≤ 10⁻⁹.', 'Cari kolom yang berbeda: biasanya titik awal, bobot, atau aturan penyaringan.']]),
  ...langkah('7.3', 'Black-box testing', { pj: 'A (pelaksana: B, D)', masuk: 'Daftar skenario uji', keluar: 'Tabel black-box (skenario, harapan, hasil, status)', waktu: '1 hari' }, [
    'Jalankan skenario di Lampiran laporan (33 skenario pada purwarupa, termasuk panduan, rute, dan navigasi). Uji otomatis: `node tests/run_blackbox.js`. Tetap lakukan juga uji manual di 2 ponsel berbeda (Android/iOS) dan 2 peramban.'
  ], [['100% skenario sesuai.', 'Catat bug di GitHub *Issues*, perbaiki (Fase 6), lalu ulangi skenario yang gagal.']]),
  ...langkah('7.4', 'Uji lapangan navigasi', { pj: 'B (pendamping: D, E)', masuk: 'WebGIS ber-HTTPS (8.2), ponsel dengan GPS', keluar: 'Log uji lapangan: ketepatan petunjuk, hitung ulang, waktu nyata vs estimasi', waktu: '1 hari' }, [
    { langkah: ['Jalankan navigasi untuk satu rute rekomendasi (3–4 pemberhentian) dengan kendaraan, didampingi satu orang pencatat.', 'Catat: apakah petunjuk muncul sebelum belokan, apakah ada petunjuk yang salah, dan apakah rute dihitung ulang saat sengaja salah belok.', 'Catat waktu tempuh nyata per ruas (sekaligus untuk kalibrasi 3.3).'] }
  ], [['Tidak ada petunjuk yang menyesatkan; hitung ulang bekerja.', 'Laporkan ruas bermasalah; perbaiki data OSM (lihat catatan) atau ambang navigasi.']]),
  P('Catatan: jika jaringan jalan di OpenStreetMap salah (misalnya jalan tertutup atau arah keliru), tim dapat memperbaikinya langsung di openstreetmap.org dengan akun OSM. Perubahan akan masuk ke OSRM publik setelah pembaruan data berikutnya. Ini juga dapat menjadi kontribusi pengabdian proyek.'),
  ...langkah('7.5', 'Uji kegunaan System Usability Scale (SUS)', { pj: 'A (pelaksana: semua)', masuk: 'Web publik (8.2), kuesioner SUS (Lampiran D)', keluar: 'Skor SUS rata-rata + interpretasi', waktu: '1–2 minggu' }, [
    { langkah: ['Rekrut minimal 30 responden calon pengguna.', 'Berikan 3 tugas: (1) cari dan buka detail destinasi, (2) jawab panduan 5 pertanyaan dan pahami hasilnya, (3) jalankan navigasi atau simulasi rute.', 'Isi kuesioner SUS; olah di lembar *SUS* pada `Instrumen_Kuesioner_AHP_SUS.xlsx`.'] }
  ], [['Rata-rata SUS ≥ 68 (di atas rata-rata).', 'Lihat butir dengan skor terendah, perbaiki tampilan atau alur (Fase 6), lalu uji ulang dengan responden baru.']])
];

/* ------------------------------------------------------------------ fase 8 */
const fase8 = [
  H1('8. Fase Publikasi (Agar Dapat Diakses Semua Orang)'),
  P('WebGIS ini berupa situs statis (HTML, CSS, JS, dan data) sehingga dapat dipublikasikan **gratis** tanpa server basis data. Dua pilihan disajikan berikut; cukup pilih satu.'),
  ...langkah('8.1', 'Menyiapkan repositori untuk publikasi', { pj: 'E (pemeriksa: A)', masuk: 'Kode final di cabang `main`', keluar: 'Repositori publik siap tayang', waktu: '1 jam' }, [
    { langkah: ['Pastikan `index.html` berada di akar repositori dan semua path bersifat relatif (`css/style.css`, bukan `C:\\...`).', 'Jangan unggah data pribadi atau kunci API.', 'Ukuran repositori < 100 MB per berkas (GitHub). GeoPackage dan dokumen besar boleh ditaruh di folder `db/` dan `docs/`, atau di rilis GitHub.'] }
  ], [['Klik ganda `index.html` dari folder hasil *clone* bersih berjalan normal.', 'Perbaiki path absolut atau berkas yang lupa di-*commit*.']]),
  ...langkah('8.2', 'Publikasi dengan GitHub Pages (pilihan 1)', { pj: 'E', masuk: 'Repositori publik', keluar: 'Tautan `https://<akun>.github.io/<repo>/`', waktu: '15 menit' }, [
    { langkah: ['Buka repositori di GitHub → **Settings → Pages**.', 'Pada *Build and deployment*, pilih *Source*: **Deploy from a branch**, *Branch*: **main**, folder **/(root)**, lalu **Save**.', 'Tunggu 1–3 menit; tautan muncul di bagian atas halaman Pages. Tautan sudah HTTPS, sehingga GPS dan navigasi berfungsi di ponsel.', 'Setiap *push* ke `main` otomatis memperbarui situs.'] }
  ], [['Tautan terbuka dari ponsel memakai data seluler (bukan Wi-Fi kampus).', 'Tunggu proses deploy di tab *Actions*; periksa huruf besar/kecil pada nama berkas (server Linux membedakannya).']]),
  ...langkah('8.3', 'Publikasi dengan Vercel (pilihan 2)', { pj: 'E', masuk: 'Repositori GitHub', keluar: 'Tautan `https://<nama>.vercel.app`', waktu: '15 menit' }, [
    { langkah: ['Masuk ke vercel.com dengan akun GitHub → **Add New → Project** → pilih repositori.', '*Framework Preset*: **Other**; *Build Command*: kosong; *Output Directory*: `.` (akar).', 'Klik **Deploy**; Vercel memberi tautan HTTPS dan pratinjau untuk setiap *pull request*.'] }
  ], [['Tautan terbuka dan peta tampil.', 'Periksa *Output Directory* dan log build di dasbor Vercel.']]),
  ...langkah('8.4', 'Uji akhir dari berbagai perangkat', { pj: 'A (pelaksana: semua)', masuk: 'Tautan publik', keluar: 'Daftar cek perangkat', waktu: '½ hari' }, [
    { tabel: [['Cek', 'Android', 'iPhone', 'Laptop'], [['Panduan 5 pertanyaan & hasil', '', '', ''], ['GPS "Gunakan lokasi saya"', '', '', ''], ['Navigasi GPS + suara', '', '', ''], ['Simulasi perjalanan', '', '', ''], ['Unduh GeoJSON/CSV', '', '', '']], [3, 1, 1, 1]] }
  ], [['Semua sel tercentang.', 'Catat masalah per perangkat di GitHub Issues dan perbaiki.']]),
  ...langkah('8.5', 'Keberlanjutan layanan (setelah proyek)', { pj: 'E + A', masuk: '—', keluar: 'Rencana pemeliharaan & serah terima', waktu: '½ hari' }, [
    ...bullets([
      '**Routing:** server OSRM publik memiliki batas penggunaan. Untuk pemakaian luas: (a) daftar OpenRouteService (gratis dengan kunci API), atau (b) pasang OSRM sendiri dari ekstrak OSM Jawa (Docker) di server kapanewon/kampus, lalu ganti alamat `OSRM` di `js/app.js`.',
      '**Peta dasar:** hormati kebijakan tile OpenStreetMap (atribusi, trafik wajar). Untuk trafik tinggi, gunakan penyedia tile dengan kunci API.',
      '**Pembaruan data:** serahkan Excel, kamus data, dan panduan pipeline kepada pemerintah kapanewon; jadwalkan pembaruan rating, harga, dan jam operasional setiap 6 bulan.'
    ])
  ], null)
];

/* ------------------------------------------------------------------ fase 9 */
const fase9 = [
  H1('9. Fase Laporan dan Presentasi'),
  ...langkah('9.1', 'Memperbarui laporan', { pj: 'E (laporan akhir), C (laporan antara), A (penyunting)', masuk: 'Hasil Fase 2–8', keluar: 'Laporan final (.docx/.pdf)', waktu: '2–3 minggu' }, [
    'Gunakan `docs/Laporan_Proposal_WebGIS_Wisata_KulonProgo.docx` sebagai kerangka. Ganti semua bagian bertanda **[Catatan tim]** (sorot kuning) dengan hasil nyata: bobot AHP kuesioner, hasil SUS, hasil ground check, kalibrasi waktu tempuh, dan uji lapangan navigasi. Perbarui juga daftar pustaka (cek DOI setiap rujukan).'
  ], [['Tidak ada lagi sorotan kuning; semua angka di laporan dapat ditelusuri ke berkas data/uji.', 'Lengkapi bagian yang tersisa sebelum dikirim ke pembimbing.']]),
  ...langkah('9.2', 'Gladi presentasi', { pj: 'A (semua tampil)', masuk: 'Web publik, laporan', keluar: 'Presentasi ±15 menit + demo ±10 menit', waktu: '2 hari' }, [
    { tabel: [['Bagian', 'Penyaji', 'Durasi'], [['Latar belakang, tujuan, lingkup', 'A', '2 menit'], ['Data, overlay, kendali mutu', 'D + B', '3 menit'], ['Jaringan jalan & OSRM', 'B', '2 menit'], ['AHP & SAW (contoh hitung)', 'A + C', '4 menit'], ['Demo WebGIS: panduan → peringkat → rute → navigasi (simulasi) → perhitungan SAW', 'E', '6 menit'], ['Pengujian & kesimpulan', 'A', '3 menit']], [4, 1.2, 1]] },
    'Siapkan cadangan demo: rekaman layar navigasi dan opsi `?tanpa-panduan`, kalau-kalau internet ruang sidang bermasalah.'
  ], [['Setiap anggota dapat menjawab pertanyaan di Lampiran F laporan untuk bagiannya.', 'Latihan tanya-jawab silang antaranggota.']])
];

/* ------------------------------------------------------------------ status & perbaikan */
const perbaikan = [
  H1('10. Status Purwarupa dan Daftar Perbaikan'),
  P('Tabel ini merangkum hal yang **sudah selesai** pada purwarupa dan hal yang **masih kurang** sehingga wajib diperbaiki tim. Kolom "Langkah" menunjukkan bagian panduan yang memuat cara memperbaikinya.'),
  ...table(['Komponen', 'Status purwarupa', 'Yang masih kurang / perlu diperbaiki', 'Langkah'], [
    ['Data destinasi', '88 → 83 destinasi; 70 dalam cakupan; overlay RBI', 'Ground check 5 duplikat, 4 titik batas, harga & jam; data fasilitas belum ada', '2.2, 2.6, 2.7'],
    ['Struktur data', 'Harga & jam berupa teks, dibersihkan otomatis', 'Pisahkan menjadi kolom angka/jam sejak pengumpulan', '2.2, 2.3'],
    ['Durasi kunjungan', 'Asumsi per kategori', 'Ganti dengan hasil observasi/wawancara', '2.7, 2.8'],
    ['Waktu tempuh', 'OSRM (±43 km/jam), rasio jalan 1,74', 'Kalibrasi dengan waktu nyata di jalan Menoreh', '3.3'],
    ['Bobot AHP', 'Penilaian sementara tim (CR 0,017)', 'Kuesioner responden + agregasi geometris', '4.2–4.4'],
    ['Kriteria fasilitas', 'Belum dipakai', 'Tambahkan C5 setelah ground check', '4.1'],
    ['Rute', 'Nearest neighbour, memenuhi batas waktu/anggaran', 'Opsional 2-opt / OSRM Trip untuk rute bolak-balik', '5.2'],
    ['Navigasi', '**Sudah di dalam WebGIS**: petunjuk berbahasa Indonesia, GPS, hitung ulang, simulasi, suara (tanpa Google Maps)', 'Uji lapangan dengan ponsel & kendaraan; atur ambang', '6.6, 7.4'],
    ['Jam operasional', 'Ditampilkan, belum dipakai sebagai penyaring', 'Tambahkan masukan jam berangkat & cek jam buka', '2.2, 6.5'],
    ['Pengujian', '21 uji unit, validasi silang, 33 black-box lulus', 'Uji SUS ≥ 30 responden; uji di Android & iPhone', '7.3–7.5'],
    ['Publikasi', 'Berjalan lokal (localhost)', 'GitHub Pages/Vercel (HTTPS) agar dapat diakses semua orang dan GPS aktif', '8.1–8.4'],
    ['Keberlanjutan', 'OSRM & tile publik', 'Rencana OSRM sendiri/ORS untuk trafik tinggi; serah terima data', '8.5'],
    ['Laporan', '64 halaman, bertanda [Catatan tim]', 'Isi hasil nyata & verifikasi DOI pustaka', '9.1']
  ], [1.4, 2.4, 2.8, 0.8], { zebra: true }),
  H2('10.1 Urutan kerja yang disarankan mulai sekarang'),
  ...numbered([
    '**Minggu ini:** publikasikan purwarupa ke GitHub Pages (8.1–8.2) agar navigasi GPS bisa diuji di ponsel dan tautan bisa dibagikan ke pembimbing.',
    '**Paralel:** D + B menyiapkan ground check (2.7) dengan formulir yang memuat fasilitas, harga, jam, dan durasi; A menyebar kuesioner AHP (4.2).',
    '**Setelah ground check:** C memperbarui basis data dan pipeline (2.8–2.9), A menetapkan bobot AHP (4.3–4.4), B mengkalibrasi waktu tempuh (3.3).',
    '**Kemudian:** E menambahkan C5 dan penyaring jam operasional (6.3, 6.5), lalu seluruh tim menjalankan pengujian (Fase 7), termasuk uji lapangan navigasi dan SUS.',
    '**Terakhir:** laporan final dan gladi presentasi (Fase 9).'
  ])
];

/* ================================================================== dokumen */
const doc = new Document({
  creator: 'Tim PRGG Wisata Kulon Progo Utara', title: 'Panduan Pengerjaan Step-by-Step WebGIS Wisata Kulon Progo Utara',
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, font: FONT, color: GREEN }, paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, font: FONT, color: GREEN }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 23, bold: true, font: FONT, color: '1D2A24' }, paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 2, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B8862B', space: 2 } } } }
    ]
  },
  numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 500, hanging: 280 } } } }] }, ...NUMS] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1417, bottom: 1417, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Panduan Pengerjaan WebGIS Wisata Kulon Progo Utara · hlm. ', size: 16, color: '777777' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '777777' })] })] }) },
    children: [...sampul, ...pengantar, ...fase1, ...fase2, ...fase3, ...fase4, ...fase5, ...fase6, ...fase7, ...fase8, ...fase9, ...perbaikan]
  }]
});
const out = path.join(ROOT, 'docs', 'Panduan_Pengerjaan_Step_by_Step.docx');
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(out, b); console.log('tersimpan', out); });
