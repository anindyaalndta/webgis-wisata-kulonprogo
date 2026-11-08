// Uji unit inti perhitungan:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rekom.js');
const { loadData } = require('./load_data.js');

const close = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

test('AHP: contoh buku Saaty 3x3 (w, lambda, CR)', () => {
  const A = [[1, 3, 5], [1 / 3, 1, 3], [1 / 5, 1 / 3, 1]];
  const r = R.ahp(A);
  close(r.w[0], 0.6370, 1e-3); close(r.w[1], 0.2583, 1e-3); close(r.w[2], 0.1047, 1e-3);
  close(r.lambdaMax, 3.0385, 1e-3);
  close(r.cr, 0.0332, 1e-3);
  assert.equal(r.konsisten, true);
});

test('AHP: matriks konsisten sempurna -> CR = 0 dan bobot proporsional', () => {
  const v = [4, 2, 1, 1];
  const A = v.map((a) => v.map((b) => a / b));
  const r = R.ahp(A);
  close(r.cr, 0, 1e-9);
  close(r.w[0], 0.5, 1e-9); close(r.w[1], 0.25, 1e-9);
});

test('AHP: matriks tidak konsisten terdeteksi (CR > 0,1)', () => {
  const A = R.matrixFromUpper(4, [9, 1 / 9, 9, 1 / 9, 9, 1 / 9]);
  const r = R.ahp(A);
  assert.ok(r.cr > 0.1);
  assert.equal(r.konsisten, false);
});

test('AHP: matrixFromUpper resiprokal & agregasi geometris', () => {
  const A = R.matrixFromUpper(3, [3, 5, 2]);
  assert.deepEqual(A[0], [1, 3, 5]);
  close(A[2][0], 1 / 5, 1e-12); close(A[2][1], 1 / 2, 1e-12);
  const G = R.aggregateGeometric([R.matrixFromUpper(2, [2]), R.matrixFromUpper(2, [8])]);
  close(G[0][1], 4, 1e-12); close(G[1][0], 0.25, 1e-12);
});

test('AHP: bobot default sistem sama dengan hasil numpy pada pipeline (config.json)', () => {
  const { w } = loadData();
  const r = R.ahp(w.CONFIG.ahp_default);
  w.CONFIG.ahp_result.w.forEach((x, i) => close(r.w[i], x, 1e-9));
  close(r.cr, w.CONFIG.ahp_result.cr, 1e-9);
  assert.ok(r.konsisten);
});

test('SAW: contoh hitung tangan 3 alternatif', () => {
  // X (waktu menit, biaya skala, rating, ln(1+ulasan))
  const mk = (id, menit, skala, rating, ulasan) => ({ d: { id, biaya_skala: skala, rating, ulasan }, travel: { dur: menit * 60 } });
  const alts = [mk(1, 10, 1, 4.0, Math.E - 1), mk(2, 20, 2, 5.0, Math.exp(2) - 1), mk(3, 40, 4, 4.5, 0)];
  const w = [0.4, 0.2, 0.3, 0.1];
  const out = R.saw(alts, w);
  const byId = Object.fromEntries(out.hasil.map((h) => [h.d.id, h]));
  // A1: r = [10/10, 1/1, 4/5, 1/2]  -> V = .4 + .2 + .24 + .05 = .89
  // A2: r = [10/20, 1/2, 5/5, 2/2]  -> V = .2 + .1 + .30 + .10 = .70
  // A3: r = [10/40, 1/4, 4.5/5, 0]  -> V = .1 + .05 + .27 + 0 = .42
  close(byId[1].V, 0.89, 1e-9); close(byId[2].V, 0.70, 1e-9); close(byId[3].V, 0.42, 1e-9);
  assert.deepEqual(out.hasil.map((h) => h.d.id), [1, 2, 3]);
  assert.deepEqual(out.hasil.map((h) => h.peringkat), [1, 2, 3]);
});

test('SAW: bobot dinormalisasi otomatis (jumlah = 1)', () => {
  const w = R.normalisasiBobot([2, 1, 1, 0]);
  close(w.reduce((a, b) => a + b, 0), 1, 1e-12);
  close(w[0], 0.5, 1e-12);
  assert.deepEqual(R.normalisasiBobot([0, 0, 0, 0]), [0.25, 0.25, 0.25, 0.25]);
});

test('SAW: nilai preferensi berada pada rentang 0..1 untuk data nyata', () => {
  const { dests, travelFrom, w } = loadData();
  const s = R.saring(dests, { kategori: 'semua', ratingMin: 0, jamMaks: null, anggaran: null }, travelFrom(dests[0].id));
  const out = R.saw(s.ok, w.CONFIG.ahp_result.w);
  out.hasil.forEach((h) => { assert.ok(h.V >= 0 && h.V <= 1 + 1e-12); h.r.forEach((x) => assert.ok(x >= 0 && x <= 1 + 1e-12)); });
});

test('Penyaringan: setiap batasan pengguna dihormati', () => {
  const { dests, travelFrom } = loadData();
  const p = { kategori: 'Wisata Alam', ratingMin: 4.5, jamMaks: 3, anggaran: 10000 };
  const s = R.saring(dests, p, travelFrom(dests[5].id));
  assert.ok(s.ok.length > 0);
  s.ok.forEach(({ d, travel }) => {
    assert.equal(d.kategori, 'Wisata Alam');
    assert.ok(d.in_scope);
    assert.ok(d.rating >= 4.5);
    assert.ok(d.biaya_rp <= 10000);
    assert.ok(travel.dur / 3600 + d.durasi_jam <= 3 + 1e-9);
  });
  assert.equal(s.ok.length + s.keluar.length, dests.length);
});

test('Kelas biaya & rating: batas kelas tepat', () => {
  assert.equal(R.kelasBiaya(0), 'gratis'); assert.equal(R.kelasBiaya(10000), 'b10'); assert.equal(R.kelasBiaya(10001), 'b25');
  assert.equal(R.kelasBiaya(50000), 'b50'); assert.equal(R.kelasBiaya(100000), 'b100'); assert.equal(R.kelasBiaya(475000), 'b100p');
  assert.equal(R.kelasRating(null), 'rna'); assert.equal(R.kelasRating(4.5), 'r45'); assert.equal(R.kelasRating(5), 'r45');
  assert.equal(R.kelasRating(4.49), 'r40'); assert.equal(R.kelasRating(3.5), 'r35'); assert.equal(R.kelasRating(2.9), 'r0');
});

test('Pilihan ganda: beberapa kategori, kelas biaya, dan kelas rating sekaligus', () => {
  const { dests, travelFrom } = loadData();
  const p = { kategori: ['Wisata Alam', 'Agrowisata'], kelasBiaya: ['gratis', 'b10'], kelasRating: ['r45', 'rna'], jamMaks: null, anggaran: null, ratingMin: 0 };
  const s = R.saring(dests, p, travelFrom(dests[0].id));
  assert.ok(s.ok.length > 0);
  s.ok.forEach(({ d }) => {
    assert.ok(['Wisata Alam', 'Agrowisata'].includes(d.kategori));
    assert.ok(d.biaya_rp <= 10000);
    assert.ok(d.rating == null || d.rating >= 4.5);
  });
  // memilih semua kelas = tanpa penyaringan
  const semua = R.saring(dests, { kategori: ['Wisata Alam', 'Wisata Alam-Buatan', 'Religi dan Budaya', 'Agrowisata', 'Akomodasi dan Rekreasi'],
    kelasBiaya: R.KELAS_BIAYA.map((k) => k.id), kelasRating: R.KELAS_RATING.map((k) => k.id), jamMaks: null, anggaran: null, ratingMin: 0 }, travelFrom(dests[0].id));
  assert.equal(semua.ok.length, dests.filter((d) => d.in_scope).length);
});

test('Penyaringan: titik di luar cakupan hanya ikut bila diminta', () => {
  const { dests, travelFrom } = loadData();
  const t = travelFrom(dests[0].id);
  const a = R.saring(dests, { kategori: 'semua', ratingMin: 0, jamMaks: null, anggaran: null }, t);
  const b = R.saring(dests, { kategori: 'semua', ratingMin: 0, jamMaks: null, anggaran: null, sertakanLuar: true }, t);
  assert.equal(a.ok.length, dests.filter((d) => d.in_scope).length);
  assert.equal(b.ok.length, dests.length);
});

test('Rute: tidak melampaui batas waktu, anggaran, dan jumlah pemberhentian', () => {
  const { dests, travelFrom, antar, w } = loadData();
  const scen = [
    { jamMaks: 4, anggaran: 20000, maksPemberhentian: 5, pulang: false },
    { jamMaks: 8, anggaran: null, maksPemberhentian: 6, pulang: true },
    { jamMaks: 2, anggaran: 0, maksPemberhentian: 3, pulang: false },
  ];
  for (const o of scen) {
    for (const origin of [dests[0].id, dests[20].id, dests[40].id]) {
      const params = Object.assign({ kategori: 'semua', ratingMin: 0, kandidatRute: 10 }, o);
      const res = R.rekomendasi(dests, params, travelFrom(origin), antar, w.CONFIG.ahp_result.w);
      const r = res.rute;
      assert.ok(r.pemberhentian.length <= o.maksPemberhentian);
      assert.ok(r.totalDetik <= o.jamMaks * 3600 + 1e-6);
      if (o.anggaran != null) assert.ok(r.biaya <= o.anggaran);
      // urutan nearest-neighbour: setiap langkah memilih kandidat layak terdekat
      const ids = new Set(r.pemberhentian.map((p) => p.h.d.id));
      assert.equal(ids.size, r.pemberhentian.length, 'tidak ada destinasi ganda');
      // semua pemberhentian berasal dari 10 peringkat teratas SAW
      const top = new Set(res.saw.hasil.slice(0, 10).map((h) => h.d.id));
      r.pemberhentian.forEach((p) => assert.ok(top.has(p.h.d.id)));
    }
  }
});

test('Rute: langkah pertama adalah kandidat terdekat dari titik awal (tanpa batasan)', () => {
  const { dests, travelFrom, antar, w } = loadData();
  const params = { kategori: 'semua', ratingMin: 0, jamMaks: null, anggaran: null, maksPemberhentian: 4, kandidatRute: 10 };
  const res = R.rekomendasi(dests, params, travelFrom(dests[10].id), antar, w.CONFIG.ahp_result.w);
  const top = res.saw.hasil.slice(0, 10);
  const nearest = top.slice().sort((a, b) => a.travel.dur - b.travel.dur)[0];
  assert.equal(res.rute.pemberhentian[0].h.d.id, nearest.d.id);
  assert.equal(res.rute.pemberhentian.length, 4);
});

test('Cadangan offline: estimasi waktu tempuh positif dan terkalibrasi', () => {
  const t = R.fallbackTravel(-7.70, 110.20, { lat: -7.75, lon: 110.13 });
  assert.ok(t.estimasi);
  assert.ok(t.dist > R.haversine(-7.70, 110.20, -7.75, 110.13));
  assert.ok(t.dur > 0);
});
