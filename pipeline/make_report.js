/*
 * Penyusun dokumen laporan (Word) dari data & hasil uji proyek.
 *   NODE_PATH=<folder node_modules berisi docx> node pipeline/make_report.js
 * Keluaran: docs/Laporan_Proposal_WebGIS_Wisata_KulonProgo.docx
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel,
  BorderStyle, ShadingType, TableBorders, LevelFormat, TableOfContents, StyleLevel, Footer, PageNumber, NumberFormat, PageBreak,
  TabStopType, VerticalAlign, Math: OMath, MathRun, MathFraction, MathSubScript, MathSum, HighlightColor, SectionType
} = require('docx');

const ROOT = path.join(__dirname, '..');
const RJ = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const QA = RJ('docs/qa_data.json');
const VS = RJ('docs/validasi_silang.json');
const BB = RJ('docs/hasil_blackbox.json');
const CFG = RJ('data/config.json');
const SC = RJ('tests/out/scenarios_js.json');
const WIS = RJ('data/wisata.geojson').features.map((f) => f.properties);
const IMG = (n) => path.join(ROOT, 'docs', 'gambar', n);

const FONT = 'Times New Roman';
const CW = 7938;                       // lebar isi (A4, margin kiri 4 cm, kanan 3 cm) dalam DXA
const FOREST = '1F5F4A';
const fmt = (x, d = 4) => Number(x).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
const fint = (x) => Number(x).toLocaleString('id-ID');

/* ------------------------------------------------------------------ teks kaya: **tebal**, *miring* */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (text, o = {}) => new Paragraph({
  children: runs(text, o.run || {}), alignment: o.align || AlignmentType.JUSTIFIED,
  indent: o.noIndent ? undefined : { firstLine: 567 }, spacing: { after: o.after != null ? o.after : 120, line: o.line || 360 },
  keepNext: o.keepNext
});
const PN = (text, o = {}) => P(text, { ...o, noIndent: true });
const H1 = (bab, judul, pageBreak = true) => new Paragraph({
  heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: pageBreak,
  children: [new TextRun({ text: bab }), ...(judul ? [new TextRun({ text: judul, break: 1 })] : [])], spacing: { after: 360 }
});
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)], spacing: { before: 240, after: 120 }, keepNext: true });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)], spacing: { before: 180, after: 100 }, keepNext: true });
const bullet = (t, lvl = 0) => new Paragraph({ numbering: { reference: 'bul', level: lvl }, children: runs(t), alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 360 } });
let numRef = 0;
function numbered(items, o = {}) {
  const ref = 'num' + (numRef++);
  NUMS.push({
    reference: ref, levels: [
      { level: 0, format: o.alpha ? LevelFormat.LOWER_LETTER : LevelFormat.DECIMAL, text: o.alpha ? '%1.' : '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 397 } } } },
      { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 964, hanging: 397 } } } }]
  });
  return items.map((it) => {
    const [t, lvl] = Array.isArray(it) ? it : [it, 0];
    return new Paragraph({ numbering: { reference: ref, level: lvl }, children: runs(t), alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 360 } });
  });
}
const NUMS = [];
// catatan bagi tim (disorot kuning) – menandai bagian yang masih harus dilengkapi/diganti
const NOTE = (t) => new Paragraph({
  children: [new TextRun({ text: '[Catatan tim] ', bold: true, highlight: HighlightColor.YELLOW }), new TextRun({ text: t, highlight: HighlightColor.YELLOW })],
  spacing: { after: 120, line: 300 }, alignment: AlignmentType.JUSTIFIED
});

/* ------------------------------------------------------------------ tabel */
const border = { style: BorderStyle.SINGLE, size: 4, color: '9AA59E' };
const borders = { top: border, bottom: border, left: border, right: border };
function cell(text, w, o = {}) {
  const paras = String(text).split('\n').map((line) => new Paragraph({
    children: runs(line, { size: o.size || 20, bold: o.bold, color: o.color }),
    alignment: o.align || AlignmentType.LEFT, spacing: { after: 0, line: 260 }
  }));
  return new TableCell({
    children: paras, width: { size: w, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 }, columnSpan: o.span
  });
}
function table(head, rows, widths, o = {}) {
  const sum = widths.reduce((a, b) => a + b, 0);
  const W = widths.map((w) => Math.round((w / sum) * CW));
  W[W.length - 1] += CW - W.reduce((a, b) => a + b, 0);
  const num = o.numCols || [];
  const trs = [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, W[i], { bold: true, fill: 'DCEAE2', align: AlignmentType.CENTER, size: o.size })) })];
  rows.forEach((r, ri) => trs.push(new TableRow({
    cantSplit: true,
    children: r.map((v, i) => cell(v == null ? '–' : v, W[i], { size: o.size, align: num.includes(i) ? AlignmentType.RIGHT : (o.center || []).includes(i) ? AlignmentType.CENTER : AlignmentType.LEFT, fill: (o.hl || []).includes(ri) ? 'FFF5DC' : undefined, bold: (o.boldRows || []).includes(ri) }))
  })));
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: W, rows: trs });
}
let gb = {}, tb = {}, SUSREF = '';
function capT(bab, judul) {
  tb[bab] = (tb[bab] || 0) + 1;
  return new Paragraph({ style: 'KeteranganTabel', children: [new TextRun(`Tabel ${bab}.${tb[bab]} ${judul}`)], keepNext: true });
}
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b };
}
function jpgSize(file) {
  const b = fs.readFileSync(file);
  for (let i = 2; i < b.length;) {
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), data: b };
    i += 2 + len;
  }
  throw new Error('JPEG tidak valid: ' + file);
}
function figure(file, bab, judul, widthCm = 14, sumber) {
  gb[bab] = (gb[bab] || 0) + 1;
  // tangkapan layar memakai versi JPEG (docs/gambar/jpg, dibuat pipeline/to_jpg.py) agar ukuran dokumen kecil
  const jpg = path.join(path.dirname(file), 'jpg', path.basename(file).replace(/\.png$/, '.jpg'));
  const useJpg = fs.existsSync(jpg);
  const s = useJpg ? jpgSize(jpg) : pngSize(file);
  const wpx = Math.round((widthCm / 2.54) * 96);
  const hpx = Math.round(wpx * s.h / s.w);
  const out = [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 }, children: [new ImageRun({ type: useJpg ? 'jpg' : 'png', data: s.data, transformation: { width: wpx, height: hpx }, altText: { title: judul, description: judul, name: path.basename(file) } })] }),
    new Paragraph({ style: 'KeteranganGambar', children: [new TextRun(`Gambar ${bab}.${gb[bab]} ${judul}`)] })
  ];
  if (sumber) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: sumber, size: 18, italics: true })] }));
  return out;
}
const refG = (bab) => `Gambar ${bab}.${(gb[bab] || 0) + 1}`;     // rujukan gambar berikutnya
const refT = (bab) => `Tabel ${bab}.${(tb[bab] || 0) + 1}`;

/* ------------------------------------------------------------------ persamaan */
const mr = (t) => new MathRun(t);
const sub = (a, b) => new MathSubScript({ children: [mr(a)], subScript: [mr(b)] });
function eq(mathChildren, no) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.CENTER, position: Math.round(CW / 2) }, { type: TabStopType.RIGHT, position: CW }],
    spacing: { before: 120, after: 120 },
    children: [new TextRun('\t'), new OMath({ children: mathChildren }), new TextRun(`\t(${no})`)]
  });
}

/* ================================================================== data turunan */
const inn = WIS.filter((d) => d.in_scope);
const KAT = CFG.kategori;
const KEC = CFG.target_kec;
const w = CFG.ahp_result.w;
const jvl = QA.jalan_vs_lurus;
const ULS = QA.ulasan_stat;
const topUlasan = inn.filter((d) => d.ulasan).sort((a, b) => b.ulasan - a.ulasan).slice(0, 10);
const rp = (n) => (n === 0 ? 'Gratis' : 'Rp' + fint(n));
const S1 = SC.find((s) => s.kode === 'S1');
const nameById = Object.fromEntries(WIS.map((d) => [d.id, d.nama]));
const LUAS_OFF = { Girimulyo: '54,91', Kalibawang: '52,96', Samigaluh: '69,29' };
const NDESA = { Girimulyo: 4, Kalibawang: 4, Samigaluh: 7 };

/* ================================================================== isi dokumen */
const anggota = [
  ['Mirdha Dhea Permata', '23/512640/TK/56337'], ['Maulida Fi Nurrin', '23/518483/TK/57087'], ['Muhammad Frisky Makarim', '23/518553/TK/57108'],
  ['Anindya R Putri Alindita', '23/521017/TK/57460'], ['Kharisma Alawiyah', '23/522504/TK/57685']
];
const JUDUL = '"Sistem Rekomendasi Destinasi dan Rute Wisata Kapanewon Girimulyo, Kalibawang, dan Samigaluh Berbasis WebGIS"';
const C = (t, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: o.after || 80 }, children: [new TextRun({ text: t, bold: o.bold, size: o.size || 24, font: FONT })] });
const anggotaTbl = () => new Table({
  width: { size: 6000, type: WidthType.DXA }, columnWidths: [3600, 2400], alignment: AlignmentType.CENTER, borders: TableBorders.NONE,
  rows: anggota.map(([n, k]) => new TableRow({
    children: [n, k].map((t, i) => new TableCell({
      width: { size: i ? 2400 : 3600, type: WidthType.DXA },
      borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
      children: [new Paragraph({ children: [new TextRun({ text: t, size: 24 })], spacing: { after: 40 } })]
    }))
  }))
});

const cover = [
  C('PROPOSAL DAN LAPORAN HASIL PELAKSANAAN', { bold: true, size: 28 }),
  C('PROYEK REKAYASA GEODESI-GEOMATIKA', { bold: true, size: 28, after: 400 }),
  C(JUDUL, { bold: true, size: 26, after: 600 }),
  C('Diusulkan oleh:', { after: 120 }), anggotaTbl(),
  C('', { after: 300 }), C('Dosen Pembimbing:', { after: 60 }), C('Dr. Dedi Atunggal S.P., S.T., M.Sc.'), C('NIP. 197912142005011003', { after: 900 }),
  C('PROGRAM STUDI SARJANA TEKNIK GEODESI', { bold: true }), C('DEPARTEMEN TEKNIK GEODESI', { bold: true }), C('FAKULTAS TEKNIK', { bold: true }),
  C('UNIVERSITAS GADJAH MADA', { bold: true }), C('YOGYAKARTA', { bold: true }), C('2026', { bold: true })
];

const pengesahan = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun('LEMBAR PENGESAHAN')], spacing: { after: 240 } }),
  C('PROYEK REKAYASA GEODESI-GEOMATIKA', { bold: true }), C(JUDUL, { bold: true, after: 300 }), C('Diajukan oleh:', { after: 120 }), anggotaTbl(),
  C('', { after: 600 }), C('Menyetujui,', { after: 200 }),
  new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW / 2, CW / 2], borders: TableBorders.NONE,
    rows: [new TableRow({
      children: [['Ketua Program Studi', 'Sarjana Teknik Geodesi', '', '', '', 'Ir. Heri Sutanta, S.T., M.Sc., Ph.D.', 'NIP. 197605232002121002'],
        ['Dosen Pembimbing', '\u00a0', '', '', '', 'Dr. Dedi Atunggal S.P., S.T., M.Sc.', 'NIP. 197912142005011003']].map((lines) => new TableCell({
          width: { size: CW / 2, type: WidthType.DXA },
          borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
          children: lines.map((t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: t ? 40 : 240 }, children: [new TextRun({ text: t, size: 24 })] }))
        }))
    })]
  })
];

const ringkasan = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true, children: [new TextRun('RINGKASAN')], spacing: { after: 240 } }),
  P(`Proyek ini membangun purwarupa WebGIS rekomendasi destinasi dan rute wisata untuk Kapanewon Girimulyo, Kalibawang, dan Samigaluh, Kabupaten Kulon Progo. Basis data awal berisi ${QA.n_mentah} entri potensi wisata hasil ekstraksi Google Maps dan kurasi tim. Data tersebut dibersihkan, di-*overlay* dengan batas wilayah Rupabumi Indonesia (RBI) 1:25.000, dan digabungkan dari ${QA.gabungan.length} pasangan duplikat, sehingga menghasilkan ${QA.n_setelah_gabung} destinasi. Dari jumlah itu, ${QA.n_in_scope} destinasi berada dalam cakupan tiga kapanewon (Samigaluh ${QA.per_kecamatan_in_scope.Samigaluh}, Kalibawang ${QA.per_kecamatan_in_scope.Kalibawang}, Girimulyo ${QA.per_kecamatan_in_scope.Girimulyo}) dan terbagi ke dalam lima kategori wisata.`),
  P(`Rekomendasi disusun dengan kombinasi AHP–SAW berdasarkan empat kriteria: waktu tempuh dan biaya kunjungan (*cost*), serta rating dan popularitas (*benefit*). Bobot awal AHP (waktu ${fmt(w[0] * 100, 1)}%, biaya ${fmt(w[1] * 100, 1)}%, rating ${fmt(w[2] * 100, 1)}%, popularitas ${fmt(w[3] * 100, 1)}%) memiliki CR = ${fmt(CFG.ahp_result.cr)} (konsisten) dan dapat disesuaikan oleh pengguna. Waktu dan jarak tempuh dihitung pada jaringan jalan OpenStreetMap melalui OSRM. Analisis menunjukkan jarak jalan rata-rata ${fmt(jvl.rata2, 2)} kali jarak garis lurus, sehingga perhitungan berbasis jaringan jalan memang diperlukan di wilayah perbukitan Menoreh. Rute kunjungan disusun dengan heuristik *nearest neighbour* dari sepuluh destinasi teratas dengan memperhatikan batas waktu dan anggaran. Saat dibuka, WebGIS terlebih dahulu menanyakan lima hal kepada pengguna (lokasi awal, jenis wisata, waktu, anggaran, dan rating minimum), lalu langsung menyajikan rekomendasi dan rute sesuai jawaban tersebut. Navigasi rute juga dijalankan di dalam WebGIS: petunjuk belok-demi-belok berbahasa Indonesia, pelacakan GPS, dan penghitungan ulang rute saat pengguna keluar jalur.`),
  P(`Hasil perhitungan sistem identik dengan perhitungan ulang independen (Python/numpy) dan dengan perhitungan berumus Microsoft Excel pada empat skenario uji (selisih maksimum nilai preferensi ≤ 2,2 × 10⁻¹⁶). Seluruh ${BB.uji.length} skenario uji *black-box* dinyatakan sesuai. Uji kegunaan dengan System Usability Scale (SUS) masih akan dilaksanakan bersama responden; instrumennya sudah disiapkan.`),
  PN('**Kata kunci:** WebGIS, AHP, SAW, rekomendasi wisata, nearest neighbour, OSRM, Kulon Progo.')
];

const tocs = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true, children: [new TextRun('DAFTAR ISI')], spacing: { after: 240 } }),
  new TableOfContents('Daftar Isi', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true, children: [new TextRun('DAFTAR GAMBAR')], spacing: { after: 240 } }),
  new TableOfContents('Daftar Gambar', { hyperlink: true, stylesWithLevels: [new StyleLevel('KeteranganGambar', 1)] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true, children: [new TextRun('DAFTAR TABEL')], spacing: { after: 240 } }),
  new TableOfContents('Daftar Tabel', { hyperlink: true, stylesWithLevels: [new StyleLevel('KeteranganTabel', 1)] })
];

/* ------------------------------------------------------------------ BAB I */
const bab1 = [
  H1('BAB I', 'PENDAHULUAN', false),
  H2('I.1 Latar Belakang'),
  P('Pariwisata merupakan salah satu sektor yang dapat mendukung pengembangan wilayah melalui pemanfaatan potensi alam, budaya, serta aktivitas ekonomi masyarakat. Kabupaten Kulon Progo memiliki keragaman daya tarik wisata yang tersebar pada berbagai wilayah, termasuk wilayah fokus Proyek Rekayasa Geodesi-Geomatika ini, yaitu Kapanewon Girimulyo, Kalibawang, dan Samigaluh. Ketiga wilayah tersebut berkarakter perbukitan dengan beragam objek wisata, mulai dari Wisata Alam, Wisata Alam-Buatan, Religi dan Budaya, Agrowisata, hingga Akomodasi dan Rekreasi. Keberagaman tersebut menunjukkan adanya potensi wisata yang dapat dikembangkan. Namun, perbedaan karakteristik setiap objek wisata memerlukan identifikasi dan penilaian yang mempertimbangkan kondisi masing-masing objek secara lebih menyeluruh.'),
  P('Dalam kondisi nyata, informasi mengenai objek wisata di tiga kapanewon tersebut perlu dikumpulkan dan disajikan secara jelas agar dapat menggambarkan persebaran serta karakteristik destinasi. Informasi lokasi objek wisata juga belum tentu disertai rekomendasi perjalanan yang mempertimbangkan titik keberangkatan, waktu yang tersedia, dan anggaran wisatawan. Oleh karena itu, diperlukan sistem informasi yang tidak hanya menyajikan persebaran objek wisata secara spasial, tetapi juga membantu pengguna memilih destinasi dan merencanakan perjalanan.'),
  P('Penilaian potensi wisata tidak cukup didasarkan pada keberadaan atau jenis objek wisata saja, karena keputusan wisatawan dipengaruhi oleh berbagai aspek seperti lokasi dan aksesibilitas, daya tarik, waktu, biaya, fasilitas, dan popularitas. Penelitian pemilihan objek wisata di Kabupaten Kebumen menunjukkan bahwa kriteria jarak, fasilitas, biaya, dan keindahan alam dapat digunakan bersamaan untuk menghasilkan nilai preferensi destinasi (Aji & Saputra, 2019). Pendekatan Sistem Informasi Geografis (SIG) juga dapat memberikan gambaran spasial mengenai persebaran dan potensi objek wisata.'),
  P('Permasalahan dengan banyak kriteria tersebut dapat dianalisis menggunakan pendekatan *Multi-Criteria Decision Making* (MCDM). Proyek ini menggunakan kombinasi *Analytical Hierarchy Process* (AHP) dan *Simple Additive Weighting* (SAW). AHP digunakan untuk menentukan bobot kepentingan setiap kriteria melalui perbandingan berpasangan, sedangkan SAW digunakan untuk menghitung nilai preferensi setiap alternatif berdasarkan normalisasi dan pembobotan kriteria (Hernawati dkk., 2022). Bobot kriteria dirancang agar dapat disesuaikan dengan preferensi pengguna. Dengan demikian, WebGIS rekomendasi wisata di ketiga kapanewon diharapkan dapat mengintegrasikan informasi spasial, penilaian multikriteria, dan rekomendasi rute untuk membantu wisatawan menentukan destinasi sekaligus mendukung pengelolaan potensi wisata.'),
  H2('I.2 Rumusan Masalah'),
  PN('Berdasarkan latar belakang tersebut, rumusan masalah kegiatan ini adalah sebagai berikut.'),
  ...numbered([
    'Bagaimana menginventarisasi, memetakan, dan mengklasifikasikan objek wisata di Kapanewon Girimulyo, Kalibawang, dan Samigaluh berdasarkan informasi spasial dan nonspasial yang tersedia?',
    'Bagaimana menentukan bobot kepentingan kriteria menggunakan AHP melalui perbandingan berpasangan dan pengujian konsistensi?',
    'Bagaimana menentukan skor dan peringkat objek wisata menggunakan SAW berdasarkan bobot kriteria dan preferensi pengguna?',
    'Bagaimana menghasilkan rekomendasi destinasi dan rute wisata berdasarkan lokasi awal, jenis destinasi wisata, waktu, anggaran, dan rating destinasi?',
    'Bagaimana menyajikan basis data objek wisata, hasil pemeringkatan, serta rekomendasi destinasi dan rute dalam bentuk WebGIS yang dapat diakses pengguna?'
  ]),
  H2('I.3 Tujuan Kegiatan'),
  ...numbered([
    'Menginventarisasi dan memetakan potensi objek wisata di Girimulyo, Kalibawang, dan Samigaluh berdasarkan informasi spasial dan nonspasial yang tersedia.',
    'Melakukan pembobotan kriteria menggunakan AHP sebagai bobot default yang dapat disesuaikan dengan preferensi pengguna dalam sistem.',
    'Mengidentifikasi dan mengelompokkan objek wisata ke dalam kategori Wisata Alam, Wisata Alam-Buatan, Religi dan Budaya, Agrowisata, serta Akomodasi dan Rekreasi.',
    'Menghasilkan skor dan peringkat objek wisata berdasarkan preferensi dan kebutuhan pengguna.',
    'Memberikan rekomendasi destinasi dan rute wisata berupa urutan kunjungan antar-destinasi dengan mempertimbangkan lokasi awal, jenis wisata, total waktu, anggaran, rating destinasi, serta jaringan jalan.'
  ]),
  H2('I.4 Manfaat Kegiatan'),
  ...numbered([
    '**Bagi mahasiswa:** memperoleh pengalaman menerapkan SIG, MCDM (AHP dan SAW), analisis jaringan jalan, dan pengembangan WebGIS pada permasalahan nyata, termasuk kerja tim dan koordinasi dengan pemangku kepentingan.',
    '**Bagi masyarakat dan wisatawan:** memperoleh informasi objek wisata tiga kapanewon dalam satu sistem terintegrasi, rekomendasi destinasi sesuai lokasi awal, kategori, waktu, anggaran, dan rating, serta urutan kunjungan berbasis jaringan jalan, termasuk destinasi yang belum banyak dikenal.',
    '**Bagi pemerintah dan pengelola wisata:** memperoleh basis data spasial dan nonspasial objek wisata, gambaran persebaran, klasifikasi, skor, dan peringkat destinasi sebagai bahan evaluasi, pengembangan, dan promosi wisata.',
    '**Bagi departemen:** menjaga kerja sama dengan pemerintah kapanewon untuk kegiatan penelitian dan pengabdian, serta menilai kompetensi mahasiswa dalam menerapkan ilmu geodesi-geomatika secara nyata.'
  ]),
  H2('I.5 Ruang Lingkup Kegiatan'),
  ...numbered([
    `**Lokasi kegiatan:** Kapanewon Girimulyo, Kalibawang, dan Samigaluh, Kabupaten Kulon Progo, Daerah Istimewa Yogyakarta (${QA.n_desa_target} kalurahan).`,
    '**Objek kegiatan:** potensi objek wisata dalam lima kategori, dengan data spasial berupa koordinat dan data nonspasial berupa kategori, deskripsi, harga tiket, paket wisata, jam dan hari operasional, rating, serta jumlah ulasan.',
    '**Ruang lingkup analisis:** inventarisasi dan verifikasi data, klasifikasi kategori, penyusunan basis data, pembobotan kriteria dengan AHP, pemeringkatan dengan SAW, perhitungan waktu dan jarak tempuh pada jaringan jalan melalui OSRM, serta penyusunan rute kunjungan dengan heuristik *nearest neighbour*. Kriteria akhir ditetapkan berdasarkan ketersediaan data, yaitu waktu tempuh dan biaya (*cost*) serta rating dan popularitas (*benefit*).',
    '**Batasan kegiatan:** data destinasi bersumber dari data sekunder dan masih memerlukan verifikasi lapangan; kriteria fasilitas belum digunakan karena datanya belum tersedia; hasil pemeringkatan merupakan nilai preferensi relatif terhadap kriteria dan bobot, bukan penilaian mutlak atas kualitas destinasi.',
    '**Output kegiatan:** WebGIS sistem rekomendasi destinasi dan rute wisata, basis data spasial (GeoJSON, GeoPackage, skrip PostgreSQL/PostGIS), dokumen metodologi dan hasil pengujian, serta instrumen kuesioner AHP dan SUS.'
  ])
];

/* ------------------------------------------------------------------ BAB II */
const bab2 = [
  H1('BAB II', 'LANDASAN TEORI'),
  H2('II.1 Pariwisata dan Kategori Wisata'),
  P('Secara etimologis, istilah pariwisata berasal dari bahasa Sansekerta, yaitu *pari* yang bermakna banyak atau berkeliling dan *wisata* yang bermakna pergi atau bepergian (Yoeti, 1996). Undang-Undang Nomor 10 Tahun 2009 tentang Kepariwisataan sebagaimana telah diubah dengan Undang-Undang Nomor 18 Tahun 2025 mendefinisikan wisata sebagai kegiatan perjalanan seseorang atau sekelompok orang ke tempat tertentu di luar lingkungan asalnya dalam jangka waktu sementara. Pariwisata adalah berbagai macam kegiatan wisata yang didukung sarana, prasarana, fasilitas, dan layanan (Republik Indonesia, 2025).'),
  P('Daya tarik wisata didefinisikan sebagai segala sesuatu yang memiliki keunikan, keindahan, dan nilai berupa keanekaragaman kekayaan alam, budaya, dan hasil buatan manusia yang menjadi sasaran kunjungan wisatawan (Republik Indonesia, 2025). Pengkategorian diperlukan untuk menyederhanakan keragaman karakteristik daya tarik wisata. Pada proyek ini digunakan lima kategori: **Wisata Alam** (gunung, bukit, air terjun, sungai), **Wisata Alam-Buatan** (unsur alam yang dikembangkan dengan unsur buatan, seperti embung), **Religi dan Budaya** (warisan budaya, sejarah, tradisi, dan aktivitas keagamaan), **Agrowisata** (aktivitas dan sumber daya pertanian, seperti kebun teh), serta **Akomodasi dan Rekreasi** (tempat menginap atau pelayanan wisata yang bersifat rekreatif, seperti *glamping* dan *resort*).'),
  H2('II.2 Sistem Informasi Geografis (SIG)'),
  P('SIG merupakan sistem untuk mengelola informasi yang terkait dengan lokasi di permukaan bumi, sehingga data spasial dapat diintegrasikan dengan data atribut. Dalam bidang pariwisata, SIG dapat digunakan untuk mengelola informasi lokasi dan karakteristik objek wisata serta mendukung pengambilan keputusan berdasarkan berbagai kriteria (Barrera-Narváez dkk., 2020). SIG juga dapat dikombinasikan dengan MCDM sehingga informasi spasial dianalisis bersama kriteria dan bobot yang telah ditentukan (Villacreses dkk., 2022).'),
  H2('II.3 Multi-Criteria Decision Making (MCDM)'),
  P('MCDM adalah pendekatan untuk mengevaluasi sejumlah alternatif berdasarkan beberapa kriteria secara simultan, terutama ketika kriteria memiliki satuan dan tingkat kepentingan yang berbeda. Metode MCDM antara lain AHP, SAW, TOPSIS, dan VIKOR (Azhar dkk., 2021). Proyek ini memakai kombinasi AHP–SAW: AHP untuk bobot kriteria dan SAW untuk nilai preferensi serta peringkat alternatif (Aji & Saputra, 2019; Hernawati dkk., 2022). Pilihan ini didasarkan pada kebutuhan memisahkan pembobotan dan pemeringkatan, serta tahapan perhitungan yang transparan dan mudah divalidasi secara manual.'),
  H2('II.4 Analytical Hierarchy Process (AHP)'),
  P('AHP menggunakan struktur hierarki dan perbandingan berpasangan untuk menentukan kepentingan relatif antarkriteria (Saaty, 2008). Hasil perbandingan disusun dalam matriks resiprokal A = [a*ij*] dengan a*ji* = 1/a*ij*. Vektor prioritas (bobot) diperoleh dari *eigenvector* utama matriks tersebut. Konsistensi penilaian diuji dengan *Consistency Index* (CI) dan *Consistency Ratio* (CR):'),
  eq([mr('CI='), new MathFraction({ numerator: [sub('λ', 'maks'), mr('−n')], denominator: [mr('n−1')] })], 'II.1'),
  eq([mr('CR='), new MathFraction({ numerator: [mr('CI')], denominator: [mr('RI')] })], 'II.2'),
  P('dengan λ*maks* adalah nilai eigen maksimum, n adalah jumlah kriteria, dan RI adalah *Random Index* (untuk n = 4, RI = 0,90). Penilaian dinyatakan konsisten apabila CR ≤ 0,10. Jika responden lebih dari satu, matriks individual digabung dengan rata-rata geometris elemen-per-elemen agar sifat resiprokal tetap terjaga (Aczél & Saaty, 1983).'),
  H2('II.5 Simple Additive Weighting (SAW)'),
  P('SAW menentukan nilai preferensi alternatif melalui normalisasi dan penjumlahan terbobot. Matriks keputusan X = [x*ij*] dinormalisasi menurut sifat kriteria. Kriteria *benefit* mengutamakan nilai besar, sedangkan kriteria *cost* mengutamakan nilai kecil:'),
  eq([sub('r', 'ij'), mr('='), new MathFraction({ numerator: [sub('x', 'ij')], denominator: [sub('max', 'i'), mr('('), sub('x', 'ij'), mr(')')] }), mr('  (benefit)')], 'II.3a'),
  eq([sub('r', 'ij'), mr('='), new MathFraction({ numerator: [sub('min', 'i'), mr('('), sub('x', 'ij'), mr(')')], denominator: [sub('x', 'ij')] }), mr('  (cost)')], 'II.3b'),
  eq([sub('V', 'i'), mr('='), new MathSum({ children: [sub('w', 'j'), sub('r', 'ij')], subScript: [mr('j=1')], superScript: [mr('n')] })], 'II.4'),
  P('dengan V*i* adalah nilai preferensi alternatif ke-i dan w*j* adalah bobot kriteria ke-j (Σw*j* = 1). Alternatif dengan V*i* terbesar menempati peringkat teratas (Hernawati dkk., 2022).'),
  H2('II.6 Web Geographic Information System (WebGIS)'),
  P('WebGIS adalah aplikasi SIG yang terdistribusi melalui jaringan komputer untuk menyebarluaskan informasi geografis secara visual di web tanpa perangkat lunak SIG khusus di sisi pengguna (Ashari dkk., 2015). Arsitektur WebGIS modern memisahkan lapisan data, logika, dan antarmuka (Kshetri dkk., 2021). Pada sisi antarmuka, pustaka ringan seperti Leaflet.js menyediakan fungsi pemetaan dasar yang dapat dikembangkan dengan *plugin* (Sulastri dkk., 2025).'),
  H2('II.7 Analisis Jaringan Jalan dan Routing'),
  P('Dalam analisis jaringan, jalan direpresentasikan sebagai ruas (*edges*) dan simpul (*nodes*) yang saling terhubung. Rute optimal ditentukan dengan meminimalkan biaya tertentu, misalnya jarak atau waktu tempuh (Longley dkk., 2015). Proyek ini memakai *Open Source Routing Machine* (OSRM), mesin routing berbasis data OpenStreetMap yang menggunakan *contraction hierarchies* sehingga mampu menghitung rute dan matriks waktu tempuh dengan cepat (Luxen & Vetter, 2011).'),
  H2('II.8 Heuristik Nearest Neighbour'),
  P('Penyusunan urutan kunjungan beberapa destinasi merupakan varian *Traveling Salesman Problem* (TSP) yang bersifat NP-hard. Heuristik *nearest neighbour* menyusun rute dengan selalu memilih destinasi terdekat yang belum dikunjungi dari posisi saat ini. Heuristik ini sederhana dan cepat (kompleksitas O(n²)), tetapi tidak menjamin rute optimal (Rosenkrantz dkk., 1977). Untuk rute wisata harian dengan jumlah pemberhentian kecil, heuristik ini memadai sebagai rekomendasi awal.'),
  H2('II.9 Pengujian Sistem'),
  P('*Black-box testing* menguji fungsi sistem berdasarkan kesesuaian antara masukan dan keluaran tanpa melihat struktur kode (Kapoh dkk., 2021). *System Usability Scale* (SUS) adalah kuesioner 10 butir berskala Likert 1–5 untuk mengukur persepsi kegunaan sistem (Brooke, 1996). Skor SUS dihitung dengan mengurangkan 1 dari skor butir ganjil, mengurangkan skor butir genap dari 5, lalu mengalikan jumlahnya dengan 2,5 sehingga diperoleh nilai 0–100. Skor di atas 68 umumnya dianggap di atas rata-rata (Bangor dkk., 2009; Yusuf & Astuti, 2020).')
];

/* ------------------------------------------------------------------ BAB III */
const critRows = CFG.criteria.map((c, i) => [c.kode, c.nama, c.sifat, c.satuan, c.sumber, fmt(w[i], 4)]);
const bab3 = [
  H1('BAB III', 'METODOLOGI PELAKSANAAN'),
  H2('III.1 Deskripsi Lokasi Kegiatan'),
  P(`Kegiatan dilaksanakan di Kapanewon Girimulyo, Kalibawang, dan Samigaluh, kawasan perbukitan Menoreh di bagian utara Kabupaten Kulon Progo. Luas setiap kapanewon dihitung dari poligon RBI 1:25.000 pada proyeksi UTM zona 49S dan dibandingkan dengan data pemerintah kapanewon pada ${refT('III')}. Selisih kecil (kurang dari 5%) wajar karena perbedaan sumber dan skala batas administrasi.`),
  capT('III', 'Luas dan jumlah kalurahan wilayah kajian'),
  table(['Kapanewon', 'Luas RBI (km²)', 'Luas resmi (km²)', 'Kalurahan', 'Destinasi dalam cakupan'],
    KEC.map((k) => [k, fmt(QA.luas_km2_kecamatan_target[k], 2), LUAS_OFF[k], String(NDESA[k]), String(QA.per_kecamatan_in_scope[k])])
      .concat([['Jumlah', fmt(KEC.reduce((a, k) => a + QA.luas_km2_kecamatan_target[k], 0), 2), '177,16', '15', String(QA.n_in_scope)]]),
    [2, 1.6, 1.6, 1.2, 1.8], { numCols: [1, 2, 3, 4], boldRows: [3] }),
  P(`Persebaran destinasi pada ketiga kapanewon ditunjukkan pada ${refG('III')}. Destinasi cenderung mengelompok di perbukitan barat laut Samigaluh (kawasan Nglinggo–Pagerharjo), di Jatimulyo, Girimulyo (kawasan Kembang Soka–Sungai Mudal), dan di Banjaroya–Banjarasri, Kalibawang.`),
  ...figure(IMG('peta_sebaran.png'), 'III', 'Peta lokasi kegiatan dan sebaran destinasi wisata', 14.5),
  H2('III.2 Persiapan Pelaksanaan Kegiatan'),
  H3('III.2.1 Alat'),
  capT('III', 'Perangkat keras dan perangkat lunak yang digunakan'),
  table(['Alat', 'Versi', 'Fungsi'], [
    ['Laptop (Windows 11)', '–', 'Pengolahan data dan pengembangan sistem'],
    ['QGIS (beserta Python, GDAL/OGR, Shapely, PyProj)', '3.44', 'Membaca File Geodatabase RBI, overlay, proyeksi, ekspor GeoPackage'],
    ['Python + openpyxl, NumPy, Matplotlib', '3.12', 'Pipeline data, validasi silang, pembuatan peta dan grafik'],
    ['Node.js', '24', 'Uji unit (node:test), server lokal, penyusunan dokumen'],
    ['Leaflet.js', '1.9.4', 'Pustaka peta web'],
    ['OSRM (layanan publik project-osrm.org)', 'API v1', 'Matriks waktu/jarak tempuh dan geometri rute di jaringan jalan OSM'],
    ['Nominatim (OpenStreetMap)', 'API', 'Pencarian lokasi awal berdasarkan nama tempat'],
    ['PostgreSQL + PostGIS (opsional)', '15 / 3', 'Basis data spasial (skrip skema dan data disediakan)'],
    ['Microsoft Excel dan Word', '365', 'Validasi perhitungan manual dan penyusunan laporan'],
    ['Visual Studio Code, GitHub, Vercel', '–', 'Penyuntingan kode, kontrol versi, dan *deployment*']
  ], [3, 1, 4.2]),
  H3('III.2.2 Bahan'),
  capT('III', 'Data yang digunakan'),
  table(['Data', 'Sumber', 'Format', 'Kegunaan'], [
    ['Basis data potensi wisata (88 entri, 18 atribut)', 'Ekstraksi Google Maps + kurasi tim (Data Pak Dedi)', 'XLSX', 'Lokasi, kategori, deskripsi, harga, jam operasional, rating, ulasan'],
    ['Catatan basis data awal potensi wisata', 'Tim PKM / dosen pembimbing', 'DOCX/PDF', 'Dugaan duplikat dan titik yang perlu diverifikasi'],
    ['RBI 1:25.000 Kab. Kulon Progo (2022/2023)', 'Badan Informasi Geospasial', 'File Geodatabase', 'Batas kecamatan/kalurahan dan jaringan jalan'],
    ['Batas kabupaten DIY', 'Data Pak Dedi (SHP_DIY)', 'GeoPackage', 'Peta indeks/inset'],
    ['Jaringan jalan OpenStreetMap', 'OSRM (OSM)', 'API', 'Waktu dan jarak tempuh, geometri rute']
  ], [2.6, 2.4, 1.3, 3]),
  H3('III.2.3 Pembagian Penanggung Jawab'),
  capT('III', 'Pembagian penanggung jawab'),
  table(['No', 'Kegiatan', 'Rincian kegiatan', 'Penanggung jawab'], [
    ['1', 'Manajemen proyek & analisis kriteria (AHP)', 'Proposal dan laporan pendahuluan; kuesioner perbandingan berpasangan; pengolahan AHP dan uji CR; pengujian fungsi WebGIS', 'Mirdha Dhea Permata'],
    ['2', 'Pengumpulan & pengolahan data spasial', 'Batas wilayah, peta dasar, dan jaringan jalan; overlay di QGIS; waktu dan jarak tempuh; peta lokasi dan diagram alir', 'Maulida Fi Nurrin'],
    ['3', 'Perangkingan (SAW) & basis data', 'Basis data spasial dan nonspasial; normalisasi dan pembobotan SAW; analisis skor dan peringkat; laporan antara', 'Muhammad Frisky Makarim'],
    ['4', 'Inventarisasi, klasifikasi & administrasi', 'Verifikasi data nonspasial; klasifikasi 5 kategori; validasi lapangan; administrasi dan koordinasi', 'Anindya R Putri Alindita'],
    ['5', 'Pengembangan WebGIS & laporan akhir', 'Antarmuka dan kode WebGIS; integrasi basis data, filter, dan SAW; visualisasi rute; laporan akhir', 'Kharisma Alawiyah']
  ], [0.5, 2.2, 4, 2], { center: [0] }),
  H2('III.3 Tahapan Pelaksanaan'),
  P(`Tahapan pelaksanaan terbagi menjadi dua alur yang saling terhubung: (A) penyiapan data dan bobot, serta (B) rekomendasi, rute, dan pembangunan sistem (${refG('III')}). Setiap tahap dijelaskan beserta proses, keluaran, dan berkas kerjanya agar dapat ditelusuri ulang.`),
  ...figure(IMG('diagram_alir.png'), 'III', 'Diagram alir tahapan pelaksanaan', 13),
  H3('Tahap 1 – Studi literatur dan koordinasi'),
  P('Studi literatur mencakup pariwisata, SIG, MCDM (AHP dan SAW), analisis jaringan jalan, dan WebGIS. Koordinasi dilakukan dengan dosen pembimbing untuk menyepakati cakupan wilayah, sumber data, kategori wisata, dan lima pertanyaan masukan pengguna (lokasi, jenis wisata, waktu, anggaran, rating). Hasil koordinasi dicatat dalam notulensi 21 September 2026.'),
  H3('Tahap 2 – Pengumpulan data'),
  P(`Data dikumpulkan sesuai Tabel III.3. Basis data potensi wisata memuat ${QA.n_mentah} entri dengan atribut nama, kecamatan, desa, koordinat, jenis Google, kategori, deskripsi, rating, jumlah ulasan, harga masuk, harga paket, kisaran harga makan, serta jam dan hari operasional. Data RBI dibaca langsung dari File Geodatabase (lapisan ADMINISTRASI_AR_KECAMATAN, ADMINISTRASI_AR_DESAKEL, JALAN_LN_25K).`),
  H3('Tahap 3 – Pembersihan dan standardisasi atribut'),
  ...numbered([
    'Karakter rusak (�) akibat penyalinan tanda pisah diganti dengan "–"; spasi ganda dirapikan.',
    'Teks harga diubah menjadi angka, misalnya "Rp5.000 - Rp15.000" menjadi (5.000; 15.000), "Rp0" menjadi gratis, dan "Rp.35.000" menjadi 35.000.',
    'Ejaan kecamatan diseragamkan ("Grimulyo" menjadi "Girimulyo").',
    'Deskripsi yang terpotong di tengah kalimat dipangkas ke kalimat utuh terakhir.',
    'Biaya kunjungan ditetapkan sebagai nilai tengah rentang harga tiket. Khusus objek menginap (*glamping*, *cabin*, *resort*), dipakai batas bawah harga paket menginap.'
  ]),
  H3('Tahap 4 – Overlay spasial dan penentuan cakupan wilayah'),
  P(`Setiap titik di-*overlay* dengan poligon kecamatan dan kalurahan RBI untuk mengisi ${QA.kec_kosong_excel} entri yang kolom kecamatan/desanya kosong dan untuk memeriksa konsistensi entri yang sudah terisi. Hasilnya, ${QA.kec_cocok} entri sesuai, sedangkan ${QA.kec_beda.length} entri tercatat tim di Samigaluh/Kalibawang tetapi jatuh sedikit di luar poligon RBI. Karena itu ditetapkan aturan cakupan berikut:`),
  ...numbered([
    'Titik di dalam poligon salah satu dari tiga kapanewon dinyatakan **dalam cakupan**.',
    'Titik di luar poligon, tetapi tercatat tim di kapanewon target dan berjarak ≤ 150 m dari batas, dinyatakan **dalam cakupan (titik batas)**. Kapanewon dan kalurahan mengikuti catatan tim. Selisih ini wajar karena ketelitian batas skala 1:25.000 (sekitar 12,5 m pada peta untuk 0,5 mm) serta batas yang mengikuti sungai atau punggungan bukit.',
    'Titik selain itu dinyatakan **di luar cakupan**. Data tetap disimpan dan dapat ditampilkan, tetapi tidak diikutkan dalam rekomendasi kecuali pengguna memintanya.'
  ]),
  H3('Tahap 5 – Penggabungan duplikat'),
  P(`Lima pasangan yang dicurigai duplikat pada catatan basis data awal diperiksa jaraknya (56–132 m) lalu digabung. Rating gabungan dihitung sebagai rata-rata tertimbang jumlah ulasan, jumlah ulasan dijumlahkan, dan atribut kosong diisi dari entri pasangannya. Penggabungan ini bersifat asumsi kerja dan perlu dikonfirmasi saat *ground check*. Pasangan berdekatan lainnya, misalnya Kebun Teh Nglinggo dan Puncak 9 Bukit Ngisis (47 m), dipertahankan sebagai objek berbeda dalam satu kawasan.`),
  H3('Tahap 6 – Klasifikasi dan atribut turunan'),
  P('Kategori mengikuti klasifikasi lima kelas dari tim. Dua atribut turunan dibentuk untuk kebutuhan analisis, yaitu skala biaya dan durasi kunjungan (Tabel III.5 dan Tabel III.6).'),
  capT('III', 'Konversi biaya kunjungan ke skala 1–5 (kriteria C2)'),
  table(['Biaya per orang', 'Skala', 'Nilai ternormalisasi r = 1/skala'], [['Gratis (Rp0)', '1', '1,000'], ['≤ Rp5.000', '2', '0,500'], ['Rp5.001 – Rp15.000', '3', '0,333'], ['Rp15.001 – Rp50.000', '4', '0,250'], ['> Rp50.000 (termasuk paket menginap)', '5', '0,200']], [3, 1, 2.5], { center: [1, 2] }),
  P('Konversi ke skala diperlukan karena banyak destinasi bertiket Rp0. Rumus *cost* min/x (II.3b) tidak terdefinisi untuk x = 0, dan nilai rupiah mentah sangat timpang antara tiket Rp3.000 dan paket menginap Rp500.000. Skala ordinal ini lazim digunakan pada penerapan SAW.'),
  capT('III', 'Asumsi durasi kunjungan per kategori'),
  table(['Kategori', 'Durasi di lokasi (jam)'], [['Wisata Alam (air terjun, sungai, goa)', '1,5'], ['Wisata Alam – puncak, bukit, gardu pandang, tebing', '1,0'], ['Wisata Alam-Buatan', '1,0'], ['Religi dan Budaya', '0,75'], ['Agrowisata', '1,0'], ['Akomodasi dan Rekreasi (di luar menginap)', '1,5']], [4, 2], { center: [1] }),
  NOTE('Durasi kunjungan masih asumsi tim. Sebaiknya divalidasi melalui survei lapangan atau wawancara pengelola, lalu nilainya diperbarui pada pipeline/build_data.py (DURASI_KATEGORI).'),
  H3('Tahap 7 – Penyusunan basis data'),
  P('Seluruh proses tahap 3–6 diotomatiskan dalam skrip *pipeline/build_data.py* agar dapat diulang setiap kali data diperbarui. Keluarannya berupa (a) GeoJSON untuk web, (b) *data.js* yang dibaca langsung oleh halaman web, (c) GeoPackage berisi lapisan *wisata*, *kapanewon*, *kalurahan*, dan *jalan* untuk QGIS, (d) CSV bersih, serta (e) skrip SQL PostgreSQL/PostGIS. Skrip SQL terdiri atas tabel *kategori_wisata*, *destinasi_wisata* (geometri titik EPSG:4326 dengan indeks GIST), *kriteria* (bobot default), dan *matriks_jalan* (waktu/jarak antar-destinasi). Kamus data disajikan pada Lampiran A.'),
  H3('Tahap 8 – Penentuan kriteria penilaian'),
  P(`Dari kriteria tentatif pada proposal, kriteria fasilitas belum dapat digunakan karena atributnya belum tersedia di basis data. Empat kriteria akhir disajikan pada ${refT('III')}.`),
  capT('III', 'Kriteria penilaian SAW'),
  table(['Kode', 'Kriteria', 'Sifat', 'Nilai', 'Sumber', 'Bobot AHP'], critRows, [0.7, 1.8, 0.9, 1.3, 2.8, 1], { center: [0, 2], numCols: [5] }),
  P(`Jumlah ulasan ditransformasi menjadi ln(1 + ulasan) karena distribusinya sangat menjulur. Mediannya ${fint(ULS.median)} ulasan, tetapi maksimumnya ${fint(ULS.max)} (Ekowisata Sungai Mudal), dengan *skewness* ${fmt(ULS.skewness, 2)}. Tanpa transformasi, hampir semua destinasi mendapat r ≈ 0 pada kriteria ini. Setelah transformasi, *skewness* turun menjadi ${fmt(ULS.skewness_ln, 2)}. Destinasi yang belum memiliki rating diberi nilai 0 pada C3 dan C4, dan otomatis keluar bila pengguna menetapkan rating minimum.`),
  H3('Tahap 9 – Pembobotan AHP'),
  ...numbered([
    'Menyusun kuesioner perbandingan berpasangan untuk 6 pasangan kriteria (Lampiran C) dengan skala Saaty 1–9.',
    'Menyebarkan kuesioner kepada responden (wisatawan, pengelola, dan pakar), lalu merekap jawaban pada *Instrumen_Kuesioner_AHP_SUS.xlsx*.',
    'Menggabungkan jawaban dengan rata-rata geometris dan membentuk matriks resiprokal 4 × 4.',
    'Menghitung bobot (*eigenvector*), λmaks, CI, dan CR. Jika CR > 0,10, penilaian ditinjau ulang.',
    'Menetapkan bobot yang konsisten sebagai bobot default sistem. Pengguna tetap dapat menggeser bobot melalui antarmuka, dan bobot dinormalisasi otomatis agar Σw = 1.'
  ]),
  H3('Tahap 10 – Perhitungan waktu dan jarak tempuh'),
  P('Waktu dan jarak tempuh dari lokasi awal pengguna ke seluruh destinasi dihitung dengan satu permintaan ke layanan *Table* OSRM (profil mobil) pada jaringan jalan OpenStreetMap. Waktu dan jarak antar-destinasi (matriks 83 × 83) dihitung sekali pada tahap pipeline dan disimpan di basis data, sehingga penyusunan rute tidak bergantung pada koneksi. Jika layanan routing tidak dapat dijangkau, sistem beralih ke estimasi cadangan, yaitu jarak garis lurus × 1,74 dengan kecepatan 43,4 km/jam. Kedua nilai ini dikalibrasi dari matriks OSRM (subbab IV.3), dan hasil yang memakai estimasi diberi tanda.'),
  H3('Tahap 11 – Penyaringan destinasi'),
  capT('III', 'Aturan penyaringan berdasarkan masukan pengguna'),
  table(['Masukan', 'Aturan', 'Pilihan "tidak dibatasi"'], [
    ['Cakupan', 'Hanya destinasi dalam 3 kapanewon (bawaan)', 'Opsi "sertakan objek di luar 3 kapanewon"'],
    ['Jenis wisata', 'Kategori = pilihan pengguna', '"Bebas / semua"'],
    ['Rating minimum', 'rating ≥ 3,0 / 3,5 / 4,0 / 4,5; tanpa rating dikeluarkan', '"Tidak dibatasi"'],
    ['Anggaran', 'biaya kunjungan ≤ anggaran', 'Centang "Tidak dibatasi"'],
    ['Waktu tersedia', 'waktu tempuh dari titik awal + durasi kunjungan (+ waktu kembali bila dipilih) ≤ waktu tersedia', 'Centang "Tidak dibatasi"']
  ], [1.6, 4.6, 2.6]),
  H3('Tahap 12 – Pemeringkatan SAW'),
  P('Alternatif yang lolos penyaringan membentuk matriks keputusan X (m × 4). Nilai minimum dan maksimum normalisasi diambil dari alternatif yang lolos, sehingga skor bersifat relatif terhadap konteks pencarian. Nilai V dihitung dengan Persamaan II.4 menggunakan bobot AHP atau bobot pengguna. Jika V sama, urutan ditentukan oleh jumlah ulasan. Seluruh nilai X, R, dan V dapat dilihat pengguna melalui tombol "Lihat perhitungan SAW".'),
  H3('Tahap 13 – Penyusunan rute kunjungan (nearest neighbour)'),
  ...numbered([
    'Ambil 10 destinasi berperingkat tertinggi sebagai kandidat (destinasi prioritas).',
    'Mulai dari lokasi awal; tetapkan waktu terpakai = 0 dan biaya terpakai = 0.',
    'Urutkan kandidat tersisa berdasarkan waktu tempuh dari posisi saat ini (jaringan jalan).',
    'Pilih kandidat terdekat yang masih memenuhi: waktu terpakai + waktu tempuh + durasi kunjungan (+ waktu kembali bila dipilih) ≤ waktu tersedia, dan biaya terpakai + biaya ≤ anggaran.',
    'Tambahkan kandidat tersebut ke rute, perbarui posisi, waktu, dan biaya, lalu ulangi langkah 3–4 hingga tidak ada kandidat layak atau jumlah pemberhentian maksimum tercapai (bawaan 4, dapat diubah 2–8).',
    'Ambil geometri rute beserta petunjuk belok-demi-belok (*steps*) dari layanan *Route* OSRM untuk ditampilkan di peta.',
    'Terjemahkan setiap manuver OSRM (*depart*, *turn*, *fork*, *roundabout*, *arrive*, dan seterusnya) ke kalimat petunjuk berbahasa Indonesia, misalnya "Belok kiri ke Jalan Raya Samigaluh Dekso".',
    'Navigasi di dalam WebGIS: posisi GPS pengguna (*watchPosition*) diproyeksikan ke garis rute untuk menentukan langkah berikutnya, jarak ke manuver, dan sisa jarak. Jika posisi menyimpang lebih dari 60 m pada tiga pembacaan berturut-turut, rute dihitung ulang dari posisi pengguna ke pemberhentian yang tersisa. Untuk demo di dalam ruangan tersedia mode simulasi yang menggerakkan posisi di sepanjang rute.'
  ]),
  H3('Tahap 14 – Pembangunan WebGIS'),
  P(`WebGIS dibangun sebagai aplikasi statis tiga lapis (${refG('III')}). Pilihan ini membuat sistem dapat dibuka langsung dari berkas lokal maupun di-*deploy* gratis ke Vercel atau GitHub Pages tanpa server basis data. Logika perhitungan dipisahkan dalam *js/rekom.js* (tanpa dependensi) sehingga dapat diuji otomatis di luar peramban. Basis data PostGIS tetap disediakan bila sistem kelak dikembangkan dengan API sisi server. Alur interaksi dirancang berbasis pertanyaan. Saat halaman dibuka, panduan lima pertanyaan (sesuai notulensi rapat) tampil terlebih dahulu. Jawaban diterapkan ke kriteria penyaringan, kemudian penyaringan, SAW, dan penyusunan rute dijalankan otomatis.`),
  ...figure(IMG('arsitektur.png'), 'III', 'Arsitektur sistem WebGIS', 14),
  capT('III', 'Struktur berkas proyek'),
  table(['Berkas/folder', 'Isi'], [
    ['index.html, css/style.css', 'Halaman dan gaya antarmuka (responsif desktop dan ponsel)'],
    ['js/rekom.js', 'Inti perhitungan: AHP, penyaringan, SAW, rute nearest neighbour'],
    ['js/app.js', 'Antarmuka: peta Leaflet, filter, formulir rekomendasi, OSRM, kalkulator AHP, tab data'],
    ['data/', 'data.js, qa.js, GeoJSON destinasi/kapanewon/kalurahan/jalan, matriks OSRM, config'],
    ['db/', 'GeoPackage, CSV bersih, skema dan data SQL PostGIS'],
    ['pipeline/', 'build_data.py (data), make_figures.py (gambar), make_excel.py (Excel), make_report.js (laporan)'],
    ['tests/', 'Uji unit, ekspor skenario, validasi silang Python, uji black-box antarmuka'],
    ['docs/', 'Laporan, workbook validasi, instrumen kuesioner, hasil uji, gambar']
  ], [2.5, 5.5]),
  H3('Tahap 15 – Pengujian dan evaluasi'),
  ...numbered([
    '**Uji unit** inti perhitungan (13 kasus, termasuk contoh buku Saaty dan contoh hitung tangan SAW).',
    '**Validasi silang** empat skenario: keluaran sistem dibandingkan dengan perhitungan ulang independen menggunakan Python/NumPy.',
    '**Validasi manual** dengan rumus Microsoft Excel (*Validasi_AHP_SAW.xlsx*).',
    '**Black-box testing** 23 skenario antarmuka yang dijalankan otomatis di peramban.',
    '**System Usability Scale (SUS)** dengan responden calon pengguna (instrumen pada Lampiran D).'
  ]),
  H2('III.4 Jadwal Pelaksanaan'),
  capT('III', 'Jadwal pelaksanaan kegiatan (September 2026 – Mei 2027)'),
  table(['No', 'Kegiatan', 'Sep', 'Okt', 'Nov', 'Des', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei'], [
    ['1', 'Studi literatur & koordinasi', '✓', '', '', '', '', '', '', '', ''],
    ['2', 'Survei lapangan & inventarisasi', '✓', '✓', '', '', '', '', '', '', ''],
    ['3', 'Klasifikasi & penyusunan basis data', '', '✓', '', '', '', '', '', '', ''],
    ['4', 'Penentuan kriteria & pembobotan AHP', '', '', '✓', '', '', '', '', '', ''],
    ['5', 'Perhitungan SAW & penyusunan rute', '', '', '✓', '✓', '', '', '', '', ''],
    ['6', 'Pengembangan WebGIS', '', '', '', '✓', '✓', '', '', '', ''],
    ['7', 'Pengujian & evaluasi sistem', '', '', '', '', '', '✓', '', '', ''],
    ['8', 'Penyusunan laporan', '', '', '✓', '✓', '✓', '✓', '✓', '', ''],
    ['9', 'Penyampaian hasil', '', '', '', '', '', '', '', '✓', '✓']
  ], [0.5, 3.4, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55], { center: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10], size: 18 }),
  NOTE('Purwarupa pipeline data, AHP–SAW, rute, dan WebGIS telah selesai lebih awal (Oktober 2026). Bulan-bulan berikutnya digunakan untuk ground check, kuesioner AHP, uji SUS, dan penyempurnaan sesuai masukan pembimbing.')
];

/* ------------------------------------------------------------------ BAB IV */
const qaRows = [
  ['Entri awal basis data', String(QA.n_mentah)],
  ['Kecamatan/desa kosong yang diisi lewat overlay', String(QA.kec_kosong_excel)],
  ['Kecamatan Excel sesuai dengan overlay RBI', `${QA.kec_cocok} dari ${QA.n_mentah - QA.kec_kosong_excel}`],
  ['Pasangan duplikat yang digabung', String(QA.gabungan.length)],
  ['Destinasi setelah penggabungan', String(QA.n_setelah_gabung)],
  ['Dalam cakupan 3 kapanewon (termasuk titik batas)', `${QA.n_in_scope} (${QA.titik_batas.length} titik batas)`],
  ['Di luar cakupan (Purworejo, Magelang, Kokap)', String(QA.n_out_scope.length)],
  ['Belum memiliki rating/ulasan', `${QA.rating_kosong.length} (${QA.rating_kosong.join(', ')})`],
  ['Harga diestimasi median kategori', `${QA.biaya_imputasi.length} (${inn.filter((d) => d.biaya_imputed).length} dalam cakupan: ${inn.filter((d) => d.biaya_imputed).map((d) => d.nama).join(', ')})`],
  ['Titik > 300 m dari jaringan jalan OSRM', QA.osrm_snap_gt_300m.map((x) => `${x[1]} (${x[2]} m)`).join(', ')]
];
const rekapRows = KAT.map((k) => {
  const r = KEC.map((c) => inn.filter((d) => d.kategori === k && d.kecamatan === c).length);
  return [k, ...r.map(String), String(r.reduce((a, b) => a + b, 0))];
});
rekapRows.push(['Jumlah', ...KEC.map((c) => String(inn.filter((d) => d.kecamatan === c).length)), String(inn.length)]);
const A = CFG.ahp_default;
const fr = (v) => (v >= 1 ? String(Math.round(v)) : '1/' + Math.round(1 / v));
const s1top = S1.peringkat.slice(0, 3);

const bab4 = [
  H1('BAB IV', 'HASIL DAN PEMBAHASAN'),
  H2('IV.1 Hasil Inventarisasi dan Basis Data'),
  P(`Ringkasan kendali mutu data ditunjukkan pada ${refT('IV')}. Proses ini mengubah ${QA.n_mentah} entri mentah menjadi ${QA.n_setelah_gabung} destinasi yang bersih, ${QA.n_in_scope} di antaranya berada dalam cakupan kajian.`),
  capT('IV', 'Ringkasan kendali mutu data'),
  table(['Pemeriksaan', 'Hasil'], qaRows, [4.2, 4]),
  P(`Empat titik batas pada ${refT('IV')} perlu diperhatikan saat verifikasi. Kebun Teh Nglinggo, Puncak 9 Bukit Ngisis, dan Isis Hill dikenal berada di Pagerharjo, Samigaluh, tetapi koordinatnya jatuh 31–112 m di sisi Kapanewon Salaman (Magelang) menurut RBI. Ancol Bridge berada tepat di Sungai Progo yang menjadi batas Kalibawang–Ngluwar.`),
  capT('IV', 'Titik batas (koordinat sedikit di luar poligon RBI)'),
  table(['Destinasi', 'Catatan tim', 'Overlay RBI', 'Jarak ke batas'], QA.titik_batas.map((t) => [t[0], t[1], t[2], t[3] + ' m']), [3.4, 1.6, 1.6, 1.4], { numCols: [3] }),
  capT('IV', 'Penggabungan pasangan duplikat'),
  table(['Nama hasil gabungan', 'No. data awal', 'Jarak', 'Rating (lama → baru)', 'Ulasan (lama → baru)'],
    QA.gabungan.map((g) => [g.nama, `${g.dipertahankan} + ${g.digabung}`, g.jarak_m + ' m', `${g.rating_lama.map((x) => fmt(x, 1)).join(' & ')} → ${fmt(g.rating_baru, 2)}`, `${g.ulasan_lama.map(fint).join(' + ')} → ${fint(g.ulasan_baru)}`]),
    [3.2, 1.2, 0.9, 1.7, 1.9], { numCols: [2], size: 18 }),
  P(`Komposisi destinasi dalam cakupan per kategori dan kapanewon ditunjukkan pada ${refT('IV')}. Wisata Alam mendominasi (${rekapRows[0][4]} dari ${inn.length}), sesuai karakter perbukitan Menoreh. Samigaluh memiliki destinasi terbanyak, terutama Wisata Alam dan Agrowisata, sedangkan Kalibawang menonjol pada Religi dan Budaya (antara lain Gua Maria Sendangsono dan Gereja Promasan).`),
  capT('IV', 'Jumlah destinasi dalam cakupan per kategori dan kapanewon'),
  table(['Kategori', ...KEC, 'Jumlah'], rekapRows, [3, 1.3, 1.3, 1.3, 1.2], { numCols: [1, 2, 3, 4], boldRows: [5] }),
  P(`Popularitas eksisting berdasarkan jumlah ulasan Google Maps ditunjukkan pada ${refT('IV')}. Jumlah ulasan bukan data kunjungan resmi, tetapi dapat dipakai untuk memprioritaskan urutan *ground check*.`),
  capT('IV', 'Sepuluh destinasi dengan ulasan terbanyak (dalam cakupan)'),
  table(['No', 'Destinasi', 'Kapanewon', 'Kategori', 'Rating', 'Ulasan'], topUlasan.map((d, i) => [String(i + 1), d.nama, d.kecamatan, d.kategori, fmt(d.rating, 1), fint(d.ulasan)]), [0.5, 3.4, 1.3, 2, 0.8, 0.9], { center: [0], numCols: [4, 5], size: 18 }),

  H2('IV.2 Hasil Pembobotan AHP'),
  P(`Matriks perbandingan berpasangan bawaan dan bobot yang dihasilkan ditunjukkan pada ${refT('IV')}. Rating dinilai paling penting, diikuti waktu tempuh, sedangkan biaya dan popularitas mendapat bobot lebih kecil.`),
  capT('IV', 'Matriks perbandingan berpasangan dan bobot AHP bawaan'),
  table(['Kriteria', 'C1', 'C2', 'C3', 'C4', 'Bobot w'], A.map((row, i) => [CFG.criteria[i].kode + ' ' + CFG.criteria[i].nama, ...row.map(fr), fmt(w[i], 4)]), [3, 0.9, 0.9, 0.9, 0.9, 1.2], { center: [1, 2, 3, 4], numCols: [5] }),
  P(`Hasil perhitungan *eigenvector* menghasilkan λmaks = ${fmt(CFG.ahp_result.lambda_max)}, CI = ${fmt(CFG.ahp_result.ci)}, RI = 0,90, dan CR = ${fmt(CFG.ahp_result.cr)} ≤ 0,10, sehingga penilaian dinyatakan **konsisten**. Perhitungan manual dengan metode normalisasi kolom di Excel menghasilkan bobot yang berselisih kurang dari 0,0025 dengan nilai CR yang sama. Selain bobot AHP, antarmuka menyediakan empat profil bobot alternatif (${refG('IV')}) untuk analisis sensitivitas dan kebutuhan pengguna yang berbeda.`),
  NOTE('Matriks bawaan pada Tabel IV.6 adalah penilaian sementara tim (expert judgement) agar sistem dapat diuji. Setelah kuesioner AHP disebar, ganti nilai pada tabel ini dan pada pipeline/build_data.py (AHP_DEFAULT) dengan rata-rata geometris jawaban responden. Laporkan pula jumlah responden dan CR hasil agregasi. Kalkulator AHP di WebGIS dapat langsung memeriksa CR-nya.'),
  ...figure(IMG('bobot_profil.png'), 'IV', 'Bobot AHP bawaan dan profil bobot alternatif pada sistem', 14),

  H2('IV.3 Hasil Analisis Jaringan Jalan'),
  P(`Matriks OSRM 83 × 83 dibandingkan dengan jarak garis lurus untuk ${fint(jvl.n_pasang)} pasangan destinasi yang berjarak lebih dari 1,5 km (${refG('IV')}). Jarak tempuh di jaringan jalan rata-rata **${fmt(jvl.rata2, 2)} kali** jarak garis lurus (median ${fmt(jvl.median, 2)}; persentil 10–90: ${fmt(jvl.p10, 2)}–${fmt(jvl.p90, 2)}), atau lebih panjang ${fmt(jvl.selisih_rata2_persen, 0)}%. Angka ini jauh lebih besar daripada selisih 13,15% yang dilaporkan untuk skala DIY secara umum (Al Ghifari & Atunggal, 2026), karena jalan di perbukitan Menoreh berkelok dan harus memutar lembah serta Sungai Progo. Temuan ini menguatkan keputusan memakai routing jaringan jalan, bukan jarak Euclidean. Kecepatan rata-rata model OSRM adalah ${fmt(QA.kecepatan_rata2_kmh, 1)} km/jam.`),
  ...figure(IMG('rasio_jarak.png'), 'IV', 'Perbandingan jarak jalan OSRM terhadap jarak garis lurus antar-destinasi', 14.5),
  NOTE('Kecepatan model OSRM (sekitar 43 km/jam) kemungkinan optimistis untuk jalan sempit dan menanjak di Menoreh. Disarankan menguji 5–10 ruas secara lapangan (catat waktu tempuh nyata) untuk menilai perlunya faktor koreksi.'),

  H2('IV.4 Hasil Pemeringkatan SAW'),
  P(`Sebagai ilustrasi, skenario S1 memakai titik awal Gua Maria Sendangsono, bobot AHP bawaan, semua kategori, dan tanpa batas waktu atau anggaran. Sebanyak ${S1.n_lolos} destinasi lolos penyaringan. ${refT('IV')} memperlihatkan perhitungan tiga peringkat teratas. Nilai minimum C1 dan C2 serta nilai maksimum C3 dan C4 diambil dari seluruh ${S1.n_lolos} alternatif.`),
  capT('IV', 'Contoh perhitungan SAW tiga peringkat teratas skenario S1'),
  table(['Destinasi', 'x C1', 'x C2', 'x C3', 'x C4', 'r C1', 'r C2', 'r C3', 'r C4', 'V'],
    s1top.map((a) => [a.nama, ...a.x.map((v) => fmt(v, 2)), ...a.r.map((v) => fmt(v, 3)), fmt(a.V, 4)]),
    [2.6, 0.75, 0.6, 0.6, 0.65, 0.65, 0.65, 0.65, 0.65, 0.75], { numCols: [1, 2, 3, 4, 5, 6, 7, 8, 9], size: 16 }),
  P(`Sebagai contoh, V Gua Maria Sendangsono = ${fmt(w[0], 4)}×${fmt(s1top[0].r[0], 3)} + ${fmt(w[1], 4)}×${fmt(s1top[0].r[1], 3)} + ${fmt(w[2], 4)}×${fmt(s1top[0].r[2], 3)} + ${fmt(w[3], 4)}×${fmt(s1top[0].r[3], 3)} = ${fmt(s1top[0].V, 4)}. Destinasi ini unggul karena dekat dari titik awal, gratis, berating 4,8, dan sangat populer.`),
  P(`Hasil empat skenario dengan titik awal, bobot, dan batasan berbeda ditunjukkan pada ${refT('IV')}. Perubahan profil bobot dan lokasi awal mengubah susunan peringkat secara berarti. Profil "dekat" (S2) mengutamakan objek di sekitar Jatimulyo, sedangkan profil "hemat" (S3) mengangkat destinasi gratis berating tinggi. Gua Maria Sendangsono muncul di peringkat atas pada tiga skenario, yang menunjukkan destinasi ini kuat di hampir semua kriteria.`),
  capT('IV', 'Lima peringkat teratas pada empat skenario uji'),
  table(['Skenario', 'Titik awal & batasan', 'Lima teratas (V)'], VS.map((v) => {
    const s = SC.find((x) => x.kode === v.kode);
    return [v.kode, `${v.asal}; ${v.judul}; ${v.n_alternatif} alternatif`, v.top5.map((t, i) => `${i + 1}. ${t[0]} (${fmt(t[1], 3)})`).join('\n')];
  }), [0.8, 3, 4.6], { center: [0], size: 18 }),

  H2('IV.5 Hasil Penyusunan Rute'),
  P(`Rute nearest neighbour pada keempat skenario ditunjukkan pada ${refT('IV')}. Seluruh rute mematuhi batas waktu, anggaran, dan jumlah pemberhentian. Kepatuhan ini diverifikasi otomatis pada uji unit dan pada validasi silang.`),
  capT('IV', 'Rute kunjungan hasil nearest neighbour'),
  table(['Skenario', 'Urutan kunjungan', 'Total waktu', 'Biaya tiket'], SC.map((s) => [s.kode, s.rute.map((id, i) => `${i + 1}. ${nameById[id]}`).join('\n'), fmt(s.rute_total_jam, 2) + ' jam', rp(s.rute_biaya)]), [0.8, 5, 1.2, 1.2], { center: [0], numCols: [2, 3], size: 18 }),
  P('Kelemahan heuristik nearest neighbour terlihat pada beberapa kasus, misalnya rute yang berbalik arah karena destinasi terdekat berikutnya berada di sisi berlawanan. Untuk 4–6 pemberhentian, perbaikan dapat dilakukan dengan pencarian lokal 2-opt atau layanan *Trip* OSRM. Kedua opsi ini dicatat sebagai pengembangan lanjutan.'),

  H2('IV.6 Hasil WebGIS'),
  P(`WebGIS diberi nama **Jelajah Menoreh**. Sistem bekerja berbasis pertanyaan: saat pengguna membuka halaman, sistem terlebih dahulu menampilkan **panduan lima pertanyaan**. Setelah jawaban dikonfirmasi, aplikasi langsung menghitung rekomendasi dan rute sesuai kriteria tersebut. Setelah itu tersedia lima tab: Rekomendasi & Rute, Jelajah, Metode AHP–SAW, Data & Mutu, dan Tentang. Tampilan menggunakan palet hijau hutan dan aksen emas dengan judul bertipe serif agar tetap menarik namun formal.`),
  H3('IV.6.1 Panduan awal lima pertanyaan'),
  P(`Panduan tampil layar penuh. Panel kiri berisi identitas sistem dan ilustrasi perbukitan Menoreh, sedangkan panel kanan memuat pertanyaan bertahap dengan bilah kemajuan, tombol Kembali/Lanjut, dan tautan "Lewati" bagi pengguna yang hanya ingin menjelajah peta. Rincian pertanyaan dan pilihan jawabannya ditunjukkan pada ${refT('IV')}.`),
  capT('IV', 'Pertanyaan panduan awal dan pemanfaatannya dalam sistem'),
  table(['No', 'Pertanyaan', 'Pilihan jawaban', 'Pemanfaatan'], [
    ['1', 'Dari mana Anda akan memulai perjalanan?', 'Gunakan lokasi saya (GPS); klik peta mini; cari nama tempat; pilihan cepat', 'Titik asal perhitungan waktu tempuh OSRM (kriteria C1) dan titik awal rute'],
    ['2', 'Jenis wisata apa yang ingin Anda kunjungi?', 'Bebas/semua atau salah satu dari 5 kategori (kartu berikon)', 'Penyaringan kategori'],
    ['3', 'Berapa lama waktu yang Anda miliki untuk berwisata termasuk perjalanan?', '2, 4, 6, 8 jam, tidak dibatasi, atau nilai lain', 'Penyaringan waktu dan batas rute'],
    ['4', 'Berapa anggaran maksimum yang ingin Anda keluarkan?', 'Gratis, Rp10.000, Rp25.000, Rp50.000, Rp100.000, tidak dibatasi, atau nilai lain', 'Penyaringan biaya dan batas biaya rute'],
    ['5', 'Berapa rating minimum destinasi wisata yang Anda inginkan?', '★3,0+, ★3,5+, ★4,0+, ★4,5+, tidak dibatasi', 'Penyaringan rating']
  ], [0.4, 2.6, 2.8, 2.4], { center: [0], size: 18 }),
  P(`Pertanyaan pertama (${refG('IV')}) menyediakan peta mini berisi batas tiga kapanewon dan sebaran destinasi. Tombol "Lanjut" baru aktif setelah titik awal ditentukan.`),
  ...figure(IMG('00a_panduan_lokasi.png'), 'IV', 'Panduan langkah 1: menentukan lokasi awal perjalanan', 15),
  P(`Pertanyaan jenis wisata ditampilkan sebagai kartu berikon beserta jumlah destinasi setiap kategori (${refG('IV')}). Pertanyaan waktu, anggaran, dan rating ditampilkan sebagai pilihan cepat yang tetap dapat diisi nilai lain (${refG('IV').replace(/\d+$/, (n) => +n + 1)}).`),
  ...figure(IMG('00b_panduan_jenis.png'), 'IV', 'Panduan langkah 2: memilih jenis wisata', 15),
  ...figure(IMG('00c_panduan_waktu.png'), 'IV', 'Panduan langkah 3: menentukan waktu yang tersedia', 15),
  P(`Sebelum perhitungan dijalankan, pengguna melihat ringkasan kelima jawaban dan dapat mengubah salah satunya (${refG('IV')}). Tombol "Tampilkan Rekomendasi" menutup panduan, menerapkan jawaban ke kriteria, lalu menjalankan penyaringan, SAW, dan penyusunan rute secara otomatis.`),
  ...figure(IMG('00f_panduan_ringkasan.png'), 'IV', 'Ringkasan jawaban sebelum rekomendasi dihitung', 15),
  H3('IV.6.2 Hasil rekomendasi dan rute'),
  P(`Hasil ditampilkan pada tab Rekomendasi & Rute (${refG('IV')}). Bagian atas memuat kartu "Kriteria perjalanan Anda". Di bawahnya terdapat peringkat 10 teratas lengkap dengan nilai V, batang kontribusi setiap kriteria, waktu dan jarak tempuh, biaya, serta rating. Di peta, nomor peringkat ditampilkan dan destinasi yang tidak memenuhi kriteria diredupkan. Tombol "Ubah preferensi" di header membuka kembali panduan.`),
  ...figure(IMG('05_peringkat.png'), 'IV', 'Hasil peringkat rekomendasi sesuai jawaban panduan', 15),
  P(`Sub-tab **Rute kunjungan** (${refG('IV')}) menampilkan urutan kunjungan dalam bentuk lini waktu, waktu dan jarak setiap ruas, total waktu, sisa waktu, total biaya tiket, garis rute pada jaringan jalan, serta daftar petunjuk arah berbahasa Indonesia untuk setiap pemberhentian.`),
  ...figure(IMG('06_rute.png'), 'IV', 'Rute kunjungan hasil nearest neighbour pada jaringan jalan', 15),
  P(`Navigasi rute dilakukan sepenuhnya di dalam WebGIS, tanpa aplikasi pihak ketiga. Di bawah lini waktu ditampilkan **petunjuk arah** belok-demi-belok berbahasa Indonesia yang dikelompokkan per pemberhentian (${refG('IV')}). Setiap langkah dapat diklik untuk melihat lokasi manuvernya di peta.`),
  ...figure(IMG('11_petunjuk_arah.png'), 'IV', 'Petunjuk arah belok-demi-belok berbahasa Indonesia', 15),
  P(`Tombol **Mulai navigasi (GPS)** mengaktifkan pelacakan posisi pengguna. Banner navigasi di atas peta menampilkan jarak ke manuver berikutnya, kalimat petunjuk, pemberhentian yang dituju, serta sisa jarak dan waktu (${refG('IV')}). Langkah yang sedang aktif disorot pada daftar, peta mengikuti posisi pengguna, dan tersedia panduan suara berbahasa Indonesia. Bila pengguna keluar dari rute, sistem menghitung ulang rute dari posisi terkini. Tombol **Simulasi perjalanan** menjalankan skenario yang sama tanpa GPS untuk keperluan presentasi. Tampilan navigasi pada ponsel ditunjukkan pada ${refG('IV').replace(/\d+$/, (n) => +n + 1)}.`),
  ...figure(IMG('12_navigasi.png'), 'IV', 'Mode navigasi di dalam WebGIS (banner petunjuk dan posisi pengguna)', 15),
  ...figure(IMG('13_navigasi_mobile.png'), 'IV', 'Mode navigasi pada layar ponsel', 6),
  P(`Untuk transparansi dan pertanggungjawaban metode, tombol "Lihat perhitungan SAW" menampilkan bobot, nilai ekstrem, matriks keputusan X, matriks ternormalisasi R, dan nilai V seluruh alternatif. Tabel ini dapat diunduh sebagai CSV (${refG('IV')}). Tombol "Destinasi tersaring" menampilkan destinasi yang dikeluarkan beserta alasannya.`),
  ...figure(IMG('07_saw.png'), 'IV', 'Tabel transparansi perhitungan SAW', 15),
  P(`Bagi pengguna lanjut, bagian "Atur kriteria secara manual & bobot" (${refG('IV')}) memuat kelima kriteria dalam satu formulir. Bagian ini juga berisi penggeser bobot kriteria, profil bobot, jumlah pemberhentian maksimum, opsi kembali ke titik awal, opsi objek di luar cakupan, dan koreksi rating Bayesian.`),
  ...figure(IMG('04_form.png'), 'IV', 'Formulir kriteria manual dan pengaturan bobot', 15),
  H3('IV.6.3 Jelajah, metode, dan data'),
  P(`Tab **Jelajah** (${refG('IV')}) menampilkan peta interaktif dengan batas kapanewon dan kalurahan, jaringan jalan RBI, tiga peta dasar (OSM, citra satelit, topografi), dan 70 destinasi berikon kategori. Pengguna dapat mencari nama, memfilter kategori dan kapanewon, serta mengurutkan berdasarkan nama, ulasan, atau rating.`),
  ...figure(IMG('01_jelajah.png'), 'IV', 'Tab Jelajah: peta interaktif dan daftar destinasi', 15),
  P(`Menekan sebuah destinasi menampilkan *pop-up* ringkas dan jendela detail berisi deskripsi, lokasi administratif, koordinat, rating, harga tiket dan paket, jam operasional, asumsi durasi, serta catatan mutu data (${refG('IV')}). Tombol "Mulai dari sini" menjadikan destinasi tersebut titik awal rekomendasi.`),
  ...figure(IMG('03_detail.png'), 'IV', 'Jendela detail destinasi beserta catatan mutu data', 15),
  P(`Tab **Metode AHP–SAW** berisi alur sistem, tabel kriteria, rumus, dan kalkulator AHP interaktif (${refG('IV')}). Kalkulator ini menghitung bobot, λmaks, CI, RI, dan CR, lalu menolak penerapan bobot bila CR > 0,10. Tab **Data & Mutu** (${refG('IV').replace(/\d+$/, (n) => +n + 1)}) menyajikan rekap kategori × kapanewon, ringkasan kendali mutu, tabel atribut, dan unduhan GeoJSON/CSV.`),
  ...figure(IMG('08_ahp.png'), 'IV', 'Kalkulator AHP pada tab Metode', 15),
  ...figure(IMG('09_data.png'), 'IV', 'Tab Data & Mutu', 15),
  P(`Antarmuka bersifat responsif. Pada layar ponsel, panduan dan panel ditata bertumpuk (${refG('IV')}).`),
  ...figure(IMG('10_mobile.png'), 'IV', 'Panduan awal pada layar ponsel', 6),

  H2('IV.7 Hasil Pengujian'),
  H3('IV.7.1 Uji unit dan validasi silang'),
  P(`Inti perhitungan (*js/rekom.js*) diuji dengan 13 uji unit, dan modul navigasi (*js/navigasi.js*) dengan 8 uji unit. Uji tersebut meliputi contoh buku Saaty (w = 0,637; 0,258; 0,105; CR = 0,033), matriks konsisten sempurna, deteksi matriks tidak konsisten, contoh hitung tangan SAW, kepatuhan penyaringan, batas waktu, anggaran, dan jumlah pemberhentian rute, serta terjemahan petunjuk, proyeksi posisi pada rute, penanganan jalan pergi-pulang yang tumpang tindih, deteksi keluar jalur, dan simulasi rute nyata 12 km hingga tiba. **Seluruh 21 uji lulus.** Selanjutnya, empat skenario dihitung ulang secara independen dengan Python/NumPy, tanpa memakai kode sistem (${refT('IV')}).`),
  capT('IV', 'Hasil validasi silang sistem terhadap perhitungan independen'),
  table(['Skenario', 'Alternatif', 'Peringkat identik', 'Selisih V maks.', 'Rute identik', 'Status'],
    VS.map((v) => [v.kode, String(v.n_alternatif), v.peringkat_identik ? 'Ya' : 'Tidak', v.selisih_V_maks === 0 ? '0' : v.selisih_V_maks.toExponential(1).replace('.', ','), v.rute_identik ? 'Ya' : 'Tidak', v.status]),
    [1, 1.1, 1.4, 1.4, 1.2, 1.2], { center: [0, 1, 2, 3, 4, 5] }),
  P('Hal yang sama dilakukan dengan rumus Microsoft Excel (*docs/Validasi_AHP_SAW.xlsx*, satu lembar per skenario). Selisih maksimum V antara Excel dan sistem ≤ 2,2 × 10⁻¹⁶, yaitu batas presisi bilangan *floating point*, dan urutan peringkatnya identik. Dengan demikian, perhitungan sistem terbukti 100% sesuai dengan perhitungan manual.'),
  H3('IV.7.2 Black-box testing'),
  P(`Sebanyak ${BB.uji.length} skenario uji *black-box* dijalankan otomatis di peramban (${BB.peramban}) menggunakan *tests/blackbox_ui.js* dan *tests/run_blackbox.js*. Hasilnya ditunjukkan pada ${refT('IV')}. **Seluruh ${BB.uji.length} skenario sesuai (100%).**`),
  capT('IV', 'Hasil black-box testing'),
  table(['No', 'Fitur', 'Skenario', 'Hasil yang diharapkan', 'Hasil pengujian', 'Status'], BB.uji.map((u) => [String(u.No), u.Fitur, u.Skenario, u.Harapan, u.Hasil, u.Status]),
    [0.45, 1.2, 1.9, 2.2, 2.3, 0.8], { center: [0, 5], size: 16 }),
  H3('IV.7.3 System Usability Scale (SUS)'),
  P('Uji kegunaan dilakukan dengan kuesioner SUS 10 butir (Lampiran D). Responden dianjurkan berjumlah minimal 30 orang calon pengguna (wisatawan, warga, dan pengelola). Setiap responden diminta menyelesaikan tiga tugas sebelum mengisi kuesioner: (1) mencari dan membuka detail sebuah destinasi, (2) mendapatkan rekomendasi dari lokasinya sendiri dengan batasan waktu dan anggaran, dan (3) menjalankan navigasi rute di dalam WebGIS (GPS atau simulasi). Skor dihitung otomatis pada lembar SUS di *Instrumen_Kuesioner_AHP_SUS.xlsx*.'),
  ...(() => { SUSREF = refT('IV'); return []; })(),
  capT('IV', 'Rekap hasil SUS (diisi setelah pengujian)'),
  table(['Komponen', 'Nilai'], [['Jumlah responden', '…'], ['Rata-rata skor SUS', '…'], ['Interpretasi (Bangor dkk., 2009)', '…'], ['Butir dengan skor terendah dan tindak lanjut', '…']], [4, 4]),
  NOTE(`Uji SUS belum dilaksanakan. Isi ${SUSREF} setelah pengumpulan data responden; jangan mengisi dengan angka perkiraan.`),

  H2('IV.8 Keterbatasan dan Rencana Tindak Lanjut'),
  ...numbered([
    'Bobot AHP bawaan masih penilaian sementara; perlu kuesioner responden (Tahap 9).',
    'Rating, ulasan, harga, dan jam operasional bersumber dari data sekunder (Google Maps) yang dapat berubah; perlu *ground check*, terutama untuk 5 duplikat yang digabung, 4 titik batas, dan objek tanpa rating.',
    'Atribut fasilitas (toilet, parkir, warung, musala) belum tersedia sehingga belum menjadi kriteria; dapat ditambahkan sebagai C5 setelah survei.',
    'Durasi kunjungan dan kecepatan tempuh OSRM masih asumsi; perlu kalibrasi lapangan.',
    'Jam operasional belum dipakai sebagai batasan (misalnya destinasi tutup pada jam kedatangan); dapat dikembangkan dengan masukan jam berangkat.',
    'Heuristik nearest neighbour tidak menjamin rute optimal; dapat ditingkatkan dengan 2-opt atau layanan *Trip* OSRM.',
    'Layanan OSRM publik dan Nominatim memiliki batas penggunaan; untuk operasional jangka panjang disarankan memasang OSRM sendiri (data OSM Jawa) atau memakai OpenRouteService dengan kunci API.'
  ])
];

/* ------------------------------------------------------------------ BAB V */
const bab5 = [
  H1('BAB V', 'PENUTUP'),
  H2('V.1 Kesimpulan'),
  ...numbered([
    `Inventarisasi menghasilkan ${QA.n_setelah_gabung} destinasi bersih dari ${QA.n_mentah} entri awal. Sebanyak ${QA.n_in_scope} destinasi berada dalam cakupan tiga kapanewon (Samigaluh ${QA.per_kecamatan_in_scope.Samigaluh}, Kalibawang ${QA.per_kecamatan_in_scope.Kalibawang}, Girimulyo ${QA.per_kecamatan_in_scope.Girimulyo}) dan diklasifikasikan ke dalam lima kategori, dengan Wisata Alam sebagai kategori terbesar (${rekapRows[0][4]}). Data disimpan sebagai basis data spasial (GeoJSON, GeoPackage, PostGIS).`,
    `Pembobotan AHP terhadap empat kriteria menghasilkan bobot rating ${fmt(w[2] * 100, 1)}%, waktu tempuh ${fmt(w[0] * 100, 1)}%, popularitas ${fmt(w[3] * 100, 1)}%, dan biaya ${fmt(w[1] * 100, 1)}% dengan CR = ${fmt(CFG.ahp_result.cr)} (konsisten). Bobot ini berfungsi sebagai bobot default yang dapat disesuaikan pengguna.`,
    'SAW berhasil menghasilkan skor dan peringkat yang responsif terhadap lokasi awal, batasan, dan bobot pengguna. Hasilnya identik dengan perhitungan independen Python dan rumus Excel pada empat skenario uji.',
    `Rekomendasi rute disusun dengan nearest neighbour atas 10 destinasi prioritas, berbasis waktu tempuh jaringan jalan OSRM, dan selalu memenuhi batas waktu dan anggaran. Jarak jalan di wilayah kajian rata-rata ${fmt(jvl.rata2, 2)} kali jarak garis lurus, sehingga routing jaringan jalan sangat diperlukan.`,
    `WebGIS "Jelajah Menoreh" menyajikan basis data, peringkat, perhitungan transparan, dan rute dalam antarmuka responsif yang lulus ${BB.uji.length}/${BB.uji.length} skenario black-box.`
  ]),
  H2('V.2 Saran'),
  ...numbered([
    `Melaksanakan kuesioner AHP dan uji SUS, lalu memperbarui bobot default dan ${SUSREF}.`,
    'Melakukan *ground check* untuk duplikat, titik batas, harga, jam operasional, dan menambahkan atribut fasilitas sebagai kriteria baru.',
    'Menambahkan masukan jam berangkat untuk memeriksa jam operasional, serta perbaikan rute 2-opt.',
    'Men-*deploy* WebGIS ke Vercel/GitHub Pages dan menyerahkan basis data kepada pemerintah kapanewon untuk pemutakhiran berkala.'
  ])
];

/* ------------------------------------------------------------------ Daftar Pustaka */
const pustaka = [
  'Aczél, J., & Saaty, T. L. (1983). Procedures for synthesizing ratio judgements. *Journal of Mathematical Psychology*, 27(1), 93–102. https://doi.org/10.1016/0022-2496(83)90028-7',
  'Aji, G. H. N., & Saputra, R. (2019). Aplikasi pendukung pemilihan objek wisata Kabupaten Kebumen menggunakan metode Analytical Hierarchy Process (AHP) dan Simple Additive Weighting (SAW). *Jurnal Masyarakat Informatika*, 10(2), 28–39. https://doi.org/10.14710/jmasif.10.2.31499',
  'Al Ghifari, H. N., & Atunggal, D. (2026). Pembuatan sistem perekomendasi destinasi wisata menggunakan metode Simple Additive Weighting di Daerah Istimewa Yogyakarta. *Journal of Geospatial Information Science and Engineering (JGISE)* (naskah dalam proses terbit).',
  'Ashari, R. A., Suprayogi, A., & Nugraha, A. L. (2015). Aplikasi sistem informasi geografis pariwisata berbasis web di Kabupaten Pemalang. *Jurnal Geodesi Undip*, 4(2), 70–77. https://doi.org/10.14710/jgundip.2015.8497',
  'Azhar, N. A., Mohamed Radzi, N. A., & Wan Ahmad, W. S. H. M. (2021). Multi-criteria decision making: A systematic review. *Recent Advances in Electrical & Electronic Engineering*, 14(8). https://doi.org/10.2174/2352096514666211029112443',
  'Badan Pusat Statistik Kabupaten Kulon Progo. (2024). *Kapanewon Girimulyo dalam angka 2024*.',
  'Bangor, A., Kortum, P., & Miller, J. (2009). Determining what individual SUS scores mean: Adding an adjective rating scale. *Journal of Usability Studies*, 4(3), 114–123.',
  'Barrera-Narváez, C. F., González-Sanabria, J. S., & Cáceres-Castellanos, G. (2020). Toma de decisiones en el sector turismo mediante el uso de Sistemas de Información Geográfica e inteligencia de negocios. *Revista Científica*, 38(2), 160–173. https://doi.org/10.14483/23448350.15997',
  'Brooke, J. (1996). SUS: A "quick and dirty" usability scale. Dalam P. W. Jordan, B. Thomas, B. A. Weerdmeester, & I. L. McClelland (Ed.), *Usability evaluation in industry* (hlm. 189–194). Taylor & Francis.',
  'Hernawati, E., Sari, S. K., & Wijaya, D. R. (2022). Combination of analytic hierarchy process and simple additive weighting for tourist attractions recommendation system. *IJAIT (International Journal of Applied Information Technology)*, 5(2), 123–131. https://doi.org/10.25124/ijait.v5i02.4472',
  'Kapoh, H., Melo, O. E., & Kimbal, A. A. (2021). Black box testing in web-based applications: Case study—Remedial application at Manado State Polytechnic. *International Journal of Computer Applications*, 174(12), 21–24. https://doi.org/10.5120/ijca2021921002',
  'Kshetri, T. B., Chaksan, A., & Sharma, S. (2021). The role of open-source Python package geoserver-rest in Web-GIS development. *The International Archives of the Photogrammetry, Remote Sensing and Spatial Information Sciences*, XLVI-4/W2-2021, 91–96. https://doi.org/10.5194/isprs-archives-XLVI-4-W2-2021-91-2021',
  'Longley, P. A., Goodchild, M. F., Maguire, D. J., & Rhind, D. W. (2015). *Geographic information science and systems* (4th ed.). John Wiley & Sons.',
  'Luxen, D., & Vetter, C. (2011). Real-time routing with OpenStreetMap data. *Proceedings of the 19th ACM SIGSPATIAL International Conference on Advances in Geographic Information Systems*, 513–516. https://doi.org/10.1145/2093973.2094062',
  'Pemerintah Kapanewon Girimulyo. (2023). *Tentang Girimulyo*. https://girimulyo.kulonprogokab.go.id/publikasi/detail/tentang-girimulyo',
  'Pemerintah Kapanewon Kalibawang. (2023). *Monografi Kalibawang*. https://kalibawang.kulonprogokab.go.id/publikasi/detail/monografi-kalibawang',
  'Pemerintah Kapanewon Samigaluh. (2023). *Sejarah dan gambaran umum*. https://samigaluh.kulonprogokab.go.id/publikasi/detail/sejarah-dan-gambaran-umum',
  'Republik Indonesia. (2009). *Undang-Undang Nomor 10 Tahun 2009 tentang Kepariwisataan*.',
  'Republik Indonesia. (2025). *Undang-Undang Nomor 18 Tahun 2025 tentang Perubahan Ketiga atas Undang-Undang Nomor 10 Tahun 2009 tentang Kepariwisataan*.',
  'Rosenkrantz, D. J., Stearns, R. E., & Lewis, P. M. (1977). An analysis of several heuristics for the traveling salesman problem. *SIAM Journal on Computing*, 6(3), 563–581. https://doi.org/10.1137/0206041',
  'Saaty, T. L. (2008). Decision making with the analytic hierarchy process. *International Journal of Services Sciences*, 1(1), 83–98. https://doi.org/10.1504/IJSSCI.2008.017590',
  'Sulastri, A., Aditia, I. N., Raiya, M. S., Usrianto, U., Muhamad, N., & Nangi, J. (2025). Penerapan sistem informasi geografis (SIG) dalam pemetaan tempat wisata di Kota Kendari. *JATI (Jurnal Mahasiswa Teknik Informatika)*, 9(5), 8037–8044. https://doi.org/10.36040/jati.v9i5.14992',
  'Villacreses, G., Martínez-Gómez, J., Jijón, D., & Cordovez, M. (2022). Geolocation of photovoltaic farms using Geographic Information Systems (GIS) with multiple-criteria decision-making (MCDM) methods: Case of the Ecuadorian energy regulation. *Energy Reports*, 8, 3526–3548. https://doi.org/10.1016/j.egyr.2022.02.152',
  'Yoeti, O. A. (1996). *Pengantar ilmu pariwisata* (Edisi revisi). Angkasa.',
  'Yusuf, M., & Astuti, Y. (2020). System Usability Scale (SUS) untuk pengujian usability pada Pijar Career Center. *Komputika: Jurnal Sistem Komputer*, 9(2), 131–138. https://doi.org/10.34010/komputika.v9i2.2873'
];
const dapus = [H1('DAFTAR PUSTAKA', null), ...pustaka.map((t) => new Paragraph({ children: runs(t), alignment: AlignmentType.LEFT, indent: { left: 567, hanging: 567 }, spacing: { after: 120, line: 276 } }))];

/* ------------------------------------------------------------------ Lampiran */
const kamus = [
  ['id', 'integer', 'ID destinasi pada sistem'], ['nama', 'teks', 'Nama objek wisata (hasil penggabungan bila duplikat)'], ['kecamatan, desa, kabupaten', 'teks', 'Hasil overlay RBI (atau catatan tim untuk titik batas)'],
  ['kategori', 'teks', 'Salah satu dari 5 kategori'], ['jenis', 'teks', 'Kategori bawaan Google Maps'], ['deskripsi', 'teks', 'Deskripsi singkat destinasi'],
  ['rating, ulasan', 'desimal, integer', 'Rating rata-rata dan jumlah ulasan Google Maps'], ['harga_teks, paket_teks, makan_teks', 'teks', 'Teks harga asli'],
  ['biaya_rp', 'integer', 'Biaya kunjungan yang dipakai sistem (Rp)'], ['biaya_skala', 'integer 1–5', 'Nilai kriteria C2'], ['biaya_dasar', 'teks', 'Dasar penetapan biaya (tiket, paket, estimasi)'],
  ['menginap', 'boolean', 'Objek akomodasi menginap'], ['durasi_jam', 'desimal', 'Asumsi durasi kunjungan'], ['jam, hari', 'teks', 'Jam dan hari operasional'],
  ['in_scope, status_wilayah', 'boolean, teks', 'Status cakupan wilayah'], ['no_asal', 'daftar', 'Nomor baris pada data awal'], ['catatan', 'daftar teks', 'Catatan mutu data'], ['geom', 'titik WGS 84', 'Koordinat (EPSG:4326)']
];
const ahpForm = [
  ['C1 Waktu tempuh', '9 8 7 6 5 4 3 2 1 2 3 4 5 6 7 8 9', 'C2 Biaya kunjungan'], ['C1 Waktu tempuh', '9 8 7 6 5 4 3 2 1 2 3 4 5 6 7 8 9', 'C3 Rating'],
  ['C1 Waktu tempuh', '9 8 7 6 5 4 3 2 1 2 3 4 5 6 7 8 9', 'C4 Popularitas'], ['C2 Biaya kunjungan', '9 8 7 6 5 4 3 2 1 2 3 4 5 6 7 8 9', 'C3 Rating'],
  ['C2 Biaya kunjungan', '9 8 7 6 5 4 3 2 1 2 3 4 5 6 7 8 9', 'C4 Popularitas'], ['C3 Rating', '9 8 7 6 5 4 3 2 1 2 3 4 5 6 7 8 9', 'C4 Popularitas']
];
const susItems = ['Saya berpikir akan sering menggunakan WebGIS ini.', 'Saya merasa WebGIS ini terlalu rumit.', 'Saya merasa WebGIS ini mudah digunakan.',
  'Saya membutuhkan bantuan orang teknis untuk dapat menggunakan WebGIS ini.', 'Saya merasa fitur-fitur WebGIS ini terintegrasi dengan baik.',
  'Saya merasa terlalu banyak ketidakkonsistenan dalam WebGIS ini.', 'Saya rasa kebanyakan orang akan cepat belajar menggunakan WebGIS ini.',
  'Saya merasa WebGIS ini sangat merepotkan untuk digunakan.', 'Saya merasa percaya diri saat menggunakan WebGIS ini.', 'Saya perlu banyak belajar sebelum dapat menggunakan WebGIS ini.'];
const qa = [
  ['Mengapa AHP–SAW, bukan TOPSIS/VIKOR?', 'AHP dipakai khusus untuk bobot dan SAW untuk peringkat. Keduanya transparan, mudah divalidasi manual (terbukti identik dengan Excel), dan bobotnya dapat diubah pengguna secara langsung. TOPSIS dapat menjadi pembanding pada penelitian lanjutan.'],
  ['Mengapa biaya dikonversi ke skala 1–5?', 'Sebagian besar destinasi gratis (Rp0) sehingga rumus cost min/x tidak terdefinisi. Rentang rupiah juga sangat timpang (Rp3.000 hingga Rp500.000). Skala ordinal menjaga rumus tetap valid dan proporsional.'],
  ['Mengapa jumlah ulasan memakai logaritma?', `Distribusinya sangat menjulur (skewness ${fmt(ULS.skewness, 2)}; median ${fint(ULS.median)} vs maksimum ${fint(ULS.max)}). Tanpa ln, hampir semua destinasi mendapat nilai ≈ 0. Setelah ln, skewness menjadi ${fmt(ULS.skewness_ln, 2)}.`],
  ['Mengapa tidak memakai jarak garis lurus?', `Jarak jalan rata-rata ${fmt(jvl.rata2, 2)}× jarak lurus di Menoreh (${fint(jvl.n_pasang)} pasangan), sehingga jarak lurus akan menyesatkan peringkat dan rute.`],
  ['Bagaimana membuktikan perhitungan sistem benar?', '21 uji unit, validasi silang Python (identik), validasi rumus Excel (selisih ≤ 2,2×10⁻¹⁶), dan tabel "Lihat perhitungan SAW" yang dapat dicocokkan langsung saat demo.'],
  ['Mengapa ada titik di luar Kulon Progo?', 'Data Google Maps diambil dengan kotak batas yang lebih luas. Titik tersebut disimpan dan diberi label, tetapi tidak ikut rekomendasi kecuali diminta. Empat titik batas (≤ 150 m) tetap dimasukkan karena selisihnya berasal dari ketelitian batas RBI.'],
  ['Apakah rute nearest neighbour optimal?', 'Tidak dijamin optimal (heuristik). Namun cepat, mudah dijelaskan, dan memenuhi batas waktu/anggaran. Perbaikan 2-opt atau OSRM Trip direncanakan.'],
  ['Bobot AHP berasal dari mana?', 'Saat ini dari penilaian sementara tim (CR 0,017). Kuesioner responden akan menggantikannya; prosedur dan lembar agregasi geometris sudah disiapkan.'],
  ['Apa yang terjadi bila internet/OSRM mati?', 'Peta dasar memerlukan internet. Perhitungan tetap berjalan: waktu tempuh dari titik awal beralih ke estimasi terkalibrasi (×1,74; 43 km/jam) dan diberi tanda, sedangkan matriks antar-destinasi sudah tersimpan.']
];
const lampiran = [
  H1('LAMPIRAN', null),
  H2('Lampiran A. Kamus Data Tabel Destinasi Wisata'),
  capT('L', 'Kamus data destinasi_wisata'),
  table(['Atribut', 'Tipe', 'Keterangan'], kamus, [2.6, 1.6, 4]),
  H2('Lampiran B. Daftar Destinasi Dalam Cakupan'),
  capT('L', 'Daftar 70 destinasi wisata dalam cakupan'),
  table(['ID', 'Nama', 'Kapanewon', 'Kalurahan', 'Kategori', 'Rating', 'Ulasan', 'Biaya'],
    inn.slice().sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.nama.localeCompare(b.nama)).map((d) => [String(d.id), d.nama, d.kecamatan, d.desa || '–', d.kategori, d.rating == null ? '–' : fmt(d.rating, 1), d.ulasan == null ? '–' : fint(d.ulasan), rp(d.biaya_rp)]),
    [0.5, 3, 1.2, 1.2, 1.8, 0.7, 0.8, 1], { center: [0], numCols: [5, 6, 7], size: 16 }),
  H2('Lampiran C. Kuesioner Perbandingan Berpasangan AHP'),
  PN('Petunjuk: lingkari satu angka pada setiap baris. Angka di sisi kiri berarti kriteria kiri lebih penting, angka di sisi kanan berarti kriteria kanan lebih penting, dan angka 1 di tengah berarti sama penting. Skala: 1 = sama penting; 3 = sedikit lebih penting; 5 = lebih penting; 7 = sangat lebih penting; 9 = mutlak lebih penting; 2, 4, 6, 8 = nilai antara.'),
  PN('Pertanyaan: "Dalam memilih destinasi wisata di Girimulyo, Kalibawang, dan Samigaluh, seberapa penting kriteria berikut dibanding kriteria pasangannya?"'),
  table(['Kriteria kiri', 'Skala', 'Kriteria kanan'], ahpForm, [2.2, 4.4, 2.2], { center: [1] }),
  PN('Identitas responden: nama/inisial …… ; kategori (wisatawan / warga / pengelola / pakar) …… ; tanggal ……'),
  H2('Lampiran D. Kuesioner System Usability Scale (SUS)'),
  PN('Petunjuk: setelah mencoba WebGIS, beri tanda pada skala 1 (sangat tidak setuju) sampai 5 (sangat setuju).'),
  table(['No', 'Pernyataan', '1', '2', '3', '4', '5'], susItems.map((t, i) => [String(i + 1), t, '', '', '', '', '']), [0.5, 5, 0.5, 0.5, 0.5, 0.5, 0.5], { center: [0] }),
  H2('Lampiran E. Panduan Menjalankan dan Memperbarui Sistem'),
  ...numbered([
    '**Membuka WebGIS:** klik ganda *index.html*, atau jalankan *node serve.js* di folder proyek lalu buka http://localhost:8080 (diperlukan agar fitur "Gunakan lokasi saya" diizinkan peramban).',
    '**Memperbarui data:** sunting Excel basis data potensi wisata, lalu jalankan pipeline dengan Python bawaan QGIS: *python pipeline/build_data.py <GDB_RBI> <XLSX> .* Semua berkas di *data/* dan *db/* akan dibangun ulang, termasuk matriks OSRM.',
    '**Mengganti bobot AHP:** ubah AHP_DEFAULT pada *pipeline/build_data.py* sesuai hasil kuesioner, lalu jalankan ulang pipeline.',
    '**Menguji:** *npm test* (uji unit perhitungan & navigasi); *node tests/export_scenarios.js* lalu *python tests/cross_check.py* (validasi silang); *tests/blackbox_ui.js* di Console peramban (black-box).',
    '**Membuat ulang gambar, Excel, dan laporan:** *pipeline/make_figures.py*, *pipeline/make_excel.py*, *pipeline/make_report.js*.',
    '**Deployment:** unggah seluruh folder proyek ke repositori GitHub, lalu impor ke Vercel (tanpa *build command*, *output directory* = root) atau aktifkan GitHub Pages.'
  ]),
  H2('Lampiran F. Panduan Presentasi dan Antisipasi Pertanyaan'),
  PN('Alur demo yang disarankan (±10 menit): (1) buka web, lalu jawab panduan lima pertanyaan (lokasi Gerbosari, Bebas, 6 jam, Rp50.000, tidak dibatasi) dan tekan Tampilkan Rekomendasi; (2) jelaskan kartu kriteria dan peringkat; (3) peringkat, Lihat perhitungan SAW, cocokkan satu baris dengan rumus; (4) sub-tab Rute: tunjukkan petunjuk arah lalu klik Simulasi perjalanan untuk memperagakan navigasi di dalam WebGIS; (5) ubah profil bobot ke "Hemat" dan tunjukkan perubahan peringkat; (6) tab Metode: ubah satu perbandingan menjadi tidak konsisten dan tunjukkan CR > 0,10; (7) tab Data & Mutu.'),
  capT('L', 'Antisipasi pertanyaan penguji'),
  table(['Pertanyaan', 'Jawaban singkat'], qa, [2.8, 5.4], { size: 18 })
];

/* ================================================================== dokumen */
const footerNum = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 22 })] })] });
const page = { size: { width: 11906, height: 16838 }, margin: { top: 2268, bottom: 1701, left: 2268, right: 1701 } };
const doc = new Document({
  creator: 'Tim PRGG Wisata Kulon Progo Utara', title: 'Proposal dan Laporan Hasil – WebGIS Wisata Kulon Progo Utara',
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, font: FONT, color: '000000' }, paragraph: { spacing: { before: 0, after: 240 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, font: FONT, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, italics: true, font: FONT, color: '000000' }, paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 } },
      { id: 'KeteranganGambar', name: 'KeteranganGambar', basedOn: 'Normal', next: 'Normal', run: { size: 22, font: FONT }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 } } },
      { id: 'KeteranganTabel', name: 'KeteranganTabel', basedOn: 'Normal', next: 'Normal', run: { size: 22, font: FONT }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 200, after: 80 }, keepNext: true } }
    ]
  },
  numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 283 } } } }] }, ...NUMS] },
  sections: [
    { properties: { page }, children: cover },
    { properties: { page, type: SectionType.NEXT_PAGE, pageNumbers: { start: 2, formatType: NumberFormat.LOWER_ROMAN } }, footers: { default: footerNum }, children: [...pengesahan, ...ringkasan, ...tocs] },
    { properties: { page, type: SectionType.NEXT_PAGE, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } }, footers: { default: footerNum }, children: [...bab1, ...bab2, ...bab3, ...bab4, ...bab5, ...dapus, ...lampiran] }
  ]
});
const out = path.join(ROOT, 'docs', 'Laporan_Proposal_WebGIS_Wisata_KulonProgo.docx');
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(out, b); console.log('tersimpan', out, (b.length / 1024 / 1024).toFixed(1) + ' MB'); });
