// Menjalankan 4 skenario uji melalui rekom.js dan menyimpan hasilnya untuk divalidasi silang (tests/cross_check.py)
const fs = require('fs');
const path = require('path');
const R = require('../js/rekom.js');
const { loadData } = require('./load_data.js');

const { w, dests, antar, travelFrom } = loadData();
const byName = (s) => dests.find((d) => d.nama.toLowerCase().includes(s.toLowerCase())).id;

const SCEN = [
  { kode: 'S1', judul: 'Bobot AHP bawaan, semua kategori, tanpa batasan', asal: byName('Sendangsono'),
    bobot: w.CONFIG.ahp_result.w, params: { kategori: 'semua', ratingMin: 0, jamMaks: null, anggaran: null, maksPemberhentian: 5 } },
  { kode: 'S2', judul: 'Profil "dekat", Wisata Alam, 5 jam, Rp25.000', asal: byName('Ekowisata Sungai Mudal'),
    bobot: [0.5, 0.2, 0.2, 0.1], params: { kategori: 'Wisata Alam', ratingMin: 0, jamMaks: 5, anggaran: 25000, maksPemberhentian: 5 } },
  { kode: 'S3', judul: 'Profil "hemat", rating minimal 4,5', asal: byName('Kebun Teh Nglinggo'),
    bobot: [0.15, 0.55, 0.15, 0.15], params: { kategori: 'semua', ratingMin: 4.5, jamMaks: null, anggaran: null, maksPemberhentian: 5 } },
  { kode: 'S4', judul: 'Profil "populer", 6 jam, kembali ke titik awal', asal: byName('Dewi Tinalah'),
    bobot: [0.15, 0.1, 0.3, 0.45], params: { kategori: 'semua', ratingMin: 0, jamMaks: 6, anggaran: null, maksPemberhentian: 6, pulang: true } },
];

const out = SCEN.map((s) => {
  const p = Object.assign({ kandidatRute: 10 }, s.params);
  const res = R.rekomendasi(dests, p, travelFrom(s.asal), antar, s.bobot);
  return {
    kode: s.kode, judul: s.judul, asal_id: s.asal, asal_nama: dests.find((d) => d.id === s.asal).nama, bobot: res.saw.bobot, params: p,
    n_lolos: res.saring.ok.length, n_keluar: res.saring.keluar.length,
    peringkat: res.saw.hasil.map((h) => ({ id: h.d.id, nama: h.d.nama, x: h.x, r: h.r, V: h.V })),
    rute: res.rute.pemberhentian.map((p) => p.h.d.id),
    rute_total_jam: res.rute.totalDetik / 3600, rute_biaya: res.rute.biaya,
  };
});
const dir = path.join(__dirname, 'out');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'scenarios_js.json'), JSON.stringify(out, null, 1));
out.forEach((s) => console.log(s.kode, 'lolos', s.n_lolos, 'top3', s.peringkat.slice(0, 3).map((p) => p.nama + ' ' + p.V.toFixed(4)).join(' | '), '| rute', s.rute.join('>')));
