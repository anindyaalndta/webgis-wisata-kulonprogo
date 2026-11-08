/* app.js — antarmuka WebGIS (peta, jelajah, rekomendasi, metode, data). Perhitungan ada di rekom.js */
(function () {
  'use strict';

  var C = window.CONFIG, R = window.Rekom, QA = window.QA || {};
  var KAT = C.kategori;
  var KAT_COLOR = {
    'Wisata Alam': '#2f8f5b', 'Wisata Alam-Buatan': '#2c7fb8', 'Religi dan Budaya': '#8a4fa3',
    'Agrowisata': '#c9921a', 'Akomodasi dan Rekreasi': '#d0573a'
  };
  var KAT_ICON = {
    'Wisata Alam': '<path d="M1 14 6 5l3 5 2-3 4 7z"/>',
    'Wisata Alam-Buatan': '<path d="M8 1.5S3 7.6 3 10.6a5 5 0 0 0 10 0C13 7.6 8 1.5 8 1.5z"/>',
    'Religi dan Budaya': '<path d="M8 1 15 5H1zM2.5 6h2v6h-2zm4.5 0h2v6H7zm4.5 0h2v6h-2zM1 13h14v2H1z"/>',
    'Agrowisata': '<path d="M2 14C2 7 7 2.5 14.5 2.5 14.5 9.5 10 14 2 14zm2-1.5c3-1 5.5-3.5 7-7-2.5 2.5-4.6 4.5-7 7z" fill-rule="evenodd"/>',
    'Akomodasi dan Rekreasi': '<path d="M8 1.5 15.5 14.5H.5zM8 8.2l-2.8 6.3h5.6z" fill-rule="evenodd"/>'
  };
  // kriteria memakai gradasi abu-abu (tanpa warna) agar tidak tertukar dengan warna kategori wisata
  var CRIT_COLOR = ['#1d2a24', '#55625b', '#909b95', '#c9d0cc'];
  var PRESET_W = { seimbang: [25, 25, 25, 25], dekat: [50, 15, 20, 15], hemat: [15, 55, 15, 15], populer: [15, 10, 30, 45] };
  var PRESET_ORIGIN = {
    tugu: { lat: -7.782889, lon: 110.367083, label: 'Tugu Yogyakarta' },
    gerbosari: { lat: -7.669881, lon: 110.166247, label: 'Gerbosari, pusat Kapanewon Samigaluh (toponimi RBI)' }
  };
  var OSRM = 'https://router.project-osrm.org';

  var DESTS = window.WISATA.features.map(function (f) {
    return Object.assign({}, f.properties, { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
  });
  var BYID = {};
  DESTS.forEach(function (d) { BYID[d.id] = d; });
  var MIDX = {};
  window.MATRIKS.ids.forEach(function (id, i) { MIDX[id] = i; });
  function antar(a, b) { return window.MATRIKS.dur[MIDX[a]][MIDX[b]]; }
  function antarDist(a, b) { return window.MATRIKS.dist[MIDX[a]][MIDX[b]]; }

  var S = {
    origin: null, pick: false, kat: new Set(KAT), q: '', kec: 'semua', sort: 'nama', luar: false,
    ahpMatrix: clone(C.ahp_default), ahpW: C.ahp_result.w.slice(),
    w: C.ahp_result.w.map(function (x) { return Math.round(x * 100); }),
    travelCache: {}, last: null, sel: null
  };

  /* ------------------------------------------------------------ util */
  function $(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rp(n) { return n === 0 ? 'Gratis' : 'Rp' + Math.round(n).toLocaleString('id-ID'); }
  function num(n, d) { return Number(n).toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function dur(sec) {
    var m = Math.round(sec / 60);
    if (m < 60) return m + ' mnt';
    return Math.floor(m / 60) + ' j ' + (m % 60 ? (m % 60) + ' mnt' : '');
  }
  function jam(h) { return Number(h).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' jam'; }
  function km(m) { return num(m / 1000, 1) + ' km'; }
  function rating(d) { return d.rating == null ? '<span class="muted">belum ada rating</span>' : '★ ' + num(d.rating, 1) + ' <span class="muted">(' + num(d.ulasan || 0) + ')</span>'; }
  function icon(kat) { return '<svg viewBox="0 0 16 16" aria-hidden="true">' + KAT_ICON[kat] + '</svg>'; }
  function dotHtml(kat, size) {
    return '<span class="mk" style="background:' + KAT_COLOR[kat] + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '">' + icon(kat) + '</span>';
  }
  var toastT;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 3200);
  }
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function fetchJson(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 12000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ------------------------------------------------------------ tab */
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (b) {
      var on = b.dataset.tab === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.tabpane').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
    $('panel').scrollTop = 0;
    setTimeout(function () { map.invalidateSize(); }, 50);
  }
  document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });

  /* ------------------------------------------------------------ peta */
  var map = L.map('map', { zoomControl: true }).setView([-7.705, 110.185], 12);
  map.createPane('batas'); map.getPane('batas').style.zIndex = 350;
  map.createPane('jalan'); map.getPane('jalan').style.zIndex = 360;
  map.createPane('rute'); map.getPane('rute').style.zIndex = 450;

  var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Citra &copy; Esri, Maxar, Earthstar Geographics'
  });
  var topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, subdomains: 'abc', attribution: '&copy; OpenTopoMap (CC-BY-SA), &copy; OpenStreetMap'
  });

  var lyrKec = L.geoJSON(window.KAPANEWON, {
    pane: 'batas',
    style: function (f) {
      return f.properties.target
        ? { color: '#4f9a7a', weight: 2.4, fillColor: '#4f9a7a', fillOpacity: 0.05 }
        : { color: '#6b7d72', weight: 1, dashArray: '4 4', fill: false };
    },
    onEachFeature: function (f, l) {
      if (!f.properties.target) l.bindTooltip(f.properties.kecamatan + ', ' + f.properties.kabupaten, { sticky: true });
    },
    interactive: true
  }).addTo(map);
  var lyrLabel = L.layerGroup().addTo(map);
  lyrKec.eachLayer(function (l) {
    if (!l.feature.properties.target) return;
    L.tooltip({ permanent: true, direction: 'center', className: 'lbl-kec', interactive: false })
      .setLatLng(l.getBounds().getCenter()).setContent(l.feature.properties.kecamatan).addTo(lyrLabel);
  });
  var lyrDesa = L.geoJSON(window.KALURAHAN, {
    pane: 'batas',
    style: { color: '#3f7a63', weight: 0.8, dashArray: '2 3', fill: true, fillOpacity: 0 },
    onEachFeature: function (f, l) { l.bindTooltip('Kalurahan ' + f.properties.desa + ' · ' + f.properties.kecamatan, { sticky: true }); }
  }).addTo(map);
  var lyrJalan = L.geoJSON(window.JALAN, {
    pane: 'jalan', interactive: false,
    style: function (f) {
      var k = f.properties.kelas;
      return k === 'Arteri' ? { color: '#e3632d', weight: 3.5 } : k === 'Kolektor' ? { color: '#f2a93b', weight: 2.4 } : { color: '#f6d77e', weight: 1.2 };
    }
  });
  var lyrDest = L.layerGroup().addTo(map);
  var lyrHasil = L.layerGroup().addTo(map);
  var lyrRute = L.layerGroup().addTo(map);
  var originMarker = null;

  L.control.layers(
    { 'Peta jalan (OSM)': osm, 'Citra satelit': sat, 'Topografi': topo },
    { 'Destinasi wisata': lyrDest, 'Batas kapanewon': lyrKec, 'Label kapanewon': lyrLabel, 'Batas kalurahan': lyrDesa, 'Jaringan jalan RBI 1:25.000': lyrJalan, 'Hasil rekomendasi & rute': lyrHasil },
    { collapsed: true }
  ).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  var legend = L.control({ position: 'bottomleft' });
  legend.onAdd = function () {
    var d = L.DomUtil.create('div', 'legend');
    d.innerHTML = KAT.map(function (k) { return '<div class="li"><span class="sw" style="background:' + KAT_COLOR[k] + '"></span>' + k + '</div>'; }).join('') +
      '<div class="li"><span class="ln"></span>Kapanewon kajian</div><div class="li"><span class="ln d"></span>Wilayah sekitar</div>' +
      '<div class="li sep"><span class="lg-rank">1</span>Peringkat rekomendasi</div><div class="li"><span class="lg-stop">1</span>Urutan rute</div><div class="li"><span class="ln rt"></span>Garis rute</div>';
    L.DomEvent.disableClickPropagation(d);
    return d;
  };
  legend.addTo(map);

  /* ------------------------------------------------------------ marker destinasi */
  var MARKERS = {};
  function mkIcon(d, extra) {
    return L.divIcon({
      className: '', iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -10],
      html: '<div class="mk' + (d.in_scope ? '' : ' luar') + (extra || '') + '" style="background:' + KAT_COLOR[d.kategori] + '">' + icon(d.kategori) + '</div>'
    });
  }
  function popupHtml(d) {
    return '<div class="pop"><h4>' + esc(d.nama) + '</h4>' +
      '<div class="meta">' + esc(d.kategori) + ' · ' + esc(d.desa || '-') + ', ' + esc(d.kecamatan || '-') + '</div>' +
      '<div class="kv">' + rating(d) + '</div>' +
      '<div class="kv">Tiket: ' + esc(d.harga_teks || 'belum tercatat') + '</div>' +
      '<div class="kv">Jam: ' + esc(d.jam || 'belum tercatat') + '</div>' +
      (d.in_scope ? '' : '<div class="kv"><span class="tag warn">Di luar 3 kapanewon</span></div>') +
      '<div class="btnrow"><button class="btn" data-act="detail" data-id="' + d.id + '">Detail</button>' +
      '<button class="btn" data-act="start" data-id="' + d.id + '">Mulai dari sini</button>' +
      '<a class="btn" href="' + esc(d.gmaps_url) + '" target="_blank" rel="noopener">Ulasan</a></div></div>';
  }
  DESTS.forEach(function (d) {
    var m = L.marker([d.lat, d.lon], { icon: mkIcon(d), title: d.nama, riseOnHover: true });
    m.bindPopup(function () { return popupHtml(d); });
    m.on('click', function () { selectInList(d.id); });
    MARKERS[d.id] = m;
  });
  map.on('popupopen', function (e) {
    var el = e.popup.getElement();
    el.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = BYID[+b.dataset.id];
        if (b.dataset.act === 'detail') openDetail(d);
        if (b.dataset.act === 'start') { setOrigin(d.lat, d.lon, d.nama); showTab('rekom'); $('manualWrap').open = true; renderKriteriaCard(); map.closePopup(); }
      });
    });
  });

  function focusDest(d) {
    var m = MARKERS[d.id], opened = false;
    if (!lyrDest.hasLayer(m)) lyrDest.addLayer(m);
    function open() { if (!opened) { opened = true; m.openPopup(); } }
    map.once('moveend', open);
    setTimeout(open, 1200);            // cadangan bila animasi tertunda (mis. tab tidak aktif)
    map.flyTo([d.lat, d.lon], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }

  /* ------------------------------------------------------------ jelajah */
  function renderStats() {
    var inn = DESTS.filter(function (d) { return d.in_scope; });
    $('stats').innerHTML =
      '<div class="stat"><b>' + inn.length + '</b><span>destinasi wisata</span></div>' +
      '<div class="stat"><b>3</b><span>kapanewon</span></div>' +
      '<div class="stat"><b>' + window.KALURAHAN.features.length + '</b><span>kalurahan</span></div>';
    $('nLuar').textContent = '(' + (DESTS.length - inn.length) + ')';
  }
  function renderChips() {
    var box = $('katChips');
    box.innerHTML = '';
    KAT.forEach(function (k) {
      var n = DESTS.filter(function (d) { return d.kategori === k && (d.in_scope || S.luar); }).length;
      var c = document.createElement('button');
      c.type = 'button'; c.className = 'chip' + (S.kat.has(k) ? '' : ' off');
      c.setAttribute('aria-pressed', S.kat.has(k));
      c.innerHTML = '<span class="dot" style="background:' + KAT_COLOR[k] + '"></span>' + k + ' <span class="n">' + n + '</span>';
      c.addEventListener('click', function () {
        if (S.kat.has(k) && S.kat.size === KAT.length) { S.kat = new Set([k]); }        // klik pertama: fokus 1 kategori
        else if (S.kat.has(k)) { S.kat.delete(k); if (!S.kat.size) S.kat = new Set(KAT); }
        else S.kat.add(k);
        renderChips(); renderList();
      });
      box.appendChild(c);
    });
  }
  function visibleDests() {
    var q = S.q.trim().toLowerCase();
    var out = DESTS.filter(function (d) {
      if (!d.in_scope && !S.luar) return false;
      if (!S.kat.has(d.kategori)) return false;
      if (S.kec !== 'semua' && d.kecamatan !== S.kec) return false;
      if (q && (d.nama + ' ' + (d.desa || '') + ' ' + (d.kecamatan || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    out.sort(function (a, b) {
      if (S.sort === 'ulasan') return (b.ulasan || 0) - (a.ulasan || 0);
      if (S.sort === 'rating') return (b.rating || 0) - (a.rating || 0) || (b.ulasan || 0) - (a.ulasan || 0);
      return a.nama.localeCompare(b.nama, 'id');
    });
    return out;
  }
  function renderList() {
    var vis = visibleDests(), ul = $('dlist');
    var ids = new Set(vis.map(function (d) { return d.id; }));
    DESTS.forEach(function (d) {
      var m = MARKERS[d.id];
      if (ids.has(d.id)) { if (!lyrDest.hasLayer(m)) lyrDest.addLayer(m); }
      else if (lyrDest.hasLayer(m)) lyrDest.removeLayer(m);
    });
    $('listCount').textContent = vis.length + ' destinasi ditampilkan';
    ul.innerHTML = vis.map(function (d) {
      return '<li data-id="' + d.id + '"' + (S.sel === d.id ? ' class="sel"' : '') + '><span class="ico">' + dotHtml(d.kategori, 22) + '</span>' +
        '<div><div class="t">' + esc(d.nama) + '</div><div class="s">' + esc(d.desa || '-') + ', ' + esc(d.kecamatan || '-') +
        (d.in_scope ? '' : ' <span class="tag warn">luar cakupan</span>') + '</div></div>' +
        '<div class="r">' + (d.rating == null ? '–' : '<b>★ ' + num(d.rating, 1) + '</b><br>' + num(d.ulasan || 0) + ' ulasan') + '</div></li>';
    }).join('') || '<li class="muted">Tidak ada destinasi yang cocok.</li>';
  }
  function selectInList(id) {
    S.sel = id;
    document.querySelectorAll('#dlist li').forEach(function (li) { li.classList.toggle('sel', +li.dataset.id === id); });
  }
  $('dlist').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-id]');
    if (!li) return;
    var d = BYID[+li.dataset.id];
    selectInList(d.id); focusDest(d);
  });
  $('q').addEventListener('input', function (e) { S.q = e.target.value; renderList(); });
  $('fKec').addEventListener('change', function (e) { S.kec = e.target.value; renderList(); });
  $('fSort').addEventListener('change', function (e) { S.sort = e.target.value; renderList(); });
  $('fLuar').addEventListener('change', function (e) { S.luar = e.target.checked; renderChips(); renderList(); });

  /* ------------------------------------------------------------ detail */
  function openModal(title, html) {
    $('modalTitle').textContent = title; $('modalBody').innerHTML = html; $('modal').hidden = false;
    $('modalClose').focus();
  }
  function closeModal() { $('modal').hidden = true; }
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

  function openDetail(d) {
    var html = '<p><span class="tag" style="background:' + KAT_COLOR[d.kategori] + ';color:#fff">' + esc(d.kategori) + '</span> ' +
      '<span class="tag">' + esc(d.status_wilayah) + '</span></p>' +
      '<p>' + esc(d.deskripsi || 'Belum ada deskripsi.') + '</p>' +
      '<div class="detail-grid">' +
      '<div><span>Lokasi</span>' + esc(d.desa || '-') + ', ' + esc(d.kecamatan || '-') + ', ' + esc(d.kabupaten || '-') + '</div>' +
      '<div><span>Koordinat (WGS 84)</span>' + d.lat.toFixed(6) + ', ' + d.lon.toFixed(6) + '</div>' +
      '<div><span>Rating Google Maps</span>' + rating(d) + '</div>' +
      '<div><span>Jenis (Google)</span>' + esc(d.jenis || '-') + '</div>' +
      '<div><span>Harga tiket masuk</span>' + esc(d.harga_teks || 'belum tercatat') + '</div>' +
      '<div><span>Biaya yang dipakai sistem</span>' + rp(d.biaya_rp) + ' · skala ' + d.biaya_skala + '<br><small class="muted">' + esc(d.biaya_dasar) + '</small></div>' +
      '<div><span>Paket wisata</span>' + esc(d.paket_teks || '-') + '</div>' +
      '<div><span>Kisaran harga makan</span>' + esc(d.makan_teks || '-') + '</div>' +
      '<div><span>Jam operasional</span>' + esc(d.jam || 'belum tercatat') + '</div>' +
      '<div><span>Hari operasional</span>' + esc(d.hari || 'belum tercatat') + '</div>' +
      '<div><span>Asumsi durasi kunjungan</span>' + jam(d.durasi_jam) + '</div>' +
      '<div><span>ID sistem / No. data awal</span>' + d.id + ' / ' + esc((d.no_asal || []).join(', ')) + '</div>' +
      '</div>' +
      (d.catatan && d.catatan.length ? '<div class="note"><b>Catatan mutu data:</b><br>' + d.catatan.map(esc).join('<br>') + '</div>' : '') +
      '<div class="btnrow"><button class="btn" id="dtStart">Mulai rute dari sini</button>' +
      '<a class="btn" href="' + esc(d.gmaps_url) + '" target="_blank" rel="noopener">Lihat ulasan di Google Maps</a></div>';
    openModal(d.nama, html);
    $('dtStart').addEventListener('click', function () { setOrigin(d.lat, d.lon, d.nama); closeModal(); showTab('rekom'); $('manualWrap').open = true; renderKriteriaCard(); });
  }

  /* ------------------------------------------------------------ lokasi awal */
  function setOrigin(lat, lon, label) {
    S.origin = { lat: lat, lon: lon, label: label };
    if (originMarker) originMarker.remove();
    originMarker = L.marker([lat, lon], {
      icon: L.divIcon({ className: '', html: '<div class="mk-origin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      zIndexOffset: 1000, title: 'Titik awal'
    }).bindTooltip('Titik awal: ' + label).addTo(map);
    var o = $('originInfo');
    o.className = 'origin set';
    o.textContent = 'Titik awal: ' + label + ' (' + lat.toFixed(5) + ', ' + lon.toFixed(5) + ')';
    if (!map.getBounds().contains([lat, lon])) map.flyTo([lat, lon], Math.min(map.getZoom(), 12));
  }
  function setPick(on) {
    S.pick = on; $('pickHint').hidden = !on;
    map.getContainer().style.cursor = on ? 'crosshair' : '';
    if (on) toast('Klik pada peta untuk menentukan titik awal');
  }
  $('btnPick').addEventListener('click', function () { setPick(true); if (window.innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('pickCancel').addEventListener('click', function () { setPick(false); });
  map.on('click', function (e) {
    if (!S.pick) return;
    setPick(false);
    setOrigin(e.latlng.lat, e.latlng.lng, 'Titik pilihan pada peta');
  });
  $('btnGps').addEventListener('click', function () {
    if (!navigator.geolocation) { toast('Peramban tidak mendukung geolokasi'); return; }
    toast('Mengambil lokasi…');
    navigator.geolocation.getCurrentPosition(function (p) {
      setOrigin(p.coords.latitude, p.coords.longitude, 'Lokasi saya (±' + Math.round(p.coords.accuracy) + ' m)');
    }, function (err) {
      toast('Lokasi tidak dapat diambil (' + err.message + '). Gunakan "Pilih pada peta".', 5000);
    }, { enableHighAccuracy: true, timeout: 10000 });
  });
  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () { var p = PRESET_ORIGIN[b.dataset.preset]; setOrigin(p.lat, p.lon, p.label); });
  });
  function geocode() { geocodeTo('geoQ', 'geoRes', setOrigin); }
  function geocodeTo(inputId, ulId, cb) {
    var q = $(inputId).value.trim();
    if (q.length < 3) { toast('Ketik minimal 3 huruf'); return; }
    var ul = $(ulId);
    ul.innerHTML = '<li class="muted">Mencari…</li>';
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&accept-language=id' +
      '&viewbox=109.95,-7.55,110.45,-7.95&q=' + encodeURIComponent(q);
    fetchJson(url, 10000).then(function (rows) {
      if (!rows.length) { ul.innerHTML = '<li class="muted">Tidak ditemukan. Coba nama lain atau pilih pada peta.</li>'; return; }
      ul.innerHTML = rows.map(function (r, i) { return '<li data-i="' + i + '">' + esc(r.display_name) + '</li>'; }).join('');
      ul.querySelectorAll('li').forEach(function (li) {
        li.addEventListener('click', function () {
          var r = rows[+li.dataset.i];
          cb(+r.lat, +r.lon, r.display_name.split(',').slice(0, 2).join(','));
          ul.innerHTML = '';
        });
      });
    }).catch(function () { ul.innerHTML = '<li class="muted">Layanan pencarian tidak dapat dijangkau. Gunakan "Pilih pada peta".</li>'; });
  }
  $('btnGeo').addEventListener('click', geocode);
  $('geoQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); geocode(); } });

  /* ------------------------------------------------------------ form rekomendasi */
  /* Pilihan ganda (kategori, kelas biaya, kelas rating) dipakai bersama oleh panduan dan formulir manual */
  var DALAM = DESTS.filter(function (d) { return d.in_scope; });
  var GRUP = {
    kat: KAT.map(function (k) { return { id: k, label: k, n: DALAM.filter(function (d) { return d.kategori === k; }).length }; }),
    biaya: R.KELAS_BIAYA.map(function (k) { return { id: k.id, label: k.label, n: DALAM.filter(function (d) { return R.kelasBiaya(d.biaya_rp) === k.id; }).length }; }),
    rating: R.KELAS_RATING.map(function (k) { return { id: k.id, label: k.label, n: DALAM.filter(function (d) { return R.kelasRating(d.rating) === k.id; }).length }; })
  };
  S.pilih = { kat: new Set(KAT), biaya: new Set(GRUP.biaya.map(function (o) { return o.id; })), rating: new Set(GRUP.rating.map(function (o) { return o.id; })) };
  function teksPilihan(key, set) {
    var g = GRUP[key];
    if (!set.size) return 'Belum dipilih';
    if (set.size === g.length) return { kat: 'Semua kategori', biaya: 'Semua kelas biaya', rating: 'Semua kelas rating' }[key];
    return g.filter(function (o) { return set.has(o.id); }).map(function (o) { return o.label; }).join(', ');
  }
  function renderGrupManual(key, boxId) {
    var g = GRUP[key], set = S.pilih[key], semua = set.size === g.length;
    $(boxId).innerHTML = '<button type="button" class="chip all' + (semua ? ' on' : '') + '" data-all="1" aria-pressed="' + semua + '">' + (semua ? '✓ Semua' : 'Pilih semua') + '</button>' +
      g.map(function (o) {
        var on = set.has(o.id);
        return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-id="' + esc(o.id) + '" aria-pressed="' + on + '">' +
          (key === 'kat' ? '<span class="dot" style="background:' + KAT_COLOR[o.id] + '"></span>' : '') + esc(o.label) + ' <span class="n">' + o.n + '</span></button>';
      }).join('');
    $(boxId).querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.all) { if (set.size === g.length) set.clear(); else g.forEach(function (o) { set.add(o.id); }); }
        else if (set.has(b.dataset.id)) set.delete(b.dataset.id); else set.add(b.dataset.id);
        renderGrupManual(key, boxId); renderKriteriaCard();
      });
    });
  }
  function renderSemuaGrupManual() { renderGrupManual('kat', 'rKat'); renderGrupManual('biaya', 'rBiaya'); renderGrupManual('rating', 'rRating'); }
  renderSemuaGrupManual();
  function buildSliders() {
    $('sliders').innerHTML = R.KRITERIA.map(function (k, j) {
      return '<div class="slider"><label for="w' + j + '">' + k.kode + ' ' + k.nama + ' <small>(' + k.sifat + ')</small></label>' +
        '<output id="wo' + j + '"></output><input type="range" id="w' + j + '" min="0" max="100" step="1" value="' + S.w[j] + '"></div>';
    }).join('');
    R.KRITERIA.forEach(function (k, j) {
      $('w' + j).addEventListener('input', function (e) { S.w[j] = +e.target.value; markPreset(null); updateSliderOut(); });
    });
    updateSliderOut();
  }
  function updateSliderOut() {
    var n = R.normalisasiBobot(S.w);
    n.forEach(function (x, j) { $('wo' + j).textContent = num(x * 100, 1) + '%'; $('w' + j).value = S.w[j]; });
  }
  function markPreset(name) {
    document.querySelectorAll('#presetsW .pill').forEach(function (p) { p.classList.toggle('on', p.dataset.w === name); });
  }
  function setWeights(name) {
    S.w = name === 'ahp' ? S.ahpW.map(function (x) { return Math.round(x * 1000) / 10; }) : PRESET_W[name].slice();
    markPreset(name); updateSliderOut();
  }
  document.querySelectorAll('#presetsW .pill').forEach(function (p) { p.addEventListener('click', function () { setWeights(p.dataset.w); }); });
  $('jamFree').addEventListener('change', function (e) { $('jam').disabled = e.target.checked; renderKriteriaCard(); });

  // Waktu & jarak tempuh dari titik awal ke seluruh destinasi: 1 permintaan OSRM Table (cadangan: estimasi terkalibrasi)
  function originTravel(o) {
    var key = o.lat.toFixed(5) + ',' + o.lon.toFixed(5);
    if (S.travelCache[key]) return Promise.resolve(S.travelCache[key]);
    var coords = [[o.lon, o.lat]].concat(DESTS.map(function (d) { return [d.lon, d.lat]; }))
      .map(function (c) { return c[0].toFixed(6) + ',' + c[1].toFixed(6); }).join(';');
    var url = OSRM + '/table/v1/driving/' + coords + '?sources=0&annotations=duration,distance';
    return fetchJson(url, 15000).then(function (res) {
      if (res.code !== 'Ok') throw new Error(res.code);
      var m = {}, nEst = 0;
      DESTS.forEach(function (d, i) {
        var t = res.durations[0][i + 1], s = res.distances[0][i + 1];
        if (t == null || s == null) { m[d.id] = R.fallbackTravel(o.lat, o.lon, d); nEst++; }
        else m[d.id] = { dur: t, dist: s, estimasi: false };
      });
      var out = { map: m, sumber: 'osrm', nEst: nEst, snap: res.sources[0].distance };
      S.travelCache[key] = out;
      return out;
    }).catch(function () {
      var m = {};
      DESTS.forEach(function (d) { m[d.id] = R.fallbackTravel(o.lat, o.lon, d); });
      return { map: m, sumber: 'estimasi', nEst: DESTS.length, snap: 0 };
    });
  }

  function readParams() {
    var P = S.pilih, jamFree = $('jamFree').checked, jam = parseFloat($('jam').value);
    if (!jamFree && !(jam > 0)) throw new Error('Isi waktu tersedia (jam) dengan angka lebih dari 0 atau centang "Tidak dibatasi".');
    if (!P.kat.size) throw new Error('Pilih minimal satu jenis wisata.');
    if (!P.biaya.size) throw new Error('Pilih minimal satu kelas biaya.');
    if (!P.rating.size) throw new Error('Pilih minimal satu kelas rating.');
    var semua = function (key) { return S.pilih[key].size === GRUP[key].length; };
    return {
      kategori: semua('kat') ? 'semua' : Array.from(P.kat), jamMaks: jamFree ? null : jam, anggaran: null,
      kelasBiaya: semua('biaya') ? null : Array.from(P.biaya), kelasRating: semua('rating') ? null : Array.from(P.rating), ratingMin: 0,
      sertakanLuar: $('sertakanLuar').checked, pulang: $('pulang').checked,
      maksPemberhentian: +$('maksStop').value, kandidatRute: 10
    };
  }

  $('fRekom').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!S.origin) {
      toast('Tentukan lokasi awal terlebih dahulu (langkah 1).', 4000);
      $('originInfo').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var params;
    try { params = readParams(); } catch (err) { toast(err.message, 4500); return; }
    renderKriteriaCard();
    var btn = $('btnCari');
    btn.disabled = true; btn.textContent = 'Menghitung waktu tempuh…';
    $('hasil').hidden = false;
    $('hasilRingkas').innerHTML = '<span class="spin"></span> Menghitung waktu tempuh dari titik awal ke seluruh destinasi melalui jaringan jalan…';
    $('rankList').innerHTML = ''; $('ruteBox').innerHTML = '';
    originTravel(S.origin).then(function (tr) {
      var bobot = R.normalisasiBobot(S.w);
      var res = R.rekomendasi(DESTS, params, function (d) { return tr.map[d.id]; }, antar, bobot, { ratingBayes: $('bayes').checked });
      S.last = { res: res, params: params, tr: tr, origin: Object.assign({}, S.origin), bobot: bobot };
      renderHasil();
      drawHasil();
    }).finally(function () { btn.disabled = false; btn.textContent = 'Cari Rekomendasi'; });
  });

  /* ------------------------------------------------------------ hasil */
  function renderHasil() {
    var L0 = S.last, res = L0.res, h = res.saw.hasil;
    $('hasil').hidden = false;
    var src = L0.tr.sumber === 'osrm'
      ? 'Waktu tempuh: jaringan jalan OSRM' + (L0.tr.nEst ? ' (' + L0.tr.nEst + ' titik diestimasi)' : '')
      : '<b>Mode estimasi</b>: layanan routing tidak terjangkau, waktu tempuh diestimasi dari jarak lurus × 1,74 pada 43 km/jam';
    var basis = L0.params.sertakanLuar ? DESTS.length : DESTS.filter(function (d) { return d.in_scope; }).length;
    $('hasilRingkas').innerHTML = '<b>' + h.length + '</b> dari ' + basis + ' destinasi' + (L0.params.sertakanLuar ? '' : ' dalam cakupan') +
      ' memenuhi batasan. ' + src + '.';
    var ol = $('rankList');
    if (!h.length) {
      ol.innerHTML = '<li class="empty" style="display:block">Tidak ada destinasi yang memenuhi semua batasan. Longgarkan waktu, anggaran, atau rating minimum, lalu cari lagi.</li>';
    } else {
      var leg = '<div class="barlegend">' + R.KRITERIA.map(function (k, j) { return '<span style="--c:' + CRIT_COLOR[j] + '">' + k.nama + ' ' + num(L0.bobot[j] * 100, 0) + '%</span>'; }).join('') + '</div>';
      ol.innerHTML = leg + h.slice(0, 10).map(rankItem).join('') +
        (h.length > 10 ? '<li class="empty" style="display:block;cursor:default">+ ' + (h.length - 10) + ' destinasi lain — lihat "perhitungan SAW" untuk peringkat lengkap.</li>' : '');
    }
    renderRute();
    showSub('rank');
  }
  function rankItem(x) {
    var d = x.d;
    var bar = x.kontribusi.map(function (c, j) { return '<i style="width:' + (c * 100).toFixed(2) + '%;background:' + CRIT_COLOR[j] + '"></i>'; }).join('');
    return '<li data-id="' + d.id + '"><span class="no">' + x.peringkat + '</span>' +
      '<span class="nm">' + esc(d.nama) + '</span><span class="sc" title="Nilai preferensi V">' + num(x.V, 3) + '</span>' +
      '<div class="bar" title="Kontribusi tiap kriteria terhadap V">' + bar + '</div>' +
      '<div class="facts"><span>' + dur(x.travel.dur) + ' · ' + km(x.travel.dist) + (x.travel.estimasi ? ' (estimasi)' : '') + '</span>' +
      '<span>' + rp(d.biaya_rp) + '</span><span>' + rating(d) + '</span></div>' +
      '<div class="facts"><span class="cat-tag" style="--k:' + KAT_COLOR[d.kategori] + '">' + icon(d.kategori) + esc(d.kategori) + '</span></div></li>';
  }
  $('rankList').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-id]');
    if (li) focusDest(BYID[+li.dataset.id]);
  });
  function showSub(name) {
    document.querySelectorAll('.subtab').forEach(function (b) { b.classList.toggle('active', b.dataset.sub === name); });
    document.querySelectorAll('.subpane').forEach(function (p) { p.classList.toggle('active', p.id === 'sub-' + name); });
  }
  document.querySelectorAll('.subtab').forEach(function (b) { b.addEventListener('click', function () { showSub(b.dataset.sub); }); });

  function renderRute() {
    var L0 = S.last, r = L0.res.rute, box = $('ruteBox'), p = L0.params;
    if (!r.pemberhentian.length) {
      box.innerHTML = '<div class="empty">Belum ada rute yang dapat disusun. ' +
        (L0.res.saw.hasil.length ? 'Waktu atau anggaran tidak cukup untuk mengunjungi destinasi prioritas.' : 'Tidak ada destinasi yang lolos penyaringan.') + '</div>';
      return;
    }
    var items = '<li><span class="pin o">A</span><div class="card"><b>' + esc(L0.origin.label) + '</b><span>Titik awal</span></div></li>';
    r.pemberhentian.forEach(function (s, i) {
      var d = s.h.d;
      var dist = s.dari == null ? s.h.travel.dist : antarDist(s.dari, d.id);
      items += '<li><span class="pin">' + (i + 1) + '</span><div class="leg">Berkendara ' + dur(s.leg) + ' · ' + km(dist) + '</div>' +
        '<div class="card" data-id="' + d.id + '" style="cursor:pointer"><b>' + esc(d.nama) + '</b>' +
        '<span>Peringkat SAW #' + s.h.peringkat + ' · kunjungan ±' + jam(d.durasi_jam) + ' · ' + rp(d.biaya_rp) + '</span><br>' +
        '<span>Jam: ' + esc(d.jam || 'belum tercatat') + '</span></div></li>';
    });
    if (p.pulang) {
      var last = r.pemberhentian[r.pemberhentian.length - 1].h;
      items += '<li><span class="pin o">A</span><div class="leg">Kembali ' + dur(r.kembaliDetik) + ' · ' + km(last.travel.dist) + '</div><div class="card"><b>Kembali ke titik awal</b></div></li>';
    }
    var sisa = p.jamMaks != null ? p.jamMaks * 3600 - r.totalDetik : null;
    box.innerHTML =
      '<div class="rute-sum"><div><b>' + r.pemberhentian.length + '</b><span>destinasi</span></div>' +
      '<div><b>' + dur(r.totalDetik) + '</b><span>total (tempuh ' + dur(r.tempuhDetik + r.kembaliDetik) + ')</span></div>' +
      '<div><b>' + rp(r.biaya) + '</b><span>tiket/orang</span></div></div>' +
      (sisa != null ? '<p class="hint">Sisa waktu dari ' + num(p.jamMaks, 1) + ' jam: ' + dur(Math.max(0, sisa)) + '. Urutan disusun dengan nearest neighbour dari 10 destinasi teratas.</p>' : '<p class="hint">Urutan disusun dengan nearest neighbour dari 10 destinasi teratas (maksimum ' + p.maksPemberhentian + ' destinasi).</p>') +
      '<ol class="timeline">' + items + '</ol>' +
      '<div class="btnrow"><button type="button" class="btn primary" id="btnNav" disabled>Mulai navigasi (GPS)</button>' +
      '<button type="button" class="btn" id="btnSim" disabled>Simulasi perjalanan</button>' +
      '<button type="button" class="btn" id="btnFitRute">Tampilkan di peta</button></div>' +
      (L0.tr.sumber !== 'osrm' ? '<div class="note">Waktu tempuh masih estimasi karena layanan routing tidak terjangkau.</div>' : '') +
      '<div class="note" id="ruteGeomNote" hidden></div>' +
      '<h3 class="steps-h">Petunjuk arah</h3>' +
      '<div id="ruteSteps" class="steps"><p class="hint"><span class="spin"></span> Memuat petunjuk arah dari jaringan jalan…</p></div>';
    box.querySelectorAll('.card[data-id]').forEach(function (c) { c.addEventListener('click', function () { focusDest(BYID[+c.dataset.id]); }); });
    $('btnFitRute').addEventListener('click', fitRute);
    $('btnNav').addEventListener('click', function () { startNav('gps'); });
    $('btnSim').addEventListener('click', function () { startNav('sim'); });
  }

  /* ------------------------------------------------------------ petunjuk arah & navigasi di dalam WebGIS */
  var NV = window.Navigasi;
  var PANAH = { 'left': '↰', 'right': '↱', 'slight-left': '↖', 'slight-right': '↗', 'sharp-left': '↰', 'sharp-right': '↱', 'uturn': '↶', 'straight': '↑', 'roundabout': '⟳', 'depart': '▶', 'arrive': '⚑' };
  function jarakTxt(m) { return m < 1000 ? (Math.round(m / 10) * 10) + ' m' : km(m); }
  function ruteTujuan(L0) {
    var t = L0.res.rute.pemberhentian.map(function (s, i) { return { nama: (i + 1) + '. ' + s.h.d.nama, lat: s.h.d.lat, lon: s.h.d.lon }; });
    if (L0.params.pulang && t.length) t.push({ nama: 'titik awal (' + L0.origin.label + ')', lat: L0.origin.lat, lon: L0.origin.lon });
    return t;
  }
  function osrmRoute(coordsLatLon) {
    var q = coordsLatLon.map(function (c) { return c[1].toFixed(6) + ',' + c[0].toFixed(6); }).join(';');
    return fetchJson(OSRM + '/route/v1/driving/' + q + '?overview=full&geometries=geojson&steps=true', 15000).then(function (res) {
      if (res.code !== 'Ok') throw new Error(res.code);
      return res.routes[0];
    });
  }
  function gambarGarisRute(model) {
    lyrRute.clearLayers();
    L.polyline(model.coords, { pane: 'rute', color: '#ffffff', weight: 8, opacity: 0.85 }).addTo(lyrRute);
    var pl = L.polyline(model.coords, { pane: 'rute', color: '#1d2a24', weight: 4.5, opacity: 0.95 }).addTo(lyrRute);
    ruteBounds = pl.getBounds();
  }
  var stepMarker = null;
  function renderSteps(model) {
    var box = $('ruteSteps'); if (!box) return;
    var html = '', legAktif = -1;
    model.langkah.forEach(function (st, i) {
      if (st.leg !== legAktif) {
        if (legAktif >= 0) html += '</ol>';
        legAktif = st.leg;
        var lg = model.leg[st.leg];
        html += '<div class="steps-leg">Menuju ' + esc(lg.nama) + ' <span>' + km(lg.jarak) + ' · ' + dur(lg.durasi) + '</span></div><ol class="steps-list">';
      }
      html += '<li data-i="' + i + '"><span class="st-ic">' + PANAH[st.ikon] + '</span><span class="st-tx">' + esc(st.teks) + '</span>' +
        (st.jarak > 0 ? '<span class="st-d">' + jarakTxt(st.jarak) + '</span>' : '') + '</li>';
    });
    html += '</ol>';
    box.innerHTML = '<p class="hint">' + model.langkah.length + ' langkah · ' + km(model.jarak) + ' · ±' + dur(model.durasi) + ' berkendara. Klik langkah untuk melihat lokasinya di peta.</p>' + html;
    box.querySelectorAll('li[data-i]').forEach(function (li) {
      li.addEventListener('click', function () {
        var st = model.langkah[+li.dataset.i];
        if (stepMarker) stepMarker.remove();
        stepMarker = L.circleMarker(st.lokasi, { radius: 9, color: '#1d2a24', weight: 2, fillColor: '#ffd38f', fillOpacity: 0.95, pane: 'rute' })
          .bindTooltip(st.teks, { permanent: true, direction: 'top', offset: [0, -8] }).addTo(map);
        map.setView(st.lokasi, Math.max(map.getZoom(), 16));
        if (window.innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    if ($('btnNav')) { $('btnNav').disabled = false; $('btnSim').disabled = false; }
  }

  var NAV = null, suaraAktif = false;
  function bicara(teks) {
    if (!suaraAktif || !('speechSynthesis' in window)) return;
    try { var u = new SpeechSynthesisUtterance(teks); u.lang = 'id-ID'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch (e) { /* abaikan */ }
  }
  function startNav(mode) {
    if (!S.navModel) { toast('Petunjuk arah belum tersedia'); return; }
    stopNav();
    NAV = { mode: mode, model: S.navModel, s: 0, off: 0, follow: true, lastIdx: -1, lastLeg: 0, rerouting: false, dekat: false, pertama: true };
    $('navBanner').hidden = false;
    $('nbFollow').classList.add('on'); $('nbFollow').setAttribute('aria-pressed', 'true');
    $('nbIcon').textContent = '…'; $('nbDist').textContent = mode === 'gps' ? 'Mencari sinyal GPS…' : 'Simulasi dimulai';
    $('nbInstr').textContent = ''; $('nbSub').textContent = '';
    if (window.innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'smooth' });
    if (mode === 'gps') {
      if (!navigator.geolocation) { toast('Peramban tidak mendukung GPS; gunakan simulasi'); stopNav(); return; }
      NAV.watch = navigator.geolocation.watchPosition(function (p) {
        onPos(p.coords.latitude, p.coords.longitude, p.coords.accuracy || 20);
      }, function (err) {
        toast('GPS tidak dapat dipakai (' + err.message + '). Coba "Simulasi perjalanan".', 5000);
      }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    } else {
      NAV.simS = 0;
      NAV.timer = setInterval(function () {
        if (!NAV) return;
        // dipercepat untuk demo: seluruh rute ditempuh ±50 detik (minimal 30 m per langkah)
        NAV.simS = Math.min(NAV.model.panjangGeom, NAV.simS + Math.max(30, NAV.model.panjangGeom / 125));
        var pt = NV.titikPadaJarak(NAV.model, NAV.simS);
        onPos(pt[0], pt[1], 5);
      }, 400);
    }
  }
  function onPos(lat, lon, acc) {
    if (!NAV) return;
    if (!NAV.marker) {
      NAV.acc = L.circle([lat, lon], { radius: acc, color: '#2c7fb8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
      NAV.marker = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="mk-me"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 2000, interactive: false }).addTo(map);
    }
    NAV.marker.setLatLng([lat, lon]); NAV.acc.setLatLng([lat, lon]).setRadius(acc);
    var st = NV.statusNavigasi(NAV.model, lat, lon, NAV.s);
    var batas = Math.max(60, acc * 1.5);
    if (st.menyimpang > batas) NAV.off++; else { NAV.off = 0; NAV.s = st.sepanjang; }
    if (NAV.off >= 3 && NAV.mode === 'gps' && !NAV.rerouting) hitungUlang(lat, lon);
    if (NAV.follow) {
      if (NAV.pertama) { map.setView([lat, lon], 16); NAV.pertama = false; } else map.panTo([lat, lon], { animate: true, duration: 0.3 });
    }
    // tiba di pemberhentian
    if (st.legIdx > NAV.lastLeg) {
      toast('Tiba di ' + NAV.model.leg[NAV.lastLeg].nama, 4000); bicara('Anda telah tiba di ' + NAV.model.leg[NAV.lastLeg].nama.replace(/^\d+\.\s*/, ''));
      NAV.lastLeg = st.legIdx;
    }
    if (st.tiba) {
      $('nbIcon').textContent = PANAH.arrive; $('nbDist').textContent = 'Anda telah tiba';
      $('nbInstr').textContent = NAV.model.leg[NAV.model.leg.length - 1].nama; $('nbSub').textContent = 'Navigasi selesai.';
      bicara('Anda telah tiba di tujuan akhir');
      selesaiPelacakan();
      return;
    }
    $('nbIcon').textContent = PANAH[st.langkah.ikon];
    $('nbDist').textContent = jarakTxt(st.keManuver);
    $('nbInstr').textContent = st.langkah.teks;
    $('nbSub').textContent = (st.menyimpang > batas ? 'Di luar rute (' + Math.round(st.menyimpang) + ' m) · ' : '') +
      'Menuju ' + st.tujuan.nama + ' · sisa ' + km(st.sisaLeg) + ' · total ' + km(st.sisaTotal) + ' (±' + dur(st.sisaDetik) + ')';
    if (st.langkahIdx !== NAV.lastIdx) {
      NAV.lastIdx = st.langkahIdx; NAV.dekat = false;
      bicara(st.langkah.teks);
      document.querySelectorAll('#ruteSteps li').forEach(function (li) { li.classList.toggle('cur', +li.dataset.i === st.langkahIdx); });
    } else if (!NAV.dekat && st.keManuver < 120) {
      NAV.dekat = true; bicara('Dalam ' + (Math.round(st.keManuver / 10) * 10) + ' meter, ' + st.langkah.teks);
    }
  }
  function hitungUlang(lat, lon) {
    var sisa = NV.sisaTujuan(NAV.model, NAV.s);
    if (!sisa.length) return;
    NAV.rerouting = true;
    $('nbSub').textContent = 'Keluar dari rute — menghitung ulang…';
    osrmRoute([[lat, lon]].concat(sisa.map(function (l) { return [l.lat, l.lon]; }))).then(function (rt) {
      if (!NAV) return;
      var m = NV.bangunRute(rt, sisa.map(function (l) { return { nama: l.nama, lat: l.lat, lon: l.lon }; }));
      NAV.model = m; NAV.s = 0; NAV.off = 0; NAV.lastIdx = -1; NAV.lastLeg = 0;
      gambarGarisRute(m); renderSteps(m);
      toast('Rute dihitung ulang dari posisi Anda'); bicara('Rute dihitung ulang');
    }).catch(function () { toast('Gagal menghitung ulang rute; ikuti garis rute semula.'); })
      .finally(function () { if (NAV) NAV.rerouting = false; });
  }
  function selesaiPelacakan() {
    if (!NAV) return;
    if (NAV.watch != null) navigator.geolocation.clearWatch(NAV.watch);
    if (NAV.timer) clearInterval(NAV.timer);
    NAV.watch = null; NAV.timer = null;
  }
  function stopNav() {
    if (!NAV) { $('navBanner').hidden = true; return; }
    selesaiPelacakan();
    if (NAV.marker) NAV.marker.remove();
    if (NAV.acc) NAV.acc.remove();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    document.querySelectorAll('#ruteSteps li.cur').forEach(function (li) { li.classList.remove('cur'); });
    NAV = null;
    $('navBanner').hidden = true;
  }
  $('nbStop').addEventListener('click', stopNav);
  $('nbFollow').addEventListener('click', function () {
    if (!NAV) return;
    NAV.follow = !NAV.follow;
    this.classList.toggle('on', NAV.follow); this.setAttribute('aria-pressed', NAV.follow);
  });
  $('nbVoice').addEventListener('click', function () {
    if (!('speechSynthesis' in window)) { toast('Peramban tidak mendukung suara'); return; }
    suaraAktif = !suaraAktif;
    this.classList.toggle('on', suaraAktif); this.setAttribute('aria-pressed', suaraAktif);
    if (suaraAktif) bicara('Panduan suara aktif');
  });
  map.on('dragstart', function () {
    if (NAV && NAV.follow) { NAV.follow = false; $('nbFollow').classList.remove('on'); $('nbFollow').setAttribute('aria-pressed', 'false'); }
  });

  var ruteBounds = null;
  function drawHasil() {
    lyrHasil.clearLayers(); lyrRute.clearLayers();
    var L0 = S.last, h = L0.res.saw.hasil, r = L0.res.rute;
    var pts = [[L0.origin.lat, L0.origin.lon]];
    var inRoute = {}, lolos = {};
    r.pemberhentian.forEach(function (s, i) { inRoute[s.h.d.id] = i + 1; });
    h.forEach(function (x) { lolos[x.d.id] = true; });
    // redupkan destinasi yang tidak memenuhi kriteria pengguna
    DESTS.forEach(function (d) { MARKERS[d.id].setOpacity(lolos[d.id] ? 1 : 0.3); });
    h.slice(0, 10).forEach(function (x) {
      if (inRoute[x.d.id]) return;
      L.marker([x.d.lat, x.d.lon], {
        icon: L.divIcon({ className: '', html: '<div class="mk-rank">' + x.peringkat + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
        zIndexOffset: 500, title: '#' + x.peringkat + ' ' + x.d.nama
      }).bindPopup(function () { return popupHtml(x.d); }).addTo(lyrHasil);
      pts.push([x.d.lat, x.d.lon]);
    });
    var line = [[L0.origin.lat, L0.origin.lon]];
    r.pemberhentian.forEach(function (s, i) {
      L.marker([s.h.d.lat, s.h.d.lon], {
        icon: L.divIcon({ className: '', html: '<div class="mk-stop">' + (i + 1) + '</div>', iconSize: [30, 30], iconAnchor: [15, 15] }),
        zIndexOffset: 800, title: 'Pemberhentian ' + (i + 1) + ': ' + s.h.d.nama
      }).bindPopup(function () { return popupHtml(s.h.d); }).addTo(lyrHasil);
      line.push([s.h.d.lat, s.h.d.lon]);
      pts.push([s.h.d.lat, s.h.d.lon]);
    });
    if (L0.params.pulang && r.pemberhentian.length) line.push([L0.origin.lat, L0.origin.lon]);
    ruteBounds = L.latLngBounds(line.length > 1 ? line : pts);
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 });
    S.navModel = null;
    stopNav();
    if (line.length > 1) {
      // garis sementara, diganti geometri jalan + petunjuk arah dari OSRM bila tersedia
      L.polyline(line, { pane: 'rute', color: '#1d2a24', weight: 3, dashArray: '6 6', opacity: 0.9 }).addTo(lyrRute);
      osrmRoute(line).then(function (rt) {
        if (S.last !== L0) return;
        S.navModel = NV.bangunRute(rt, ruteTujuan(L0));
        gambarGarisRute(S.navModel);
        renderSteps(S.navModel);
      }).catch(function () {
        var n = $('ruteGeomNote');
        if (n) { n.hidden = false; n.textContent = 'Geometri jalan dan petunjuk arah tidak dapat dimuat (layanan routing tidak terjangkau); rute digambar sebagai garis lurus antar-pemberhentian.'; }
        var sb = $('ruteSteps'); if (sb) sb.innerHTML = '<p class="hint">Petunjuk arah tidak tersedia saat ini. Periksa koneksi internet lalu cari ulang.</p>';
      });
    }
  }
  function fitRute() {
    if (ruteBounds) map.fitBounds(ruteBounds, { padding: [40, 40] });
    if (window.innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------------------------------------------ transparansi SAW */
  $('btnCalc').addEventListener('click', function () {
    var L0 = S.last; if (!L0) return;
    var s = L0.res.saw, K = R.KRITERIA;
    if (!s.hasil.length) { toast('Belum ada alternatif untuk dihitung'); return; }
    var head = '<tr><th rowspan="2">#</th><th rowspan="2">Destinasi</th>' +
      '<th colspan="4" class="n">Matriks keputusan X</th><th colspan="4" class="n">Ternormalisasi R</th><th rowspan="2" class="n">V</th></tr><tr>' +
      K.map(function (k) { return '<th class="n">' + k.kode + '</th>'; }).join('') + K.map(function (k) { return '<th class="n">' + k.kode + '</th>'; }).join('') + '</tr>';
    var rows = s.hasil.map(function (x) {
      return '<tr' + (x.peringkat <= 3 ? ' class="hl"' : '') + '><td>' + x.peringkat + '</td><td>' + esc(x.d.nama) + '</td>' +
        x.x.map(function (v) { return '<td class="n">' + num(v, 3) + '</td>'; }).join('') +
        x.r.map(function (v) { return '<td class="n">' + num(v, 4) + '</td>'; }).join('') +
        '<td class="n"><b>' + num(x.V, 4) + '</b></td></tr>';
    }).join('');
    var krit = '<table class="tbl"><tr><th>Kode</th><th>Kriteria</th><th>Sifat</th><th>Satuan</th><th class="n">Bobot w</th><th class="n">' +
      'min/max</th></tr>' + K.map(function (k, j) {
        return '<tr><td>' + k.kode + '</td><td>' + k.nama + '</td><td>' + k.sifat + '</td><td>' + k.satuan + '</td><td class="n">' + num(s.bobot[j], 4) +
          '</td><td class="n">' + (k.sifat === 'cost' ? 'min = ' : 'max = ') + num(s.ekstrem[j], 3) + '</td></tr>';
      }).join('') + '</table>';
    openModal('Perhitungan SAW (' + s.hasil.length + ' alternatif)',
      '<p class="hint">Cost: r = min/x. Benefit: r = x/max. V = Σ w·r. C1 dalam menit (minimal 1), C2 skala biaya 1–5, C3 rating, C4 ln(1+ulasan).</p>' +
      '<div class="tablewrap">' + krit + '</div><br><div class="tablewrap tall"><table class="tbl small">' + head + rows + '</table></div>' +
      '<div class="btnrow"><button class="btn" id="dlSaw">Unduh CSV perhitungan</button></div>');
    $('dlSaw').addEventListener('click', function () {
      var lines = ['peringkat,id,nama,X_C1_menit,X_C2_skala,X_C3_rating,X_C4_ln_ulasan,R_C1,R_C2,R_C3,R_C4,V'];
      s.hasil.forEach(function (x) {
        lines.push([x.peringkat, x.d.id, '"' + x.d.nama.replace(/"/g, '""') + '"'].concat(x.x.map(function (v) { return v.toFixed(6); }), x.r.map(function (v) { return v.toFixed(6); }), [x.V.toFixed(6)]).join(','));
      });
      lines.push('', 'bobot,' + s.bobot.map(function (v) { return v.toFixed(6); }).join(','));
      download('perhitungan_saw.csv', '﻿' + lines.join('\n'), 'text/csv');
    });
  });
  $('btnExcl').addEventListener('click', function () {
    var L0 = S.last; if (!L0) return;
    var ex = L0.res.saring.keluar, cnt = {};
    ex.forEach(function (e) { var k = e.alasan.replace(/ \(butuh.*\)/, ''); cnt[k] = (cnt[k] || 0) + 1; });
    openModal('Destinasi yang tersaring (' + ex.length + ')',
      '<p>' + Object.keys(cnt).map(function (k) { return '<span class="tag">' + esc(k) + ': ' + cnt[k] + '</span>'; }).join(' ') + '</p>' +
      '<div class="tablewrap tall"><table class="tbl small"><tr><th>Destinasi</th><th>Kategori</th><th>Alasan</th></tr>' +
      ex.map(function (e) { return '<tr><td>' + esc(e.d.nama) + '</td><td>' + esc(e.d.kategori) + '</td><td>' + esc(e.alasan) + '</td></tr>'; }).join('') + '</table></div>');
  });

  /* ------------------------------------------------------------ metode: kriteria & AHP */
  function renderKriteria() {
    $('tblKriteria').innerHTML = '<tr><th>Kode</th><th>Kriteria</th><th>Sifat</th><th>Nilai</th><th>Sumber</th></tr>' +
      C.criteria.map(function (k) { return '<tr><td>' + k.kode + '</td><td>' + k.nama + '</td><td>' + k.sifat + '</td><td>' + k.satuan + '</td><td>' + k.sumber + '</td></tr>'; }).join('');
  }
  var SAATY = [9, 8, 7, 6, 5, 4, 3, 2, 1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8, 1 / 9];
  var PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  function fmtSaaty(v) { return v >= 1 ? String(Math.round(v)) : '1/' + Math.round(1 / v); }
  function buildAhp() {
    var K = R.KRITERIA;
    $('ahpPairs').innerHTML = PAIRS.map(function (p, k) {
      var a = K[p[0]], b = K[p[1]], cur = S.ahpMatrix[p[0]][p[1]];
      var opts = SAATY.map(function (v) {
        var lbl = v > 1 ? fmtSaaty(v) + ' — ' + a.nama + ' lebih penting' : v === 1 ? '1 — sama penting' : fmtSaaty(v) + ' — ' + b.nama + ' lebih penting';
        return '<option value="' + v + '"' + (Math.abs(v - cur) < 1e-6 ? ' selected' : '') + '>' + lbl + '</option>';
      }).join('');
      return '<div class="pair"><div class="pl"><b>' + a.kode + '</b> ' + a.nama + ' &nbsp;vs&nbsp; <b>' + b.kode + '</b> ' + b.nama + '</div>' +
        '<select data-k="' + k + '" aria-label="' + a.nama + ' dibanding ' + b.nama + '">' + opts + '</select></div>';
    }).join('');
    $('ahpPairs').querySelectorAll('select').forEach(function (s) {
      s.addEventListener('change', function () {
        var p = PAIRS[+s.dataset.k], v = parseFloat(s.value);
        S.ahpMatrix[p[0]][p[1]] = v; S.ahpMatrix[p[1]][p[0]] = 1 / v;
        renderAhp();
      });
    });
    renderAhp();
  }
  var ahpLast = null;
  function renderAhp() {
    var K = R.KRITERIA, A = S.ahpMatrix, r = R.ahp(A);
    ahpLast = r;
    $('ahpMatrix').innerHTML = '<tr><th></th>' + K.map(function (k) { return '<th>' + k.kode + '</th>'; }).join('') + '<th>Bobot w</th></tr>' +
      A.map(function (row, i) {
        return '<tr><th>' + K[i].kode + '</th>' + row.map(function (v) { return '<td>' + (v >= 1 ? num(v, v % 1 ? 3 : 0) : fmtSaaty(v)) + '</td>'; }).join('') +
          '<td><b>' + num(r.w[i], 4) + '</b></td></tr>';
      }).join('');
    var good = r.konsisten;
    $('ahpOut').innerHTML =
      '<div><b>' + num(r.lambdaMax, 4) + '</b><span>λ maks</span></div>' +
      '<div><b>' + num(r.ci, 4) + '</b><span>CI</span></div>' +
      '<div><b>' + num(r.ri, 2) + '</b><span>RI (n = ' + r.n + ')</span></div>' +
      '<div class="' + (good ? 'good' : 'bad') + '"><b>' + num(r.cr, 4) + '</b><span>CR · ' + (good ? 'konsisten' : 'tidak konsisten') + '</span></div>' +
      '<div style="grid-column:1/-1;text-align:left" class="wbars">' + K.map(function (k, j) {
        return '<div class="wbar"><span>' + k.nama + '</span><span class="t"><i style="width:' + (r.w[j] * 100).toFixed(1) + '%"></i></span><output>' + num(r.w[j] * 100, 1) + '%</output></div>';
      }).join('') + '</div>';
    $('ahpApply').disabled = !good;
    $('ahpApply').title = good ? '' : 'CR > 0,10: perbaiki penilaian terlebih dahulu';
  }
  $('ahpApply').addEventListener('click', function () {
    if (!ahpLast || !ahpLast.konsisten) return;
    S.ahpW = ahpLast.w.slice();
    setWeights('ahp');
    toast('Bobot AHP diterapkan ke form rekomendasi');
  });
  $('ahpReset').addEventListener('click', function () { S.ahpMatrix = clone(C.ahp_default); buildAhp(); });

  /* ------------------------------------------------------------ data & mutu */
  function renderData() {
    var inn = DESTS.filter(function (d) { return d.in_scope; }), kecs = C.target_kec;
    var t = '<tr><th>Kategori</th>' + kecs.map(function (k) { return '<th class="n">' + k + '</th>'; }).join('') + '<th class="n">Jumlah</th></tr>';
    KAT.forEach(function (k) {
      var row = kecs.map(function (c) { return inn.filter(function (d) { return d.kategori === k && d.kecamatan === c; }).length; });
      t += '<tr><td><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + KAT_COLOR[k] + '"></span> ' + k + '</td>' +
        row.map(function (n) { return '<td class="n">' + n + '</td>'; }).join('') + '<td class="n"><b>' + row.reduce(function (a, b) { return a + b; }, 0) + '</b></td></tr>';
    });
    t += '<tr><th>Jumlah</th>' + kecs.map(function (c) { return '<th class="n">' + inn.filter(function (d) { return d.kecamatan === c; }).length + '</th>'; }).join('') + '<th class="n">' + inn.length + '</th></tr>';
    $('tblRekap').innerHTML = t;

    var jvl = QA.jalan_vs_lurus || {};
    $('qaBox').innerHTML =
      '<div class="q"><b>' + QA.n_mentah + ' → ' + QA.n_setelah_gabung + '</b><span>entri awal → setelah ' + (QA.gabungan || []).length + ' pasangan duplikat digabung</span></div>' +
      '<div class="q"><b>' + QA.n_in_scope + '</b><span>dalam cakupan (' + (QA.titik_batas || []).length + ' titik batas ≤150 m)</span></div>' +
      '<div class="q"><b>' + (QA.n_out_scope || []).length + '</b><span>di luar 3 kapanewon (disimpan, tidak ikut rekomendasi bawaan)</span></div>' +
      '<div class="q"><b>' + num(jvl.rata2 || 0, 2) + '×</b><span>rasio jarak jalan / garis lurus (rata-rata ' + num(jvl.n_pasang || 0) + ' pasangan)</span></div>' +
      '<details><summary>Duplikat yang digabung</summary><ul class="plain">' + (QA.gabungan || []).map(function (g) {
        return '<li>' + esc(g.nama) + ' — No. ' + g.dipertahankan + ' + ' + g.digabung + ', jarak ' + g.jarak_m + ' m; rating ' + num(g.rating_baru, 2) + ', ulasan ' + num(g.ulasan_baru) + '</li>';
      }).join('') + '</ul></details>' +
      '<details><summary>Titik batas (koordinat ≤150 m di luar poligon RBI, mengikuti catatan tim)</summary><ul class="plain">' + (QA.titik_batas || []).map(function (t) {
        return '<li>' + esc(t[0]) + ' — tercatat ' + esc(t[1]) + ', RBI: ' + esc(t[2]) + ' (' + t[3] + ' m)</li>';
      }).join('') + '</ul></details>' +
      '<details><summary>Objek di luar cakupan</summary><ul class="plain">' + (QA.n_out_scope || []).map(function (t) {
        return '<li>' + esc(t[1]) + ' — ' + esc(t[2] || 'tidak diketahui') + ', ' + esc(t[3] || '-') + '</li>';
      }).join('') + '</ul></details>' +
      '<details><summary>Data belum lengkap</summary><ul class="plain"><li>Belum ada rating: ' + (QA.rating_kosong || []).map(esc).join(', ') + '</li>' +
      '<li>Harga diestimasi median kategori: ' + (QA.biaya_imputasi || []).map(function (b) { return esc(b[0]); }).join(', ') + '</li>' +
      '<li>Koordinat jauh dari jalan (&gt;300 m dari jaringan OSRM): ' + (QA.osrm_snap_gt_300m || []).map(function (b) { return esc(b[1]) + ' (' + b[2] + ' m)'; }).join(', ') + '</li>' +
      '<li>Fasilitas belum tersedia di basis data sehingga belum dijadikan kriteria.</li></ul></details>';

    $('tblData').innerHTML = '<tr><th class="n">ID</th><th>Nama</th><th>Kapanewon</th><th>Kalurahan</th><th>Kategori</th><th class="n">Rating</th><th class="n">Ulasan</th><th class="n">Biaya</th><th>Status</th></tr>' +
      DESTS.map(function (d) {
        return '<tr><td class="n">' + d.id + '</td><td>' + esc(d.nama) + '</td><td>' + esc(d.kecamatan || '-') + '</td><td>' + esc(d.desa || '-') + '</td><td>' + esc(d.kategori) +
          '</td><td class="n">' + (d.rating == null ? '–' : num(d.rating, 1)) + '</td><td class="n">' + (d.ulasan == null ? '–' : num(d.ulasan)) + '</td><td class="n">' + rp(d.biaya_rp) +
          '</td><td>' + esc(d.status_wilayah) + '</td></tr>';
      }).join('');
    $('buildInfo').textContent = 'Data dibangun ' + C.tanggal_build + ' · ' + DESTS.length + ' destinasi · ' + window.JALAN.features.length + ' segmen jalan RBI';
  }
  $('dlGeo').addEventListener('click', function () { download('wisata_kulonprogo_utara.geojson', JSON.stringify(window.WISATA), 'application/geo+json'); });
  $('dlCsv').addEventListener('click', function () {
    var cols = ['id', 'nama', 'kecamatan', 'desa', 'kategori', 'lat', 'lon', 'rating', 'ulasan', 'harga_teks', 'biaya_rp', 'biaya_skala', 'durasi_jam', 'jam', 'status_wilayah'];
    var lines = [cols.join(',')].concat(DESTS.map(function (d) {
      return cols.map(function (c) { var v = d[c]; return v == null ? '' : '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
    }));
    download('wisata_kulonprogo_utara.csv', '﻿' + lines.join('\n'), 'text/csv');
  });

  /* ------------------------------------------------------------ kartu ringkasan kriteria */
  function kriteriaText(o) {
    return [
      ['Lokasi awal', o.origin ? o.origin.label : 'belum ditentukan'],
      ['Jenis wisata', teksPilihan('kat', o.kat)],
      ['Waktu', o.jam == null ? 'Tidak dibatasi' : num(o.jam, o.jam % 1 ? 1 : 0) + ' jam (termasuk perjalanan)'],
      ['Biaya', teksPilihan('biaya', o.biaya)],
      ['Rating', teksPilihan('rating', o.rating)]
    ];
  }
  function renderKriteriaCard() {
    var o = { origin: S.origin, kat: S.pilih.kat, jam: $('jamFree').checked ? null : parseFloat($('jam').value), biaya: S.pilih.biaya, rating: S.pilih.rating };
    $('kriteriaList').innerHTML = kriteriaText(o).map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
  }

  /* ------------------------------------------------------------ panduan awal (5 pertanyaan) */
  var WQ = [
    ['Dari mana Anda akan memulai perjalanan?', 'Gunakan lokasi Anda saat ini, klik titik pada peta, atau cari nama tempat.'],
    ['Jenis wisata apa yang ingin Anda kunjungi?', 'Boleh memilih lebih dari satu, atau "Pilih semua".'],
    ['Berapa lama waktu yang Anda miliki untuk berwisata termasuk perjalanan?', 'Waktu ini mencakup perjalanan dan lama kunjungan di setiap destinasi.'],
    ['Berapa anggaran maksimum yang ingin Anda keluarkan?', 'Pilih satu atau beberapa kelas biaya tiket masuk per orang, atau "Pilih semua".'],
    ['Berapa rating minimum destinasi wisata yang Anda inginkan?', 'Pilih satu atau beberapa kelas rating (Google Maps, skala 1–5), atau "Pilih semua".'],
    ['Periksa kembali pilihan Anda', 'Jika sudah sesuai, tekan "Tampilkan Rekomendasi". Pilihan dapat diubah kapan saja melalui tombol "Ubah preferensi".']
  ];
  var KAT_DESC = {
    'Wisata Alam': 'Air terjun, sungai, goa, puncak dan bukit', 'Wisata Alam-Buatan': 'Embung, jembatan, dan taman bernuansa alam',
    'Religi dan Budaya': 'Gua Maria, gereja, makam, dan candi', 'Agrowisata': 'Kebun teh, krisan, dan pertanian lokal',
    'Akomodasi dan Rekreasi': 'Glamping, resort, desa wisata, dan rekreasi'
  };
  var SUB_BIAYA = { gratis: 'Tanpa tiket', b10: 'Hemat', b25: 'Menengah', b50: 'Leluasa', b100: 'Termasuk sebagian paket', b100p: 'Penginapan & paket' };
  var SUB_RATING = { r45: 'Istimewa', r40: 'Sangat baik', r35: 'Baik', r30: 'Cukup', r0: 'Kurang', rna: 'Destinasi baru/kurang dikenal' };
  var W = { step: 0, origin: null, jam: 6, kat: new Set(), biaya: new Set(), rating: new Set() };
  var wzMap = null, wzMarker = null;
  var JAM_OPTS = [['2 jam', 'Singgah singkat', 2], ['4 jam', 'Setengah hari', 4], ['6 jam', 'Sebagian besar hari', 6], ['8 jam', 'Seharian penuh', 8], ['Tidak dibatasi', 'Tanpa batas waktu', null]];
  function wzJam() {
    var box = $('wzJam');
    box.innerHTML = JAM_OPTS.map(function (o, i) { return '<button type="button" class="wz-opt" data-i="' + i + '"><b>' + o[0] + '</b><small>' + o[1] + '</small></button>'; }).join('');
    box.querySelectorAll('.wz-opt').forEach(function (b) {
      b.addEventListener('click', function () { W.jam = JAM_OPTS[+b.dataset.i][2]; $('wzJamCustom').value = ''; wzMark(); wzUpdateNav(); });
    });
  }
  // pilihan ganda: tombol "Pilih semua" + opsi yang dapat dicentang satu per satu
  function wzMulti(boxId, key, kartu) {
    var g = GRUP[key], box = $(boxId);
    var semua = '<button type="button" class="' + (kartu ? 'wz-card' : 'wz-opt') + ' all" data-all="1"><span class="tick" aria-hidden="true"></span>' +
      (kartu ? '<span class="ic ic-all"><svg viewBox="0 0 16 16"><path d="M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2zm7 0h5v5H9z"/></svg></span><span><b>Pilih semua</b><small>Semua jenis wisata · ' + DALAM.length + ' destinasi</small></span>'
        : '<b>Pilih semua</b><small>' + DALAM.length + ' destinasi</small>') + '</button>';
    box.innerHTML = semua + g.map(function (o) {
      if (kartu) {
        return '<button type="button" class="wz-card" data-id="' + esc(o.id) + '"><span class="tick" aria-hidden="true"></span><span class="ic" style="background:' + KAT_COLOR[o.id] + '"><svg viewBox="0 0 16 16">' + KAT_ICON[o.id] + '</svg></span>' +
          '<span><b>' + esc(o.label) + '</b><small>' + esc(KAT_DESC[o.id]) + ' · ' + o.n + ' destinasi</small></span></button>';
      }
      var sub = (key === 'biaya' ? SUB_BIAYA : SUB_RATING)[o.id];
      return '<button type="button" class="wz-opt" data-id="' + esc(o.id) + '"><span class="tick" aria-hidden="true"></span><b>' + esc(o.label) + '</b><small>' + sub + ' · ' + o.n + ' destinasi</small></button>';
    }).join('');
    box.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var set = W[key];
        if (b.dataset.all) { if (set.size === g.length) set.clear(); else g.forEach(function (o) { set.add(o.id); }); }
        else if (set.has(b.dataset.id)) set.delete(b.dataset.id); else set.add(b.dataset.id);
        wzMark(); wzUpdateNav();
      });
    });
  }
  function wzBuild() {
    $('wzFacts').innerHTML = '<li><b>' + DALAM.length + '</b><span>Destinasi</span></li><li><b>3</b><span>Kapanewon</span></li><li><b>5</b><span>Kategori</span></li>';
    wzMulti('wzKat', 'kat', true);
    wzJam();
    wzMulti('wzAng', 'biaya', false);
    wzMulti('wzRating', 'rating', false);
    $('wzJamCustom').addEventListener('input', function (e) { var v = parseFloat(e.target.value); if (v > 0) W.jam = v; wzMark(); wzUpdateNav(); });
  }
  function wzMark() {
    [['wzKat', 'kat'], ['wzAng', 'biaya'], ['wzRating', 'rating']].forEach(function (p) {
      var set = W[p[1]], penuh = set.size === GRUP[p[1]].length;
      $(p[0]).querySelectorAll('button').forEach(function (b) {
        var on = b.dataset.all ? penuh : set.has(b.dataset.id);
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      });
    });
    var custom = $('wzJamCustom').value !== '';
    $('wzJam').querySelectorAll('.wz-opt').forEach(function (b) {
      var on = !custom && JAM_OPTS[+b.dataset.i][2] === W.jam;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    });
  }
  function wzSetOrigin(lat, lon, label) {
    W.origin = { lat: lat, lon: lon, label: label };
    if (wzMap) {
      if (wzMarker) wzMarker.setLatLng([lat, lon]);
      else wzMarker = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="mk-origin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(wzMap);
      if (!wzMap.getBounds().contains([lat, lon])) wzMap.setView([lat, lon], 11);
    }
    var o = $('wzOrigin'); o.className = 'origin set';
    o.textContent = 'Titik awal: ' + label + ' (' + lat.toFixed(5) + ', ' + lon.toFixed(5) + ')';
    wzUpdateNav();
  }
  function wzInitMap() {
    if (wzMap) { setTimeout(function () { wzMap.invalidateSize(); }, 60); return; }
    wzMap = L.map('wzMap', { zoomControl: true, attributionControl: true }).setView([-7.705, 110.185], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(wzMap);
    L.geoJSON(window.KAPANEWON, {
      filter: function (f) { return f.properties.target; }, interactive: false,
      style: { color: '#1f5f4a', weight: 2, fillColor: '#1f5f4a', fillOpacity: 0.06 }
    }).addTo(wzMap);
    DESTS.forEach(function (d) {
      if (d.in_scope) L.circleMarker([d.lat, d.lon], { radius: 3.5, color: '#fff', weight: 1, fillColor: KAT_COLOR[d.kategori], fillOpacity: 1, interactive: false }).addTo(wzMap);
    });
    wzMap.on('click', function (e) { wzSetOrigin(e.latlng.lat, e.latlng.lng, 'Titik pilihan pada peta'); });
    setTimeout(function () { wzMap.invalidateSize(); wzMap.fitBounds([[-7.79, 110.10], [-7.63, 110.28]]); }, 80);
    if (W.origin) wzSetOrigin(W.origin.lat, W.origin.lon, W.origin.label);
  }
  function wzValid() {
    if (W.step === 0) return !!W.origin;
    if (W.step === 1) return W.kat.size > 0;
    if (W.step === 2) return W.jam === null || W.jam > 0;
    if (W.step === 3) return W.biaya.size > 0;
    if (W.step === 4) return W.rating.size > 0;
    return true;
  }
  function wzUpdateNav() {
    $('wzNext').disabled = !wzValid();
    $('wzNext').textContent = W.step === 5 ? 'Tampilkan Rekomendasi' : 'Lanjut';
    $('wzBack').style.visibility = W.step === 0 ? 'hidden' : 'visible';
  }
  function wzGo(step) {
    W.step = step;
    document.querySelectorAll('.wz-pane').forEach(function (p) { p.classList.toggle('active', +p.dataset.step === step); });
    $('wzQ').textContent = WQ[step][0]; $('wzHelp').textContent = WQ[step][1];
    $('wzStepLbl').textContent = step < 5 ? 'Langkah ' + (step + 1) + ' dari 5' : 'Ringkasan';
    $('wzBar').style.width = ((step + 1) / 6 * 100) + '%';
    if (step === 0) wzInitMap();
    if (step === 5) {
      $('wzSummary').innerHTML = kriteriaText(W).map(function (r, i) {
        return '<div><dt>' + (i + 1) + '. ' + r[0] + ' <button type="button" class="link" data-go="' + i + '">ubah</button></dt><dd>' + esc(r[1]) + '</dd></div>';
      }).join('');
      $('wzSummary').querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { wzGo(+b.dataset.go); }); });
    }
    wzMark(); wzUpdateNav();
    $('wzQ').focus({ preventScroll: true });
  }
  function openWizard() {
    if (S.origin) W.origin = Object.assign({}, S.origin);
    if (S.sudahCari) { W.kat = new Set(S.pilih.kat); W.biaya = new Set(S.pilih.biaya); W.rating = new Set(S.pilih.rating); }
    $('wizard').hidden = false;
    wzGo(0);
  }
  function closeWizard() { $('wizard').hidden = true; setTimeout(function () { map.invalidateSize(); }, 50); }
  function wzFinish() {
    // terapkan jawaban ke formulir rekomendasi, lalu jalankan perhitungan
    setOrigin(W.origin.lat, W.origin.lon, W.origin.label);
    S.pilih = { kat: new Set(W.kat), biaya: new Set(W.biaya), rating: new Set(W.rating) };
    S.sudahCari = true;
    renderSemuaGrupManual();
    $('jamFree').checked = W.jam === null; $('jam').disabled = W.jam === null; if (W.jam !== null) $('jam').value = W.jam;
    closeWizard();
    showTab('rekom');
    renderKriteriaCard();
    $('fRekom').requestSubmit ? $('fRekom').requestSubmit() : $('btnCari').click();
  }  $('wzNext').addEventListener('click', function () {
    if (!wzValid()) return;
    if (W.step < 5) wzGo(W.step + 1); else wzFinish();
  });
  $('wzBack').addEventListener('click', function () { if (W.step > 0) wzGo(W.step - 1); });
  $('wzSkip').addEventListener('click', function () { closeWizard(); showTab('jelajah'); });
  $('btnWizard').addEventListener('click', openWizard);
  $('btnWizard2').addEventListener('click', openWizard);
  $('wizard').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') { e.preventDefault(); $('wzNext').click(); }
  });
  $('wzGps').addEventListener('click', function () {
    if (!navigator.geolocation) { toast('Peramban tidak mendukung geolokasi'); return; }
    toast('Mengambil lokasi…');
    navigator.geolocation.getCurrentPosition(function (p) {
      wzSetOrigin(p.coords.latitude, p.coords.longitude, 'Lokasi saya (±' + Math.round(p.coords.accuracy) + ' m)');
    }, function (err) { toast('Lokasi tidak dapat diambil (' + err.message + '). Klik titik pada peta.', 5000); }, { enableHighAccuracy: true, timeout: 10000 });
  });
  function wzGeocode() { geocodeTo('wzGeoQ', 'wzGeoRes', wzSetOrigin); }
  $('wzGeoBtn').addEventListener('click', wzGeocode);
  $('wzGeoQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); wzGeocode(); } });
  document.querySelectorAll('[data-wpreset]').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.dataset.wpreset;
      if (PRESET_ORIGIN[k]) { var p = PRESET_ORIGIN[k]; wzSetOrigin(p.lat, p.lon, p.label); return; }
      var d = DESTS.find(function (x) { return x.nama.toLowerCase().indexOf(k === 'mudal' ? 'ekowisata sungai mudal' : 'sendangsono') >= 0; });
      if (d) wzSetOrigin(d.lat, d.lon, d.nama);
    });
  });

  /* ------------------------------------------------------------ mulai */
  renderStats(); renderChips(); renderList(); buildSliders(); markPreset('ahp');
  renderKriteria(); buildAhp(); renderData();

  // Tampilan awal = 3 kapanewon. Ditunda sampai kontainer peta punya ukuran (panel bisa tersembunyi/kecil saat dimuat)
  var fitted = false;
  function fitKajian() {
    var b = L.latLngBounds([]);
    lyrKec.eachLayer(function (l) { if (l.feature.properties.target) b.extend(l.getBounds()); });
    map.fitBounds(b, { padding: [20, 20] });
  }
  function onSize() {
    map.invalidateSize();
    if (!fitted && map.getSize().y > 80 && map.getSize().x > 80) { fitted = true; fitKajian(); }
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onSize).observe($('map'));
  window.addEventListener('resize', onSize);
  onSize();

  // Desktop: hanya panel yang bergulir; halaman tetap di posisi atas (mis. setelah scrollIntoView)
  window.addEventListener('scroll', function () { if (window.innerWidth > 900 && (window.scrollY || window.scrollX)) window.scrollTo(0, 0); });

  // Saat pengguna masuk: tampilkan panduan 5 pertanyaan terlebih dahulu
  wzBuild();
  if (/[?&]tanpa-panduan\b/.test(location.search)) closeWizard(); else openWizard();
})();
