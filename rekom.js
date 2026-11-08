/*
 * rekom.js - inti perhitungan sistem rekomendasi (tanpa dependensi, dapat diuji di Node maupun browser)
 *
 *   AHP  : bobot kriteria dari matriks perbandingan berpasangan + uji konsistensi (CI, CR)
 *   SAW  : normalisasi benefit/cost, penjumlahan terbobot, pemeringkatan
 *   Rute : nearest neighbour di atas destinasi prioritas SAW dengan batas waktu & anggaran
 *
 * Rumus mengikuti Bab II proposal: (II.1) CI, (II.2) CR, (II.3a/b) normalisasi, (II.4) nilai preferensi.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rekom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- konstanta */
  var RI = { 1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49 };

  // Urutan kriteria sama dengan matriks AHP (C1..C4)
  var KRITERIA = [
    { kode: 'C1', key: 'waktu',  nama: 'Waktu tempuh',   sifat: 'cost',    satuan: 'menit' },
    { kode: 'C2', key: 'biaya',  nama: 'Biaya kunjungan', sifat: 'cost',    satuan: 'skala 1-5' },
    { kode: 'C3', key: 'rating', nama: 'Rating',          sifat: 'benefit', satuan: 'skala 1-5' },
    { kode: 'C4', key: 'ulasan', nama: 'Popularitas',     sifat: 'benefit', satuan: 'ln(1+ulasan)' }
  ];

  // Cadangan bila layanan routing tidak dapat dijangkau (dikalibrasi dari matriks OSRM: lihat docs/qa_data.json)
  var FALLBACK = { faktorJalan: 1.74, kecepatanKmh: 43.4 };

  /* ---------------------------------------------------------------- utilitas */
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371008.8, rad = Math.PI / 180;
    var p1 = lat1 * rad, p2 = lat2 * rad, dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function fallbackTravel(lat, lon, d) {
    var hv = haversine(lat, lon, d.lat, d.lon);
    var meter = hv * FALLBACK.faktorJalan;
    return { dur: meter / (FALLBACK.kecepatanKmh / 3.6), dist: meter, estimasi: true };
  }

  /* ---------------------------------------------------------------- AHP */
  // matriks resiprokal dari nilai segitiga atas (baris-demi-baris: a12,a13,...,a23,...)
  function matrixFromUpper(n, upper) {
    var A = [], k = 0, i, j;
    for (i = 0; i < n; i++) { A.push(new Array(n).fill(1)); }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) { A[i][j] = upper[k]; A[j][i] = 1 / upper[k]; k++; }
    return A;
  }

  // rata-rata geometris elemen-per-elemen untuk agregasi banyak responden
  function aggregateGeometric(mats) {
    var n = mats[0].length, m = mats.length, out = [], i, j, r;
    for (i = 0; i < n; i++) {
      out.push([]);
      for (j = 0; j < n; j++) {
        var p = 0;
        for (r = 0; r < m; r++) p += Math.log(mats[r][i][j]);
        out[i].push(Math.exp(p / m));
      }
    }
    return out;
  }

  // Vektor prioritas = eigenvector utama (metode pangkat/power iteration)
  function ahp(A) {
    var n = A.length, w = new Array(n).fill(1 / n), it, i, j, v, s, diff;
    for (it = 0; it < 5000; it++) {
      v = new Array(n).fill(0);
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) v[i] += A[i][j] * w[j];
      s = v.reduce(function (a, b) { return a + b; }, 0);
      diff = 0;
      for (i = 0; i < n; i++) { v[i] /= s; diff = Math.max(diff, Math.abs(v[i] - w[i])); }
      w = v;
      if (diff < 1e-15) break;
    }
    // lambda_max = rata-rata ((A w)_i / w_i)
    var lam = 0;
    for (i = 0; i < n; i++) {
      var aw = 0;
      for (j = 0; j < n; j++) aw += A[i][j] * w[j];
      lam += aw / w[i];
    }
    lam /= n;
    var ci = n > 1 ? (lam - n) / (n - 1) : 0;               // (II.1)
    var ri = RI[n] || 1.49;
    var cr = ri > 0 ? ci / ri : 0;                           // (II.2)
    return { w: w, lambdaMax: lam, ci: ci, ri: ri, cr: cr, konsisten: cr <= 0.10 + 1e-12, n: n };
  }

  function normalisasiBobot(w) {
    var s = w.reduce(function (a, b) { return a + (b > 0 ? b : 0); }, 0);
    if (s <= 0) return w.map(function () { return 1 / w.length; });
    return w.map(function (x) { return (x > 0 ? x : 0) / s; });
  }

  /* ---------------------------------------------------------------- penyaringan */
  /*
   * params: { kategori: 'semua'|nama, jamMaks: null|number, anggaran: null|number, ratingMin: 0|3|3.5|4|4.5,
   *           sertakanLuar: bool }
   * travel(d) -> { dur (detik), dist (meter) } waktu tempuh dari titik awal ke d
   */
  /* Kelas pilihan ganda (panduan & formulir): pengguna boleh memilih beberapa kelas sekaligus */
  var KELAS_BIAYA = [
    { id: 'gratis', label: 'Gratis', min: 0, max: 0 },
    { id: 'b10', label: 'Rp1–10 ribu', min: 1, max: 10000 },
    { id: 'b25', label: 'Rp10–25 ribu', min: 10001, max: 25000 },
    { id: 'b50', label: 'Rp25–50 ribu', min: 25001, max: 50000 },
    { id: 'b100', label: 'Rp50–100 ribu', min: 50001, max: 100000 },
    { id: 'b100p', label: '> Rp100 ribu', min: 100001, max: Infinity }
  ];
  var KELAS_RATING = [
    { id: 'r45', label: '★ 4,5 – 5,0', min: 4.5, max: 5.01 },
    { id: 'r40', label: '★ 4,0 – 4,4', min: 4.0, max: 4.5 },
    { id: 'r35', label: '★ 3,5 – 3,9', min: 3.5, max: 4.0 },
    { id: 'r30', label: '★ 3,0 – 3,4', min: 3.0, max: 3.5 },
    { id: 'r0', label: '★ di bawah 3,0', min: 0, max: 3.0 },
    { id: 'rna', label: 'Belum ada rating', min: null, max: null }
  ];
  function kelasBiaya(rp) {
    for (var i = 0; i < KELAS_BIAYA.length; i++) if (rp >= KELAS_BIAYA[i].min && rp <= KELAS_BIAYA[i].max) return KELAS_BIAYA[i].id;
    return KELAS_BIAYA[KELAS_BIAYA.length - 1].id;
  }
  function kelasRating(r) {
    if (r == null) return 'rna';
    for (var i = 0; i < KELAS_RATING.length - 1; i++) if (r >= KELAS_RATING[i].min && r < KELAS_RATING[i].max) return KELAS_RATING[i].id;
    return 'r0';
  }

  /*
   * params tambahan (pilihan ganda):
   *   kategori   : 'semua' | nama | [nama, ...]
   *   kelasBiaya : null (semua) | [id KELAS_BIAYA, ...]
   *   kelasRating: null (semua) | [id KELAS_RATING, ...]
   */
  function saring(dests, params, travel) {
    var ok = [], keluar = [];
    var katSet = Array.isArray(params.kategori) ? params.kategori : (params.kategori && params.kategori !== 'semua' ? [params.kategori] : null);
    dests.forEach(function (d) {
      var alasan = null;
      var tr = travel(d), menit = tr.dur / 60;
      if (!params.sertakanLuar && !d.in_scope) alasan = 'Di luar cakupan 3 kapanewon';
      else if (katSet && katSet.indexOf(d.kategori) < 0) alasan = 'Kategori tidak dipilih';
      else if (params.kelasRating && params.kelasRating.indexOf(kelasRating(d.rating)) < 0) alasan = d.rating == null ? 'Belum ada rating' : 'Kelas rating tidak dipilih';
      else if (params.kelasBiaya && params.kelasBiaya.indexOf(kelasBiaya(d.biaya_rp)) < 0) alasan = 'Kelas biaya tidak dipilih';
      else if (params.ratingMin > 0 && !(d.rating != null && d.rating >= params.ratingMin)) alasan = d.rating == null ? 'Belum ada rating' : 'Rating di bawah ' + params.ratingMin;
      else if (params.anggaran != null && d.biaya_rp > params.anggaran) alasan = 'Melebihi anggaran';
      else if (params.jamMaks != null) {
        var butuh = menit / 60 + d.durasi_jam + (params.pulang ? menit / 60 : 0);
        if (butuh > params.jamMaks + 1e-9) alasan = 'Waktu tidak cukup (butuh ' + butuh.toFixed(1) + ' jam)';
      }
      if (alasan) keluar.push({ d: d, alasan: alasan });
      else ok.push({ d: d, travel: tr });
    });
    return { ok: ok, keluar: keluar };
  }

  /* ---------------------------------------------------------------- SAW */
  /*
   * alts : [{ d, travel }]
   * w    : bobot [C1..C4] (akan dinormalisasi jumlahnya = 1)
   * opts : { ratingBayes: bool, bayesM: 50, ratingRata: number }
   */
  function nilaiKriteria(a, opts) {
    var d = a.d;
    var rating = d.rating == null ? 0 : d.rating;
    if (opts && opts.ratingBayes && d.rating != null) {
      var m = opts.bayesM || 50, v = d.ulasan || 0, c = opts.ratingRata || 4.4;
      rating = (v * d.rating + m * c) / (v + m);
    }
    return [
      Math.max(1, a.travel.dur / 60),                 // C1 menit (minimal 1 agar rasio cost terdefinisi)
      d.biaya_skala,                                   // C2 skala 1-5
      rating,                                          // C3
      Math.log(1 + (d.ulasan || 0))                    // C4
    ];
  }

  function saw(alts, wRaw, opts) {
    var w = normalisasiBobot(wRaw), n = KRITERIA.length, m = alts.length, i, j;
    var X = alts.map(function (a) { return nilaiKriteria(a, opts); });
    var ekstrem = [];
    for (j = 0; j < n; j++) {
      var col = X.map(function (r) { return r[j]; });
      ekstrem.push(KRITERIA[j].sifat === 'cost' ? Math.min.apply(null, col) : Math.max.apply(null, col));
    }
    var R = X.map(function (row) {
      return row.map(function (x, j) {
        if (KRITERIA[j].sifat === 'cost') return x > 0 ? ekstrem[j] / x : 0;     // (II.3b)
        return ekstrem[j] > 0 ? x / ekstrem[j] : 0;                               // (II.3a)
      });
    });
    var V = R.map(function (row) {                                                // (II.4)
      var s = 0;
      for (var j = 0; j < n; j++) s += w[j] * row[j];
      return s;
    });
    var hasil = alts.map(function (a, i) {
      return { d: a.d, travel: a.travel, x: X[i], r: R[i], kontribusi: R[i].map(function (r, j) { return w[j] * r; }), V: V[i] };
    });
    hasil.sort(function (p, q) { return q.V - p.V || (q.d.ulasan || 0) - (p.d.ulasan || 0) || p.d.id - q.d.id; });
    hasil.forEach(function (h, k) { h.peringkat = k + 1; });
    return { hasil: hasil, bobot: w, ekstrem: ekstrem };
  }

  /* ---------------------------------------------------------------- rute (nearest neighbour) */
  /*
   * pool    : hasil SAW (urut peringkat), diambil K teratas
   * antar(a,b) -> detik waktu tempuh antar-destinasi (id a -> id b)
   * opsi    : { jamMaks, anggaran, maksPemberhentian, pulang }
   */
  function susunRute(pool, antar, opsi) {
    var sisa = pool.slice(), rute = [], cur = null;
    var tTempuh = 0, tKunjung = 0, biaya = 0, maks = opsi.maksPemberhentian || 5;
    var batasDetik = opsi.jamMaks != null ? opsi.jamMaks * 3600 : Infinity;
    var anggaran = opsi.anggaran != null ? opsi.anggaran : Infinity;
    while (sisa.length && rute.length < maks) {
      var kand = sisa.map(function (h) {
        var leg = cur ? antar(cur.d.id, h.d.id) : h.travel.dur;
        return { h: h, leg: leg };
      }).sort(function (a, b) { return a.leg - b.leg || a.h.peringkat - b.h.peringkat; });
      var pilih = null;
      for (var k = 0; k < kand.length; k++) {
        var c = kand[k];
        var kembali = opsi.pulang ? c.h.travel.dur : 0;                 // pulang ke titik awal (aproksimasi simetris)
        var totalDetik = tTempuh + c.leg + (tKunjung + c.h.d.durasi_jam * 3600) + kembali;
        if (totalDetik <= batasDetik + 1e-6 && biaya + c.h.d.biaya_rp <= anggaran) { pilih = c; break; }
      }
      if (!pilih) break;
      rute.push({ h: pilih.h, leg: pilih.leg, dari: cur ? cur.d.id : null });
      tTempuh += pilih.leg; tKunjung += pilih.h.d.durasi_jam * 3600; biaya += pilih.h.d.biaya_rp;
      cur = pilih.h;
      sisa = sisa.filter(function (h) { return h !== pilih.h; });
    }
    var kembaliDetik = (opsi.pulang && rute.length) ? rute[rute.length - 1].h.travel.dur : 0;
    return {
      pemberhentian: rute, tempuhDetik: tTempuh, kembaliDetik: kembaliDetik, kunjungDetik: tKunjung,
      totalDetik: tTempuh + kembaliDetik + tKunjung, biaya: biaya
    };
  }

  /* ---------------------------------------------------------------- orkestrasi */
  function rekomendasi(dests, params, travel, antar, bobot, opts) {
    var s = saring(dests, params, travel);
    var rata = 0, n = 0;
    dests.forEach(function (d) { if (d.rating != null) { rata += d.rating; n++; } });
    var o = Object.assign({ ratingRata: n ? rata / n : 4.4 }, opts || {});
    var r = s.ok.length ? saw(s.ok, bobot, o) : { hasil: [], bobot: normalisasiBobot(bobot), ekstrem: [] };
    var K = Math.min(params.kandidatRute || 10, r.hasil.length);
    var rute = susunRute(r.hasil.slice(0, K), antar, {
      jamMaks: params.jamMaks, anggaran: params.anggaran, maksPemberhentian: params.maksPemberhentian, pulang: params.pulang
    });
    return { saring: s, saw: r, rute: rute };
  }

  return {
    RI: RI, KRITERIA: KRITERIA, FALLBACK: FALLBACK, KELAS_BIAYA: KELAS_BIAYA, KELAS_RATING: KELAS_RATING,
    kelasBiaya: kelasBiaya, kelasRating: kelasRating,
    haversine: haversine, fallbackTravel: fallbackTravel,
    matrixFromUpper: matrixFromUpper, aggregateGeometric: aggregateGeometric, ahp: ahp, normalisasiBobot: normalisasiBobot,
    saring: saring, saw: saw, nilaiKriteria: nilaiKriteria, susunRute: susunRute, rekomendasi: rekomendasi
  };
});
