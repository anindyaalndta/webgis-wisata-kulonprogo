# Rekomendasi Destinasi — WebGIS Wisata Kulon Progo Utara

Sistem rekomendasi destinasi dan rute wisata untuk Kapanewon **Girimulyo, Kalibawang, dan Samigaluh** (AHP–SAW + nearest neighbour di jaringan jalan OSRM).
Proyek Rekayasa Geodesi-Geomatika, Departemen Teknik Geodesi FT UGM, 2026.

## Cara kerja singkat
1. Saat halaman dibuka, pengguna menjawab **5 pertanyaan**: lokasi awal, jenis wisata, waktu, kelas biaya, dan kelas rating. Jenis wisata, biaya, dan rating dapat dipilih lebih dari satu (atau semuanya).
2. Sistem menghitung waktu tempuh ke semua destinasi (OSRM), menyaring destinasi sesuai jawaban, lalu memberi peringkat dengan SAW (bobot AHP).
3. Sepuluh destinasi teratas disusun menjadi rute dengan *nearest neighbour* tanpa melewati batas waktu/anggaran.
4. **Navigasi di dalam WebGIS** (tanpa Google Maps): petunjuk belok-demi-belok berbahasa Indonesia, pelacakan GPS, hitung ulang rute saat keluar jalur, panduan suara, dan mode simulasi untuk presentasi. GPS di ponsel hanya aktif bila situs dibuka lewat HTTPS (GitHub Pages/Vercel) atau localhost.

## Menjalankan
```bash
node serve.js
```
Lalu buka http://localhost:8080. Halaman juga bisa dibuka langsung dengan klik ganda `index.html`, tetapi fitur "Gunakan lokasi saya" hanya berjalan lewat server. Peta dasar, routing OSRM, dan pencarian lokasi memerlukan internet; jika OSRM tidak dapat dijangkau, sistem memakai estimasi cadangan.

Opsi URL `?tanpa-panduan` membuka aplikasi langsung tanpa panduan (untuk demo/penguji).

## Struktur
| Folder | Isi |
|---|---|
| `index.html`, `css/`, `js/app.js` | Antarmuka (panduan 5 pertanyaan, peta Leaflet, tab-tab) |
| `js/rekom.js` | Inti perhitungan AHP, penyaringan, SAW, rute (tanpa dependensi, teruji) |
| `js/navigasi.js` | Navigasi: terjemahan petunjuk OSRM, proyeksi posisi GPS ke rute, deteksi keluar jalur (teruji) |
| `data/` | Data hasil pipeline (`data.js`, GeoJSON, matriks OSRM, config) |
| `db/` | GeoPackage 1.2 (QGIS/ArcGIS), Shapefile cadangan (`db/shp/`), CSV bersih, skema & data SQL PostGIS |
| `pipeline/` | `build_data.py`, `make_figures.py`, `make_excel.py`, `to_jpg.py`, `make_report.js`, `finalize_docx.ps1` |
| `tests/` | Uji unit, validasi silang Python, uji black-box antarmuka |
| `docs/` | Laporan (.docx/.pdf), workbook validasi & instrumen kuesioner, hasil uji, gambar |

## Memperbarui data / bobot
Gunakan Python bawaan QGIS (sudah berisi GDAL, Shapely, NumPy, openpyxl):
```bash
"C:\Program Files\QGIS 3.44.11\apps\Python312\python.exe" pipeline/build_data.py <RBI25K_KULONPROGOgdb.gdb> "<Database Potensi Wisata.xlsx>" .
```
Bobot AHP default diatur pada `AHP_DEFAULT` di `pipeline/build_data.py`. Ganti nilainya dengan rata-rata geometris hasil kuesioner (lihat `docs/Instrumen_Kuesioner_AHP_SUS.xlsx`), lalu jalankan ulang pipeline.

## Pengujian
```bash
npm test
```
- `node tests/export_scenarios.js`, lalu `python tests/cross_check.py`: validasi silang terhadap perhitungan independen.
- `node tests/run_blackbox.js`: 35 skenario black-box di Edge headless. Membutuhkan `puppeteer-core` dan server yang sedang berjalan.

## Panduan tim
Langkah pengerjaan dari awal sampai publikasi (5 anggota, 40 langkah, beserta gerbang mutu dan daftar perbaikan) ada di `docs/Panduan_Pengerjaan_Step_by_Step.docx` / `.pdf`.

## Deployment (GitHub Pages)
1. Unggah seluruh isi folder ini ke akar repositori (`index.html` harus berada di akar).
2. Buka **Settings → Pages**, pilih *Deploy from a branch*, cabang **main**, folder **/(root)**, lalu **Save**.
3. Tautan web: `https://<akun>.github.io/<nama-repositori>/` (HTTPS, sehingga GPS dan navigasi berfungsi di ponsel).

## Catatan penting
- Bobot AHP saat ini masih **penilaian sementara tim** (CR 0,017) dan harus diganti dengan hasil kuesioner.
- Uji SUS belum dilaksanakan; tabelnya di laporan sengaja dikosongkan.
- Data rating, ulasan, harga, dan jam operasional berasal dari Google Maps dan perlu *ground check*.
