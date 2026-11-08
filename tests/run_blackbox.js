// Menjalankan tests/blackbox_ui.js secara otomatis di Edge/Chrome headless dan menyimpan hasil ke docs/hasil_blackbox.json
//   (server harus berjalan: node serve.js)   node tests/run_blackbox.js [path-peramban]
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const exe = process.argv[2] || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: 'new' });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto('http://localhost:8080/', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));
  await p.addScriptTag({ url: '/tests/blackbox_ui.js?' + Date.now() });
  await p.waitForFunction('window.HASIL_UJI_RINGKAS', { timeout: 180000 });
  const res = await p.evaluate(() => ({ ringkas: window.HASIL_UJI_RINGKAS, uji: window.HASIL_UJI, ua: navigator.userAgent }));
  const ver = (res.ua.match(/Edg\/(\d+)/) || res.ua.match(/Chrome\/(\d+)/) || [])[1];
  const out = { tanggal: new Date().toISOString().slice(0, 10), peramban: 'Microsoft Edge ' + ver + ' (headless, Windows 11), viewport 1440x900', ringkas: res.ringkas, galat_halaman: errs, uji: res.uji };
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'hasil_blackbox.json'), JSON.stringify(out, null, 1));
  res.uji.forEach((u) => console.log(String(u.No).padStart(2), u.Status.padEnd(12), u.Fitur, '|', u.Hasil.slice(0, 110)));
  console.log(res.ringkas, errs.length ? 'GALAT: ' + errs.join('; ') : '');
  await b.close();
})();
