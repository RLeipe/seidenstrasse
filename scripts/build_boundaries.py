#!/usr/bin/env python3
"""Extract simplified province (admin_level 4) and prefecture (admin_level 5)
boundaries for China, Hong Kong and Macau from an OSM PBF extract.

Usage:
    python3 scripts/build_boundaries.py china-latest.osm.pbf build/admin.geojson
Output is an intermediate file consumed by build_disease.py (not served).
Requires: pip install osmium shapely
"""
import json, sys
import osmium
from shapely import wkb as shapely_wkb
from shapely.geometry import mapping

PBF, OUT = sys.argv[1], sys.argv[2]
fab = osmium.geom.WKBFactory()
feats = []
fp = osmium.FileProcessor(PBF).with_areas(osmium.filter.TagFilter(("boundary", "administrative")))
for obj in fp:
    if not isinstance(obj, osmium.osm.Area):
        continue
    lvl = obj.tags.get("admin_level")
    if lvl not in ("3", "4", "5"):
        continue
    try:
        g = shapely_wkb.loads(fab.create_multipolygon(obj), hex=True)
    except Exception as e:  # broken multipolygons
        print("skip", obj.tags.get("name"), e, file=sys.stderr)
        continue
    g = g.simplify(0.004, preserve_topology=True)
    feats.append({"type": "Feature",
                  "properties": {"level": int(lvl), "name": obj.tags.get("name:zh") or obj.tags.get("name"),
                                 "name_en": obj.tags.get("name:en", ""), "osm": obj.orig_id()},
                  "geometry": mapping(g)})
    print(lvl, obj.tags.get("name"), obj.tags.get("name:en"), file=sys.stderr)
json.dump({"type": "FeatureCollection", "features": feats}, open(OUT, "w"), ensure_ascii=False)
