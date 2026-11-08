# -*- coding: utf-8 -*-
"""Ekspor data/*.geojson ke format SIG desktop yang kompatibel luas:
   - db/wisata_kulonprogo_utara.gpkg  (GeoPackage 1.2, tipe geometri eksplisit, kolom daftar -> teks)
   - db/shp/*.shp                     (Shapefile cadangan, nama kolom <= 10 karakter)
   python export_gis.py <ROOT_PROYEK>"""
import sys, os, json, glob
from osgeo import ogr, osr

ogr.UseExceptions()
ROOT = sys.argv[1]
DATA, DB = os.path.join(ROOT, 'data'), os.path.join(ROOT, 'db')
LAYERS = [('wisata', ogr.wkbPoint), ('kapanewon', ogr.wkbMultiPolygon), ('kalurahan', ogr.wkbMultiPolygon), ('jalan', ogr.wkbMultiLineString)]
# nama kolom Shapefile (maks. 10 karakter)
SHP_NAMES = {'status_wilayah': 'status', 'biaya_imputed': 'biaya_est', 'biaya_skala': 'biaya_skl', 'biaya_dasar': 'biaya_dsr',
             'harga_teks': 'harga', 'paket_teks': 'paket', 'makan_teks': 'makan', 'durasi_jam': 'durasi', 'gmaps_url': 'gmaps',
             'kabupaten': 'kabupaten', 'kecamatan': 'kapanewon', 'deskripsi': 'deskripsi', 'menginap': 'menginap'}

srs = osr.SpatialReference(); srs.ImportFromEPSG(4326)
srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)

def to_multi(g, t):
    if t == ogr.wkbMultiPolygon and g.GetGeometryType() in (ogr.wkbPolygon, ogr.wkbPolygon25D):
        return ogr.ForceToMultiPolygon(g)
    if t == ogr.wkbMultiLineString and g.GetGeometryType() in (ogr.wkbLineString, ogr.wkbLineString25D):
        return ogr.ForceToMultiLineString(g)
    if t == ogr.wkbMultiPolygon and g.GetGeometryType() == ogr.wkbGeometryCollection:
        return ogr.ForceToMultiPolygon(g)
    return g

def field_type(vals):
    vals = [v for v in vals if v is not None]
    if all(isinstance(v, bool) for v in vals) and vals:
        return ogr.OFTInteger, ogr.OFSTBoolean
    if all(isinstance(v, int) and not isinstance(v, bool) for v in vals) and vals:
        return ogr.OFTInteger, ogr.OFSTNone
    if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vals) and vals:
        return ogr.OFTReal, ogr.OFSTNone
    return ogr.OFTString, ogr.OFSTNone

def norm(v):
    if isinstance(v, list):
        return '; '.join(str(x) for x in v)
    return v

def write(driver, path, layer, gtype, feats, opts, rename=None, ds=None):
    keys = []
    for f in feats:
        for k in f['properties']:
            if k not in keys:
                keys.append(k)
    lyr = ds.CreateLayer(layer, srs, gtype, opts)
    names = {}
    for k in keys:
        t, st = field_type([norm(f['properties'].get(k)) for f in feats])
        fd = ogr.FieldDefn((rename or {}).get(k, k)[:10] if rename is not None else k, t)
        if st != ogr.OFSTNone:
            fd.SetSubType(st)
        if t == ogr.OFTString and rename is not None:
            fd.SetWidth(254)
        lyr.CreateField(fd)
        names[k] = fd.GetName()
    defn = lyr.GetLayerDefn()
    for f in feats:
        ft = ogr.Feature(defn)
        for k in keys:
            v = norm(f['properties'].get(k))
            if v is None:
                continue
            if isinstance(v, bool):
                v = int(v)
            if isinstance(v, str) and rename is not None:
                v = v[:254]
            ft.SetField(names[k], v)
        ft.SetGeometry(to_multi(ogr.CreateGeometryFromJson(json.dumps(f['geometry'])), gtype))
        lyr.CreateFeature(ft)
    return lyr.GetFeatureCount()

# --- GeoPackage
gp = os.path.join(DB, 'wisata_kulonprogo_utara.gpkg')
for ext in ('', '-wal', '-shm', '-journal'):
    if os.path.exists(gp + ext):
        os.remove(gp + ext)
ds = ogr.GetDriverByName('GPKG').CreateDataSource(gp, options=['VERSION=1.2'])
for name, gtype in LAYERS:
    fc = json.load(open(os.path.join(DATA, name + '.geojson'), encoding='utf-8'))
    n = write('GPKG', gp, name, gtype, fc['features'], ['SPATIAL_INDEX=YES', 'GEOMETRY_NAME=geom', 'IDENTIFIER=' + name], ds=ds)
    print('gpkg', name, n)
ds = None

# --- Shapefile cadangan
sd = os.path.join(DB, 'shp'); os.makedirs(sd, exist_ok=True)
for f in glob.glob(os.path.join(sd, '*')):
    os.remove(f)
drv = ogr.GetDriverByName('ESRI Shapefile')
for name, gtype in LAYERS:
    fc = json.load(open(os.path.join(DATA, name + '.geojson'), encoding='utf-8'))
    ds = drv.CreateDataSource(os.path.join(sd, name + '.shp'))
    n = write('ESRI Shapefile', None, name, gtype, fc['features'], ['ENCODING=UTF-8'], rename=SHP_NAMES, ds=ds)
    ds = None
    print('shp', name, n)
