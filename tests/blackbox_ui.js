/*
 * Uji black-box antarmuka (dijalankan di peramban pada halaman WebGIS).
 * Cara pakai: buka http://localhost:8080/?uji lalu jalankan di Console:
 *    var s=document.createElement('script'); s.src='tests/blackbox_ui.js'; document.body.appendChild(s);
 * Hasil tampil di console (console.table) dan tersimpan di window.HASIL_UJI.
 */
(async function () {
  var $ = function (id) { return document.getElementById(id); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var waitFor = async function (fn, ms) { var t0 = Date.now(); while (Date.now() - t0 < (ms || 15000)) { if (fn()) return true; await sleep(100); } return false; };
  var tab = function (n) { document.querySelector('[data-tab=' + n + ']').click(); };
  var set = function (id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
  var check = function (id, v) { var e = $(id); if (e.checked !== v) e.click(); };
  // pilihan ganda pada formulir manual: ids = null (semua) | [] (kosong) | [id, ...]
  var pilihManual = function (box, ids) {
    var all = function () { return document.querySelector('#' + box + ' [data-all]'); };
    if (!all().classList.contains('on')) all().click();          // pilih semua
    if (ids === null) return;
    all().click();                                                 // kosongkan
    ids.forEach(function (id) { document.querySelector('#' + box + ' [data-id="' + id + '"]').click(); });
  };
  var catTags = function () { return rankItems().map(function (li) { return li.querySelector('.cat-tag').textContent; }); };
  var listN = function () { return document.querySelectorAll('#dlist li[data-id]').length; };
  var markerN = function () { return document.querySelectorAll('.leaflet-marker-pane .mk').length; };
  var rankItems = function () { return Array.from(document.querySelectorAll('#rankList li[data-id]')); };
  var resetForm = function () {
    $('manualWrap').open = true;
    pilihManual('rKat', null); pilihManual('rBiaya', null); pilihManual('rRating', null); check('jamFree', false);
    set('jam', 6); check('pulang', false); check('sertakanLuar', false); check('bayes', false);
    document.querySelector('#presetsW [data-w=ahp]').click();
  };
  var cari = async function () {
    var before = window.__hasilVer = (window.__hasilVer || 0) + 1;
    $('hasilRingkas').dataset.v = '';
    $('btnCari').click();
    await sleep(150);
    await waitFor(function () { return !$('btnCari').disabled; }, 20000);
    await sleep(150);
    return before;
  };
  var H = [];
  async function uji(no, fitur, skenario, harapan, fn) {
    var hasil, ok;
    try { hasil = await fn(); ok = !!hasil.ok; } catch (e) { ok = false; hasil = { info: 'ERROR ' + e.message }; }
    H.push({ No: no, Fitur: fitur, Skenario: skenario, Harapan: harapan, Hasil: hasil.info, Status: ok ? 'Sesuai' : 'Tidak sesuai' });
  }

  var no = 0;
  var N = function () { return ++no; };
  var PERTANYAAN = [
    'Dari mana Anda akan memulai perjalanan?', 'Jenis wisata apa yang ingin Anda kunjungi?',
    'Berapa lama waktu yang Anda miliki untuk berwisata termasuk perjalanan?', 'Berapa anggaran maksimum yang ingin Anda keluarkan?',
    'Berapa rating minimum destinasi wisata yang Anda inginkan?'
  ];

  /* ---------------- Panduan awal (5 pertanyaan) */
  await uji(N(), 'Panduan awal', 'Membuka halaman utama', 'Panduan tampil lebih dulu dengan pertanyaan 1; tombol "Lanjut" nonaktif sebelum lokasi diisi', async function () {
    await sleep(300);
    var open = !$('wizard').hidden, q = $('wzQ').textContent, dis = $('wzNext').disabled;
    return { ok: open && q === PERTANYAAN[0] && dis, info: 'Panduan terbuka; "' + q + '"; Lanjut nonaktif = ' + dis };
  });
  await uji(N(), 'Validasi input', 'Klik "Cari Rekomendasi" (formulir manual) tanpa lokasi awal', 'Sistem menolak dan meminta lokasi awal', async function () {
    $('btnCari').click(); await sleep(200);
    return { ok: /lokasi awal/i.test($('toast').textContent) && $('hasil').hidden, info: 'Pesan: "' + $('toast').textContent + '"' };
  });
  await uji(N(), 'Panduan – lokasi', 'Klik titik pada peta mini panduan', 'Titik awal terisi dan tombol "Lanjut" aktif', async function () {
    await sleep(300);
    var m = $('wzMap'), r = m.getBoundingClientRect();
    var ev = { bubbles: true, cancelable: true, clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.45, button: 0 };
    m.dispatchEvent(new MouseEvent('mousedown', ev)); m.dispatchEvent(new MouseEvent('mouseup', ev)); m.dispatchEvent(new MouseEvent('click', ev));
    await sleep(150);
    var t = $('wzOrigin').textContent;
    return { ok: /Titik pilihan pada peta/.test(t) && !$('wzNext').disabled, info: t };
  });
  await uji(N(), 'Panduan – lokasi', 'Klik pilihan cepat "Gerbosari"', 'Titik awal = Gerbosari', async function () {
    document.querySelector('[data-wpreset=gerbosari]').click(); await sleep(100);
    return { ok: /Gerbosari/.test($('wzOrigin').textContent), info: $('wzOrigin').textContent };
  });
  await uji(N(), 'Panduan – urutan pertanyaan', 'Tekan "Lanjut" pada setiap langkah', 'Pertanyaan 2–5 tampil berurutan dengan teks yang ditetapkan', async function () {
    var got = [], kunci = [];
    var klik = function (box, id) { document.querySelector('#' + box + ' [data-id="' + id + '"]').click(); };
    for (var i = 1; i <= 4; i++) {
      $('wzNext').click(); await sleep(80);
      got.push($('wzQ').textContent);
      if (i === 1) { kunci.push($('wzNext').disabled); klik('wzKat', 'Religi dan Budaya'); klik('wzKat', 'Wisata Alam'); }
      if (i === 2) Array.from(document.querySelectorAll('#wzJam .wz-opt')).find(function (b) { return /4 jam/.test(b.textContent); }).click();
      if (i === 3) { kunci.push($('wzNext').disabled); klik('wzAng', 'gratis'); klik('wzAng', 'b10'); }
      if (i === 4) { kunci.push($('wzNext').disabled); klik('wzRating', 'r45'); klik('wzRating', 'r40'); }
    }
    var ok = got.every(function (q, k) { return q === PERTANYAAN[k + 1]; }) && kunci.every(Boolean) && !$('wzNext').disabled;
    return { ok: ok, info: got.map(function (q, k) { return (k + 2) + ') ' + q; }).join(' | ') + '; Lanjut terkunci sebelum memilih = ' + kunci.join('/') };
  });
  await uji(N(), 'Panduan – pilihan ganda', 'Pada pertanyaan rating, klik "Pilih semua" lalu klik lagi', 'Semua kelas tercentang, lalu semua terhapus dan tombol Lanjut terkunci', async function () {
    var all = document.querySelector('#wzRating [data-all]');
    var awal = Array.from(document.querySelectorAll('#wzRating [data-id].on')).map(function (b) { return b.dataset.id; });
    if (all.classList.contains('on')) all.click();
    all.click(); await sleep(30);
    var nSemua = document.querySelectorAll('#wzRating [data-id].on').length, total = document.querySelectorAll('#wzRating [data-id]').length;
    all.click(); await sleep(30);
    var nKosong = document.querySelectorAll('#wzRating [data-id].on').length, terkunci = $('wzNext').disabled;
    awal.forEach(function (id) { document.querySelector('#wzRating [data-id="' + id + '"]').click(); });
    return { ok: nSemua === total && nKosong === 0 && terkunci && !$('wzNext').disabled, info: 'Pilih semua: ' + nSemua + '/' + total + '; dikosongkan: ' + nKosong + ' (Lanjut terkunci); pilihan semula dipulihkan' };
  });
  await uji(N(), 'Panduan – ringkasan', 'Tekan "Lanjut" setelah pertanyaan 5', 'Ringkasan memuat 5 jawaban (termasuk pilihan ganda) beserta tautan "ubah"', async function () {
    $('wzNext').click(); await sleep(100);
    var rows = document.querySelectorAll('#wzSummary div').length, t = $('wzSummary').textContent;
    var ok = rows === 5 && /Gerbosari/.test(t) && /Wisata Alam/.test(t) && /Religi dan Budaya/.test(t) && /4 jam/.test(t) && /Gratis/.test(t) && /Rp1–10 ribu/.test(t) && /4,5/.test(t) && /4,0/.test(t);
    return { ok: ok && document.querySelectorAll('#wzSummary [data-go]').length === 5, info: rows + ' jawaban: ' + t.replace(/ubah/g, '').replace(/\s+/g, ' ').slice(0, 170) };
  });
  await uji(N(), 'Panduan – hasil', 'Tekan "Tampilkan Rekomendasi"', 'Panduan tertutup; semua hasil sesuai pilihan (Alam/Religi, biaya ≤ Rp10.000, rating ≥ 4,0)', async function () {
    $('wzNext').click();
    await waitFor(function () { return !$('hasil').hidden && !$('btnCari').disabled && document.querySelectorAll('#rankList li[data-id]').length > 0; }, 20000);
    await sleep(300);
    var ok = $('wizard').hidden && rankItems().length > 0 && rankItems().every(function (li) {
      var cat = li.querySelector('.cat-tag').textContent, f = li.querySelector('.facts').textContent;
      var rt = f.match(/★ (\d,\d)/), by = f.match(/Rp([\d.]+)/);
      return /Wisata Alam|Religi dan Budaya/.test(cat) && (!by || +by[1].replace(/\./g, '') <= 10000) && rt && parseFloat(rt[1].replace(',', '.')) >= 4.0;
    });
    var kc = $('kriteriaList').textContent;
    return { ok: ok && /Religi dan Budaya/.test(kc) && /Wisata Alam/.test(kc), info: rankItems().length + ' hasil teratas, seluruhnya sesuai pilihan; ' + $('hasilRingkas').textContent.split('.')[0] };
  });
  await uji(N(), 'Ubah preferensi', 'Klik tombol "Ubah preferensi" di header', 'Panduan terbuka kembali dengan titik awal tersimpan', async function () {
    $('btnWizard').click(); await sleep(200);
    var ok = !$('wizard').hidden && /Gerbosari/.test($('wzOrigin').textContent) && $('wzQ').textContent === PERTANYAAN[0];
    $('wzSkip').click(); await sleep(100);
    return { ok: ok && $('wizard').hidden, info: 'Panduan terbuka, lokasi tersimpan; "Lewati" menutup panduan' };
  });

  /* ---------------- Peta & jelajah */
  tab('jelajah');
  await uji(N(), 'Peta & data', 'Membuka halaman utama', 'Peta, batas 3 kapanewon, dan 70 destinasi dalam cakupan tampil', async function () {
    await sleep(300);
    var n = markerN(), lbl = document.querySelectorAll('.lbl-kec').length;
    return { ok: n === 70 && listN() === 70 && lbl === 3, info: n + ' marker, ' + listN() + ' item daftar, ' + lbl + ' label kapanewon' };
  });
  await uji(N(), 'Pencarian', 'Ketik "mudal" pada kolom cari', 'Hanya destinasi yang namanya memuat "mudal"', async function () {
    set('q', 'mudal'); await sleep(100);
    var names = Array.from(document.querySelectorAll('#dlist .t')).map(function (e) { return e.textContent; });
    set('q', '');
    return { ok: names.length >= 1 && names.every(function (n) { return /mudal/i.test(n); }), info: names.join('; ') };
  });
  await uji(N(), 'Filter kategori', 'Klik chip "Religi dan Budaya"', 'Daftar & peta hanya menampilkan kategori Religi dan Budaya', async function () {
    var chip = Array.from(document.querySelectorAll('#katChips .chip')).find(function (c) { return /Religi/.test(c.textContent); });
    chip.click(); await sleep(100);
    var n = listN(), m = markerN();
    chip = Array.from(document.querySelectorAll('#katChips .chip')).find(function (c) { return /Religi/.test(c.textContent); });
    chip.click(); await sleep(50);                 // kembali ke semua (klik ke-2 menonaktifkan -> set kosong -> semua)
    if (listN() !== 70) { Array.from(document.querySelectorAll('#katChips .chip.off')).forEach(function (c) { c.click(); }); }
    return { ok: n === 8 && m === 8, info: n + ' item, ' + m + ' marker (setelah reset: ' + listN() + ')' };
  });
  await uji(N(), 'Filter kapanewon', 'Pilih kapanewon Girimulyo', 'Hanya destinasi di Girimulyo (19)', async function () {
    set('fKec', 'Girimulyo'); await sleep(100);
    var subs = Array.from(document.querySelectorAll('#dlist .s')).map(function (e) { return e.textContent; });
    var n = listN(); set('fKec', 'semua');
    return { ok: n === 19 && subs.every(function (s) { return /Girimulyo/.test(s); }), info: n + ' item, semua di Girimulyo' };
  });
  await uji(N(), 'Objek sekitar', 'Centang "Tampilkan objek di sekitar wilayah kajian"', 'Objek di luar 3 kapanewon ikut tampil (83 total) dan diberi label', async function () {
    check('fLuar', true); await sleep(100);
    var n = listN(), tags = document.querySelectorAll('#dlist .tag.warn').length;
    check('fLuar', false); await sleep(50);
    return { ok: n === 83 && tags === 13, info: n + ' item, ' + tags + ' berlabel "luar cakupan"' };
  });
  await uji(N(), 'Detail destinasi', 'Klik destinasi pada daftar lalu tombol "Detail" pada pop-up', 'Jendela detail menampilkan deskripsi, lokasi, harga, jam, koordinat', async function () {
    document.querySelector('#dlist li[data-id]').click();
    await waitFor(function () { return document.querySelector('.leaflet-popup [data-act=detail]'); }, 4000);
    document.querySelector('.leaflet-popup [data-act=detail]').click(); await sleep(150);
    var txt = $('modalBody').textContent, open = !$('modal').hidden;
    var ok = open && /Koordinat/.test(txt) && /Harga tiket/.test(txt) && /Jam operasional/.test(txt);
    var t = $('modalTitle').textContent; $('modalClose').click();
    return { ok: ok, info: 'Modal "' + t + '" terbuka dengan atribut lengkap' };
  });
  await uji(N(), 'Lapisan peta', 'Buka kontrol lapisan', 'Tersedia 3 peta dasar dan 6 lapisan tematik', async function () {
    var base = document.querySelectorAll('.leaflet-control-layers-base input').length, ov = document.querySelectorAll('.leaflet-control-layers-overlays input').length;
    return { ok: base === 3 && ov === 6, info: base + ' peta dasar, ' + ov + ' lapisan tematik' };
  });

  /* ---------------- Rekomendasi */
  tab('rekom'); resetForm();
  await uji(N(), 'Lokasi awal', 'Formulir manual: mode "Pilih pada peta" lalu klik peta', 'Titik awal terisi koordinat hasil klik', async function () {
    $('btnPick').click(); await sleep(100);
    var r = $('map').getBoundingClientRect();
    var ev = { bubbles: true, cancelable: true, clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.5, button: 0 };
    $('map').dispatchEvent(new MouseEvent('mousedown', ev)); $('map').dispatchEvent(new MouseEvent('mouseup', ev)); $('map').dispatchEvent(new MouseEvent('click', ev));
    await sleep(150);
    var t = $('originInfo').textContent;
    return { ok: /Titik pilihan pada peta/.test(t) && $('pickHint').hidden, info: t };
  });
  await uji(N(), 'Lokasi awal', 'Klik contoh "Gerbosari"', 'Titik awal = Gerbosari (-7,66988; 110,16625)', async function () {
    document.querySelector('[data-preset=gerbosari]').click(); await sleep(100);
    window.__originSet = true;
    var t = $('originInfo').textContent;
    return { ok: /Gerbosari/.test(t) && /-7\.66988/.test(t), info: t };
  });
  await uji(N(), 'Rekomendasi SAW', 'Cari dengan semua kategori, 6 jam, Rp50.000', 'Peringkat tampil terurut menurun berdasarkan V; waktu tempuh dari OSRM', async function () {
    await cari();
    var v = rankItems().map(function (li) { return parseFloat(li.querySelector('.sc').textContent.replace(',', '.')); });
    var sorted = v.every(function (x, i) { return i === 0 || v[i - 1] >= x; });
    return { ok: !$('hasil').hidden && v.length === 10 && sorted, info: $('hasilRingkas').textContent + ' Top-10 terurut: ' + sorted };
  });
  await uji(N(), 'Rute kunjungan', 'Buka sub-tab "Rute kunjungan"', 'Urutan kunjungan, waktu tiap ruas, total waktu ≤ 6 jam, garis rute pada peta', async function () {
    document.querySelector('[data-sub=rute]').click();
    await waitFor(function () { return document.querySelectorAll('.leaflet-rute-pane path, .leaflet-pane.leaflet-rute-pane path').length > 0; }, 8000);
    var stops = document.querySelectorAll('#ruteBox .timeline .pin:not(.o)').length;
    var total = $('ruteBox').querySelector('.rute-sum div:nth-child(2) b').textContent;
    var lines = document.querySelectorAll('.leaflet-rute-pane path').length;
    var gm = $('ruteBox').querySelector('a[href*="google.com/maps"]');
    return { ok: stops >= 1 && lines >= 1 && !gm, info: stops + ' pemberhentian, total ' + total + ', ' + lines + ' garis rute; tanpa tautan Google Maps' };
  });
  await uji(N(), 'Petunjuk arah', 'Tunggu daftar petunjuk arah pada sub-tab Rute', 'Petunjuk belok-demi-belok berbahasa Indonesia per pemberhentian; tombol navigasi aktif', async function () {
    await waitFor(function () { return document.querySelectorAll('#ruteSteps li[data-i]').length > 0; }, 20000);
    var n = document.querySelectorAll('#ruteSteps li[data-i]').length, legs = document.querySelectorAll('#ruteSteps .steps-leg').length;
    var t = Array.from(document.querySelectorAll('#ruteSteps .st-tx')).map(function (e) { return e.textContent; });
    var indo = t.some(function (x) { return /^Belok (kiri|kanan)/.test(x); }) && t.some(function (x) { return /^Tiba di/.test(x); });
    return { ok: n > 3 && legs >= 1 && indo && !$('btnNav').disabled && !$('btnSim').disabled, info: n + ' langkah dalam ' + legs + ' bagian; contoh: "' + t[1] + '"' };
  });
  await uji(N(), 'Navigasi di WebGIS', 'Klik "Simulasi perjalanan"', 'Banner navigasi menampilkan jarak ke manuver, petunjuk, dan sisa jarak; posisi bergerak di peta', async function () {
    $('btnSim').click();
    await waitFor(function () { return /\d/.test($('nbDist').textContent) && $('nbInstr').textContent.length > 0; }, 8000);
    var d1 = $('nbSub').textContent; await sleep(1500); var d2 = $('nbSub').textContent;
    var me = !!document.querySelector('.mk-me');
    return { ok: !$('navBanner').hidden && me && d1 !== d2, info: '"' + $('nbDist').textContent + ' – ' + $('nbInstr').textContent + '"; ' + d2 };
  });
  await uji(N(), 'Navigasi di WebGIS', 'Klik "Akhiri navigasi"', 'Banner tertutup dan penanda posisi dihapus', async function () {
    $('nbStop').click(); await sleep(100);
    document.querySelector('[data-sub=rank]').click();
    return { ok: $('navBanner').hidden && !document.querySelector('.mk-me'), info: 'Navigasi dihentikan' };
  });
  await uji(N(), 'Penyaringan kategori', 'Formulir manual: pilih "Religi dan Budaya" + "Agrowisata" lalu cari', 'Semua hasil berkategori Religi dan Budaya atau Agrowisata', async function () {
    pilihManual('rKat', ['Religi dan Budaya', 'Agrowisata']); await cari();
    var cats = catTags();
    pilihManual('rKat', null);
    return { ok: cats.length > 0 && cats.every(function (c) { return /Religi dan Budaya|Agrowisata/.test(c); }) && cats.some(function (c) { return /Agrowisata/.test(c); }),
      info: cats.length + ' hasil: ' + cats.filter(function (c) { return /Religi/.test(c); }).length + ' Religi dan Budaya, ' + cats.filter(function (c) { return /Agro/.test(c); }).length + ' Agrowisata' };
  });
  await uji(N(), 'Penyaringan biaya', 'Formulir manual: pilih kelas "Gratis" saja lalu cari', 'Hanya destinasi gratis', async function () {
    pilihManual('rBiaya', ['gratis']); await cari();
    var f = rankItems().map(function (li) { return li.querySelector('.facts').textContent; });
    pilihManual('rBiaya', null);
    return { ok: f.length > 0 && f.every(function (c) { return /Gratis/.test(c); }), info: f.length + ' hasil teratas, seluruhnya gratis' };
  });
  await uji(N(), 'Penyaringan rating', 'Formulir manual: pilih kelas "★ 4,5 – 5,0" saja lalu cari', 'Semua hasil memiliki rating ≥ 4,5', async function () {
    pilihManual('rRating', ['r45']); await cari();
    var r = rankItems().map(function (li) { var m = li.querySelector('.facts').textContent.match(/★ (\d,\d)/); return m ? parseFloat(m[1].replace(',', '.')) : 0; });
    pilihManual('rRating', null);
    return { ok: r.length > 0 && r.every(function (x) { return x >= 4.5; }), info: 'rating hasil: ' + r.join(', ') };
  });
  await uji(N(), 'Validasi input', 'Kosongkan semua jenis wisata lalu cari', 'Sistem menolak: minimal satu jenis wisata', async function () {
    pilihManual('rKat', []); $('btnCari').click(); await sleep(200);
    var t = $('toast').textContent; pilihManual('rKat', null);
    return { ok: /minimal satu jenis wisata/i.test(t), info: 'Pesan: "' + t + '"' };
  });
  await uji(N(), 'Penyaringan waktu', 'Waktu 1,5 jam lalu cari', 'Total waktu rute ≤ 1,5 jam', async function () {
    set('jam', 1.5); await cari();
    document.querySelector('[data-sub=rute]').click();
    var box = $('ruteBox').textContent;
    var stops = document.querySelectorAll('#ruteBox .timeline .pin:not(.o)').length;
    var hint = ($('ruteBox').querySelector('.hint') || {}).textContent || '';
    document.querySelector('[data-sub=rank]').click(); set('jam', 6);
    return { ok: stops >= 1 && /Sisa waktu dari 1,5 jam/.test(hint), info: stops + ' pemberhentian; ' + hint.split('.')[0] };
  });
  await uji(N(), 'Validasi input', 'Isi waktu 0 jam lalu cari', 'Sistem menolak dengan pesan kesalahan', async function () {
    set('jam', 0); $('btnCari').click(); await sleep(200);
    var t = $('toast').textContent; set('jam', 6);
    return { ok: /waktu tersedia/i.test(t), info: 'Pesan: "' + t + '"' };
  });
  await uji(N(), 'Bobot kriteria', 'Pilih profil "Hemat"', 'Bobot berubah dan jumlahnya 100%', async function () {
    $('adv').open = true;
    document.querySelector('#presetsW [data-w=hemat]').click(); await sleep(50);
    var o = [0, 1, 2, 3].map(function (j) { return parseFloat($('wo' + j).textContent.replace(',', '.')); });
    var s = o.reduce(function (a, b) { return a + b; }, 0);
    document.querySelector('#presetsW [data-w=ahp]').click();
    return { ok: Math.abs(s - 100) < 0.2 && o[1] > o[0], info: 'bobot: ' + o.join('% / ') + '% (jumlah ' + s.toFixed(1) + '%)' };
  });
  await uji(N(), 'Transparansi SAW', 'Klik "Lihat perhitungan SAW"', 'Tabel matriks X, R, dan V seluruh alternatif tampil', async function () {
    await cari();
    $('btnCalc').click(); await sleep(150);
    var rows = $('modalBody').querySelectorAll('table.small tr').length - 2;
    var n = parseInt($('hasilRingkas').textContent, 10);
    $('modalClose').click();
    return { ok: rows === n, info: rows + ' baris perhitungan = ' + n + ' alternatif' };
  });
  await uji(N(), 'Transparansi penyaringan', 'Klik "Destinasi tersaring"', 'Daftar destinasi yang dikeluarkan beserta alasannya', async function () {
    $('btnExcl').click(); await sleep(150);
    var rows = $('modalBody').querySelectorAll('table tr').length - 1;
    var n = parseInt($('hasilRingkas').textContent, 10);
    $('modalClose').click();
    return { ok: rows === 83 - n, info: rows + ' destinasi tersaring (83 − ' + n + ')' };
  });

  /* ---------------- Metode AHP */
  tab('metode');
  await uji(N(), 'Kalkulator AHP', 'Matriks bawaan', 'Bobot, λmaks, CI, CR tampil; CR ≤ 0,10 → konsisten', async function () {
    var t = $('ahpOut').textContent;
    var bs = Array.from($('ahpOut').querySelectorAll(':scope > div > b')).map(function (b) { return b.textContent; });
    return { ok: /konsisten/.test(t) && !/tidak konsisten/.test(t) && !$('ahpApply').disabled, info: 'λmaks ' + bs[0] + '; CI ' + bs[1] + '; RI ' + bs[2] + '; CR ' + bs[3] + ' → konsisten; tombol "Pakai" aktif' };
  });
  await uji(N(), 'Kalkulator AHP', 'Ubah perbandingan menjadi tidak konsisten (C1≫C2, C2≫C3, C3≫C1)', 'CR > 0,10 terdeteksi, tombol "Pakai" dinonaktifkan', async function () {
    var sel = $('ahpPairs').querySelectorAll('select');
    var setSel = function (k, v) { sel[k].value = String(v); sel[k].dispatchEvent(new Event('change')); };
    setSel(0, 9); setSel(3, 9); setSel(1, 1 / 9);
    await sleep(50);
    var t = $('ahpOut').textContent, dis = $('ahpApply').disabled;
    $('ahpReset').click();
    return { ok: /tidak konsisten/.test(t) && dis, info: 'CR terdeteksi tidak konsisten; tombol nonaktif = ' + dis };
  });

  /* ---------------- Data */
  tab('data');
  await uji(N(), 'Rekap & mutu data', 'Buka tab Data & Mutu', 'Tabel rekap kategori × kapanewon (total 70) dan ringkasan QA tampil', async function () {
    var t = $('tblRekap').textContent, q = $('qaBox').querySelectorAll('.q').length;
    return { ok: /70/.test(t) && q === 4 && $('tblData').querySelectorAll('tr').length === 84, info: 'rekap total 70, ' + q + ' kartu QA, 83 baris atribut' };
  });
  tab('jelajah');

  window.HASIL_UJI = H;
  console.table(H);
  var lulus = H.filter(function (h) { return h.Status === 'Sesuai'; }).length;
  console.log('LULUS ' + lulus + '/' + H.length);
  window.HASIL_UJI_RINGKAS = 'LULUS ' + lulus + '/' + H.length;
})();
