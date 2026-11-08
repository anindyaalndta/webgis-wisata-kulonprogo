// Uji unit navigasi di dalam WebGIS:  node --test tests/test_navigasi.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const N = require('../js/navigasi.js');

const res = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'osrm_route.json'), 'utf8'));
const tujuan = [{ nama: 'Agrowisata Krisan Gerbosari', lat: -7.6779295, lon: 110.1728034 }, { nama: 'Desa Wisata Widosari', lat: -7.661506, lon: 110.1542691 }];
const M = N.bangunRute(res.routes[0], tujuan);

test('Teks petunjuk berbahasa Indonesia', () => {
  const st = (type, modifier, name, extra) => ({ name: name || '', maneuver: Object.assign({ type, modifier }, extra || {}) });
  assert.equal(N.teksInstruksi(st('turn', 'left', 'Jalan Raya Samigaluh Dekso')), 'Belok kiri ke Jalan Raya Samigaluh Dekso');
  assert.equal(N.teksInstruksi(st('turn', 'slight right')), 'Belok sedikit ke kanan');
  assert.equal(N.teksInstruksi(st('turn', 'uturn')), 'Putar balik');
  assert.equal(N.teksInstruksi(st('continue', 'uturn')), 'Putar balik');
  assert.equal(N.teksInstruksi(st('arrive', 'right'), 'Kedung Sowo'), 'Tiba di Kedung Sowo (di sebelah kanan)');
  assert.equal(N.teksInstruksi(st('depart', null, 'Jl. Kenteng', { bearing_after: 92 })), 'Mulai perjalanan ke arah timur melalui Jl. Kenteng');
  assert.equal(N.teksInstruksi(st('roundabout', null, '', { exit: 2 })), 'Masuk bundaran, ambil jalan keluar ke-2');
  assert.equal(N.teksInstruksi(st('end of road', 'right', 'Jl. Nanggulan')), 'Di ujung jalan, belok kanan ke Jl. Nanggulan');
});

test('Model rute: geometri, langkah, dan leg konsisten dengan respons OSRM', () => {
  assert.equal(M.leg.length, 2);
  assert.equal(M.langkah.length, res.routes[0].legs.reduce((a, l) => a + l.steps.length, 0));
  // panjang geometri hasil haversine mendekati jarak OSRM (selisih < 2%)
  assert.ok(Math.abs(M.panjangGeom - res.routes[0].distance) / res.routes[0].distance < 0.02, `${M.panjangGeom} vs ${res.routes[0].distance}`);
  // jarak kumulatif monoton naik; posisi mulai langkah tidak menurun
  for (let i = 1; i < M.cum.length; i++) assert.ok(M.cum[i] >= M.cum[i - 1]);
  for (let i = 1; i < M.langkah.length; i++) assert.ok(M.langkah[i].mulai >= M.langkah[i - 1].mulai - 1e-6);
  assert.equal(M.langkah[0].jenis, 'depart');
  assert.equal(M.langkah[M.langkah.length - 1].jenis, 'arrive');
  assert.match(M.langkah[M.langkah.length - 1].teks, /Desa Wisata Widosari/);
});

test('Posisi tepat di rute: menyimpang ≈ 0 dan jarak tempuh sesuai', () => {
  for (const f of [0.1, 0.4, 0.7, 0.95]) {
    const s = M.panjangGeom * f;
    const [lat, lon] = N.titikPadaJarak(M, s);
    const p = N.posisiPadaRute(M, lat, lon, s - 50);       // navigasi selalu membawa posisi terakhir
    assert.ok(p.d < 1, 'menyimpang ' + p.d);
    assert.ok(Math.abs(p.sepanjang - s) < 5, p.sepanjang + ' vs ' + s);
  }
});

test('Jalan pergi-pulang (tumpang tindih) tidak membuat posisi melompat mundur', () => {
  // leg 2 rute uji berbalik arah dan melewati ruas yang sama dengan leg 1
  const s = M.leg[0].tiba + 230;
  const [lat, lon] = N.titikPadaJarak(M, s);
  const p = N.posisiPadaRute(M, lat, lon, s - 40);
  assert.ok(p.sepanjang > M.leg[0].tiba, 'tetap di leg 2: ' + p.sepanjang.toFixed(0));
});

test('Langkah berikutnya & jarak ke manuver bergerak maju sepanjang perjalanan', () => {
  let lastIdx = -1, lastSisa = Infinity;
  for (let s = 0; s <= M.panjangGeom; s += 50) {
    const [lat, lon] = N.titikPadaJarak(M, s);
    const st = N.statusNavigasi(M, lat, lon, s);
    assert.ok(st.langkahIdx >= lastIdx, 'indeks langkah tidak mundur');
    assert.ok(st.sisaTotal <= lastSisa + 1e-6, 'sisa jarak tidak bertambah');
    assert.ok(st.keManuver >= 0);
    lastIdx = st.langkahIdx; lastSisa = st.sisaTotal;
  }
  const akhir = M.coords[M.coords.length - 1];
  assert.equal(N.statusNavigasi(M, akhir[0], akhir[1]).tiba, true);
});

test('Pemberhentian berikutnya berganti setelah tiba di tujuan pertama', () => {
  const [a1, o1] = N.titikPadaJarak(M, M.leg[0].tiba * 0.5);
  assert.equal(N.statusNavigasi(M, a1, o1).tujuan.nama, tujuan[0].nama);
  const [a2, o2] = N.titikPadaJarak(M, M.leg[0].tiba + (M.leg[1].tiba - M.leg[0].tiba) * 0.5);
  assert.equal(N.statusNavigasi(M, a2, o2).tujuan.nama, tujuan[1].nama);
  assert.equal(N.sisaTujuan(M, M.leg[0].tiba + 100).length, 1);
});

test('Deteksi keluar jalur: titik 200 m dari rute terukur menyimpang', () => {
  const [lat, lon] = N.titikPadaJarak(M, M.panjangGeom * 0.3);
  const geser = 200 / 111320;                         // ±200 m ke utara
  const p = N.posisiPadaRute(M, lat + geser, lon);
  assert.ok(p.d > 60, 'menyimpang ' + p.d.toFixed(1));
});

test('Simulasi rute nyata 4 pemberhentian (12 km, jalan berkelok & berbalik) mencapai tujuan akhir', () => {
  const r4 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'osrm_route_4stop.json'), 'utf8'));
  const M4 = N.bangunRute(r4.routes[0], [1, 2, 3, 4].map((i) => ({ nama: 'T' + i })));
  let s = 0, legTerlihat = new Set();
  for (let sim = 0; sim <= M4.panjangGeom; sim += 35) {
    const [lat, lon] = N.titikPadaJarak(M4, sim);
    const st = N.statusNavigasi(M4, lat, lon, s);
    assert.ok(st.menyimpang < 5, 'titik simulasi berada di rute');
    assert.ok(Math.abs(st.sepanjang - sim) < 60, `pelacakan tidak tertinggal: ${st.sepanjang.toFixed(0)} vs ${sim}`);
    s = st.sepanjang; legTerlihat.add(st.legIdx);
  }
  const akhir = M4.coords[M4.coords.length - 1];
  assert.equal(N.statusNavigasi(M4, akhir[0], akhir[1], s).tiba, true);
  assert.equal(legTerlihat.size, 4, 'keempat pemberhentian dilalui berurutan');
});