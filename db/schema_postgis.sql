-- Skema basis data WebGIS Wisata Kulon Progo Utara (PostgreSQL 15 + PostGIS 3)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS kategori_wisata (
  id_kategori SMALLSERIAL PRIMARY KEY,
  nama        TEXT UNIQUE NOT NULL,
  durasi_jam  NUMERIC(3,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS destinasi_wisata (
  id            INTEGER PRIMARY KEY,
  nama          TEXT NOT NULL,
  id_kategori   SMALLINT REFERENCES kategori_wisata(id_kategori),
  kecamatan     TEXT, kalurahan TEXT, kabupaten TEXT,
  jenis_google  TEXT,
  deskripsi     TEXT,
  rating        NUMERIC(2,1),
  ulasan        INTEGER,
  harga_teks    TEXT, paket_teks TEXT, makan_teks TEXT,
  jam_operasional TEXT, hari_operasional TEXT,
  biaya_rp      INTEGER NOT NULL,
  biaya_skala   SMALLINT NOT NULL CHECK (biaya_skala BETWEEN 1 AND 5),
  biaya_dasar   TEXT,
  biaya_estimasi BOOLEAN NOT NULL DEFAULT FALSE,
  menginap      BOOLEAN NOT NULL DEFAULT FALSE,
  durasi_jam    NUMERIC(3,2) NOT NULL,
  dalam_cakupan BOOLEAN NOT NULL,
  gmaps_url     TEXT,
  no_asal       TEXT,
  catatan       TEXT,
  geom          geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_destinasi_geom ON destinasi_wisata USING GIST (geom);

CREATE TABLE IF NOT EXISTS kriteria (
  kode TEXT PRIMARY KEY, nama TEXT NOT NULL, sifat TEXT NOT NULL CHECK (sifat IN ('benefit','cost')),
  satuan TEXT, sumber TEXT, bobot_default NUMERIC(6,5) NOT NULL
);

-- Matriks waktu/jarak antar-destinasi berdasarkan jaringan jalan (OSRM)
CREATE TABLE IF NOT EXISTS matriks_jalan (
  id_asal INTEGER REFERENCES destinasi_wisata(id), id_tujuan INTEGER REFERENCES destinasi_wisata(id),
  durasi_detik INTEGER NOT NULL, jarak_meter INTEGER NOT NULL, PRIMARY KEY (id_asal, id_tujuan)
);

-- Contoh query: destinasi dalam cakupan pada radius 10 km dari titik awal
-- SELECT nama, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(110.2255,-7.6680),4326)::geography) AS jarak_m
-- FROM destinasi_wisata WHERE dalam_cakupan ORDER BY jarak_m LIMIT 10;
