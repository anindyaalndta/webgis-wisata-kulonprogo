// Memuat data/data.js (format window.X = ...) ke Node tanpa browser
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadData() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'data.js'), 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const w = ctx.window;
  const dests = w.WISATA.features.map((f) => Object.assign({}, f.properties, { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  const idx = {};
  w.MATRIKS.ids.forEach((id, i) => { idx[id] = i; });
  const antar = (a, b) => w.MATRIKS.dur[idx[a]][idx[b]];
  // titik awal = lokasi destinasi tertentu -> waktu tempuh diambil dari baris matriks OSRM
  const travelFrom = (originId) => (d) => ({ dur: w.MATRIKS.dur[idx[originId]][idx[d.id]], dist: w.MATRIKS.dist[idx[originId]][idx[d.id]] });
  return { w, dests, antar, travelFrom, idx };
}

module.exports = { loadData };
