/*
 * navigasi.js - navigasi belok-demi-belok di dalam WebGIS (tanpa Google Maps)
 *
 *   - bangunRute(osrmRoute, tujuan) : model rute dari respons OSRM (steps=true, geometries=geojson)
 *   - teksInstruksi(step, namaTujuan) : petunjuk berbahasa Indonesia
 *   - posisiPadaRute(model, lat, lon) : proyeksi posisi GPS ke garis rute (jarak menyimpang & jarak tempuh)
 *   - statusNavigasi(model, lat, lon) : langkah berikutnya, jarak ke manuver, sisa jarak, pemberhentian berikutnya
 *
 * Tanpa dependensi; dapat diuji di Node (tests/test_navigasi.js) maupun dipakai di peramban.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Navigasi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var R = 6371008.8, RAD = Math.PI / 180;

  function haversine(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * RAD, p2 = lat2 * RAD, dp = (lat2 - lat1) * RAD, dl = (lon2 - lon1) * RAD;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  var ARAH = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'];
  function arahMataAngin(bearing) { return ARAH[Math.round(((bearing % 360) + 360) % 360 / 45) % 8]; }

  var MOD = {
    'left': 'kiri', 'right': 'kanan', 'slight left': 'sedikit ke kiri', 'slight right': 'sedikit ke kanan',
    'sharp left': 'tajam ke kiri', 'sharp right': 'tajam ke kanan', 'straight': 'lurus', 'uturn': 'putar balik'
  };

  /* ------------------------------------------------------------ teks petunjuk */
  function teksInstruksi(step, namaTujuan) {
    var m = step.maneuver || {}, type = m.type, mod = m.modifier, nm = (step.name || '').trim();
    var arah = MOD[mod] || '';
    var keJalan = nm ? ' ke ' + nm : '';
    switch (type) {
      case 'depart':
        return 'Mulai perjalanan ke arah ' + arahMataAngin(m.bearing_after || 0) + (nm ? ' melalui ' + nm : '');
      case 'arrive':
        return 'Tiba di ' + (namaTujuan || 'tujuan') + (mod === 'left' || mod === 'slight left' ? ' (di sebelah kiri)' : mod === 'right' || mod === 'slight right' ? ' (di sebelah kanan)' : '');
      case 'turn':
        if (mod === 'straight') return 'Lurus' + (nm ? ' di ' + nm : '');
        if (mod === 'uturn') return 'Putar balik' + (nm ? ' di ' + nm : '');
        return 'Belok ' + arah + keJalan;
      case 'new name':
      case 'continue':
        if (mod === 'uturn') return 'Putar balik' + (nm ? ' di ' + nm : '');
        return (mod && mod !== 'straight' ? 'Tetap ' + arah : 'Lanjutkan lurus') + (nm ? ' di ' + nm : '');
      case 'merge':
        return 'Bergabung' + (arah ? ' ' + arah : '') + keJalan;
      case 'on ramp':
      case 'off ramp':
        return 'Ambil jalur' + (arah ? ' ' + arah : '') + keJalan;
      case 'fork':
        return 'Ambil percabangan' + (arah ? ' ' + arah : '') + keJalan;
      case 'end of road':
        return 'Di ujung jalan, belok ' + (arah || 'mengikuti jalan') + keJalan;
      case 'roundabout':
      case 'rotary':
      case 'roundabout turn':
        return 'Masuk bundaran' + (m.exit ? ', ambil jalan keluar ke-' + m.exit : '') + keJalan;
      case 'exit roundabout':
      case 'exit rotary':
        return 'Keluar dari bundaran' + keJalan;
      default:
        return 'Lanjutkan' + (nm ? ' di ' + nm : '');
    }
  }

  // kunci ikon manuver (dipetakan ke panah oleh antarmuka)
  function ikonManuver(step) {
    var m = step.maneuver || {};
    if (m.type === 'depart') return 'depart';
    if (m.type === 'arrive') return 'arrive';
    if (/roundabout|rotary/.test(m.type)) return 'roundabout';
    var mod = m.modifier || 'straight';
    return { 'left': 'left', 'right': 'right', 'slight left': 'slight-left', 'slight right': 'slight-right', 'sharp left': 'sharp-left', 'sharp right': 'sharp-right', 'uturn': 'uturn' }[mod] || 'straight';
  }

  /* ------------------------------------------------------------ model rute */
  /*
   * osrmRoute : routes[0] dari OSRM /route ...?steps=true&geometries=geojson&overview=full
   * tujuan    : [{ nama, lat, lon }] satu per leg (urutan pemberhentian)
   */
  function bangunRute(osrmRoute, tujuan) {
    var coords = [], cum = [0], langkah = [], leg = [];
    osrmRoute.legs.forEach(function (lg, li) {
      lg.steps.forEach(function (st) {
        var g = (st.geometry && st.geometry.coordinates) || [];
        var startIdx = coords.length ? coords.length - 1 : 0;
        g.forEach(function (c, k) {
          var lat = c[1], lon = c[0];
          if (coords.length && k === 0) {
            var last = coords[coords.length - 1];
            if (Math.abs(last[0] - lat) < 1e-9 && Math.abs(last[1] - lon) < 1e-9) return;   // titik sambungan ganda
          }
          if (coords.length) { var p = coords[coords.length - 1]; cum.push(cum[cum.length - 1] + haversine(p[0], p[1], lat, lon)); }
          coords.push([lat, lon]);
        });
        if (!coords.length) return;
        var nama = (tujuan[li] && tujuan[li].nama) || 'tujuan';
        langkah.push({
          leg: li, teks: teksInstruksi(st, nama), ikon: ikonManuver(st), jenis: st.maneuver.type,
          lokasi: [st.maneuver.location[1], st.maneuver.location[0]], jarak: st.distance, durasi: st.duration,
          mulai: cum[startIdx]
        });
      });
      leg.push({ nama: (tujuan[li] && tujuan[li].nama) || 'tujuan', tiba: cum[cum.length - 1], jarak: lg.distance, durasi: lg.duration,
                 lat: tujuan[li] && tujuan[li].lat, lon: tujuan[li] && tujuan[li].lon });
    });
    var total = cum[cum.length - 1];
    return { coords: coords, cum: cum, langkah: langkah, leg: leg, jarak: osrmRoute.distance, durasi: osrmRoute.duration, panjangGeom: total };
  }

  /* ------------------------------------------------------------ proyeksi posisi */
  // proyeksi lokal (ekuirektangular) cukup teliti untuk ruas pendek (< beberapa km)
  function proyeksiKeRuas(lat, lon, a, b) {
    var k = Math.cos(lat * RAD), x = lon * k, y = lat;
    var ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0];
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    var plat = ay + t * dy, plon = (ax + t * dx) / k;
    return { t: t, lat: plat, lon: plon, d: haversine(lat, lon, plat, plon) };
  }

  /*
   * mulaiDari : jarak tempuh terakhir (meter) — pencarian diutamakan di sekitarnya agar tidak "melompat"
   *             ke ruas lain yang kebetulan dekat (jalan berkelok/bolak-balik)
   */
  function posisiPadaRute(model, lat, lon, mulaiDari) {
    var c = model.coords, best = null;
    var lo = 0, hi = c.length - 1;
    if (mulaiDari != null) {
      // batasi ke jendela -300 m .. +3 km dari posisi terakhir
      while (lo < hi && model.cum[lo + 1] < mulaiDari - 300) lo++;
      var j = lo; while (j < hi && model.cum[j] < mulaiDari + 3000) j++;
      hi = Math.max(lo + 1, j);
    }
    var kand = [];
    for (var i = lo; i < Math.min(hi, c.length - 1); i++) {
      var p = proyeksiKeRuas(lat, lon, c[i], c[i + 1]);
      var cand = { d: p.d, i: i, lat: p.lat, lon: p.lon, sepanjang: model.cum[i] + p.t * (model.cum[i + 1] - model.cum[i]) };
      kand.push(cand);
      if (!best || cand.d < best.d) best = cand;
    }
    if (!best) return { d: haversine(lat, lon, c[0][0], c[0][1]), i: 0, lat: c[0][0], lon: c[0][1], sepanjang: 0 };
    // Ruas yang tumpang tindih (jalan dilalui pergi-pulang): dari kandidat yang hampir sama dekat,
    // pilih yang paling sesuai dengan kemajuan perjalanan (tidak mundur dari posisi terakhir)
    var acuan = mulaiDari != null ? mulaiDari : 0, maju = null;
    kand.forEach(function (k) {
      if (k.sepanjang >= acuan - 30 && (!maju || k.d < maju.d)) maju = k;
    });
    return maju && maju.d <= best.d + 15 ? maju : best;
  }

  /* ------------------------------------------------------------ status navigasi */
  function statusNavigasi(model, lat, lon, mulaiDari) {
    var pos = posisiPadaRute(model, lat, lon, mulaiDari);
    var s = pos.sepanjang;
    // langkah berikutnya = manuver pertama yang lokasinya masih di depan posisi (toleransi 8 m)
    var idx = model.langkah.length - 1;
    for (var i = 0; i < model.langkah.length; i++) {
      if (model.langkah[i].mulai > s + 8) { idx = i; break; }
    }
    var next = model.langkah[idx];
    var legIdx = 0;
    while (legIdx < model.leg.length - 1 && model.leg[legIdx].tiba < s + 25) legIdx++;
    var sisaLeg = Math.max(0, model.leg[legIdx].tiba - s);
    var sisaTotal = Math.max(0, model.panjangGeom - s);
    var faktor = model.panjangGeom > 0 ? model.durasi / model.panjangGeom : 0;   // detik per meter rata-rata
    return {
      posisi: pos, menyimpang: pos.d, sepanjang: s, langkahIdx: idx, langkah: next,
      keManuver: Math.max(0, next.mulai - s), legIdx: legIdx, tujuan: model.leg[legIdx],
      sisaLeg: sisaLeg, sisaTotal: sisaTotal, sisaDetik: sisaTotal * faktor,
      tiba: sisaTotal < 25
    };
  }

  // pemberhentian yang belum dicapai (untuk menyusun ulang rute saat keluar jalur)
  function sisaTujuan(model, sepanjang) {
    return model.leg.filter(function (l) { return l.tiba > sepanjang + 25; });
  }

  // titik pada rute di jarak tempuh tertentu (dipakai simulasi perjalanan untuk demo)
  function titikPadaJarak(model, s) {
    var c = model.coords, cum = model.cum;
    if (s <= 0) return c[0];
    if (s >= cum[cum.length - 1]) return c[c.length - 1];
    var i = 0; while (i < cum.length - 1 && cum[i + 1] < s) i++;
    var t = (s - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i]);
    return [c[i][0] + t * (c[i + 1][0] - c[i][0]), c[i][1] + t * (c[i + 1][1] - c[i][1])];
  }

  return {
    haversine: haversine, arahMataAngin: arahMataAngin, teksInstruksi: teksInstruksi, ikonManuver: ikonManuver,
    bangunRute: bangunRute, posisiPadaRute: posisiPadaRute, statusNavigasi: statusNavigasi, sisaTujuan: sisaTujuan,
    titikPadaJarak: titikPadaJarak
  };
});
