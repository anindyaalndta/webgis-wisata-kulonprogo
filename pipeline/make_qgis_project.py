# -*- coding: utf-8 -*-
"""Membuat proyek QGIS siap pakai (db/Peta_Wisata_KulonProgo_Utara.qgz) berisi lapisan GeoPackage + simbologi.
   Jalankan dengan Python QGIS (qgis.core):  python make_qgis_project.py <ROOT_PROYEK>"""
import sys, os
from qgis.core import (QgsApplication, QgsProject, QgsVectorLayer, QgsCategorizedSymbolRenderer, QgsRendererCategory,
                       QgsMarkerSymbol, QgsFillSymbol, QgsLineSymbol, QgsRuleBasedRenderer, QgsCoordinateReferenceSystem,
                       QgsPalLayerSettings, QgsVectorLayerSimpleLabeling, QgsTextFormat, QgsTextBufferSettings, QgsRasterLayer)
from qgis.PyQt.QtGui import QColor, QFont

ROOT = sys.argv[1]
DB = os.path.join(ROOT, 'db')
GP = os.path.join(DB, 'wisata_kulonprogo_utara.gpkg')
OUT = os.path.join(DB, 'Peta_Wisata_KulonProgo_Utara.qgz')

app = QgsApplication([], False); app.initQgis()
prj = QgsProject.instance()
prj.setCrs(QgsCoordinateReferenceSystem('EPSG:4326'))
prj.setTitle('Peta Wisata Kapanewon Girimulyo, Kalibawang, Samigaluh')

def lyr(name, title):
    l = QgsVectorLayer(f'{GP}|layername={name}', title, 'ogr')
    assert l.isValid(), name
    return l

# basemap OSM (XYZ)
osm = QgsRasterLayer('type=xyz&url=https://tile.openstreetmap.org/{z}/{x}/{y}.png&zmax=19&zmin=0', 'OpenStreetMap', 'wms')
if osm.isValid():
    prj.addMapLayer(osm)

kec = lyr('kapanewon', 'Batas Kapanewon')
root = QgsRuleBasedRenderer.Rule(None)
r1 = QgsRuleBasedRenderer.Rule(QgsFillSymbol.createSimple({'color': '31,95,74,25', 'outline_color': '31,95,74', 'outline_width': '0.8'}), filterExp='"target" = 1', label='Kapanewon kajian')
r2 = QgsRuleBasedRenderer.Rule(QgsFillSymbol.createSimple({'color': '0,0,0,0', 'outline_color': '120,130,125', 'outline_width': '0.3', 'outline_style': 'dash'}), filterExp='"target" = 0', label='Wilayah sekitar')
root.appendChild(r1); root.appendChild(r2)
kec.setRenderer(QgsRuleBasedRenderer(root))
pal = QgsPalLayerSettings(); pal.fieldName = 'kecamatan'; pal.enabled = True
fmt = QgsTextFormat(); fmt.setFont(QFont('Arial', 9, QFont.Bold)); fmt.setColor(QColor('#1f5f4a'))
buf = QgsTextBufferSettings(); buf.setEnabled(True); buf.setSize(1); buf.setColor(QColor('white')); fmt.setBuffer(buf)
pal.setFormat(fmt)
kec.setLabeling(QgsVectorLayerSimpleLabeling(pal)); kec.setLabelsEnabled(True)
prj.addMapLayer(kec)

des = lyr('kalurahan', 'Batas Kalurahan')
des.setRenderer(des.renderer().clone())
des.renderer().setSymbol(QgsFillSymbol.createSimple({'color': '0,0,0,0', 'outline_color': '63,122,99', 'outline_width': '0.2', 'outline_style': 'dot'}))
prj.addMapLayer(des)

jal = lyr('jalan', 'Jaringan Jalan (RBI 1:25.000)')
cats = []
for val, col, w in [('Arteri', '#e3632d', '0.9'), ('Kolektor', '#f2a93b', '0.6'), ('Lokal', '#d8c79a', '0.3')]:
    cats.append(QgsRendererCategory(val, QgsLineSymbol.createSimple({'color': col, 'width': w}), 'Jalan ' + val))
jal.setRenderer(QgsCategorizedSymbolRenderer('kelas', cats))
prj.addMapLayer(jal)

wis = lyr('wisata', 'Destinasi Wisata')
KC = {'Wisata Alam': '#2f8f5b', 'Wisata Alam-Buatan': '#2c7fb8', 'Religi dan Budaya': '#8a4fa3', 'Agrowisata': '#c9921a', 'Akomodasi dan Rekreasi': '#d0573a'}
cats = [QgsRendererCategory(k, QgsMarkerSymbol.createSimple({'name': 'circle', 'color': c, 'outline_color': 'white', 'size': '3'}), k) for k, c in KC.items()]
wis.setRenderer(QgsCategorizedSymbolRenderer('kategori', cats))
prj.addMapLayer(wis)

prj.writeEntryBool('Paths', '/Absolute', False)      # path relatif: folder db/ bisa dipindah utuh
ok = prj.write(OUT)
print('tersimpan', ok, OUT)

# verifikasi: buka ulang proyek
prj.clear()
prj.read(OUT)
for l in prj.mapLayers().values():
    print(' -', l.name(), 'valid=', l.isValid(), 'n=', l.featureCount() if hasattr(l, 'featureCount') else '-')
app.exitQgis()
