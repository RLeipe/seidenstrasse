#!/usr/bin/env python3
"""Fetch an OSM relation/way polygon via Overpass and print a simplified GeoJSON
geometry, ready to paste into public/data/places.json ("geometry": ...).

Usage:
    python3 scripts/osm_area.py relation 13556512 [tolerance_deg=0.002]
    python3 scripts/osm_area.py way 123456

Find IDs on https://www.openstreetmap.org (search the name, click the result).
Data © OpenStreetMap contributors, ODbL.
"""
import json, sys, urllib.parse, urllib.request
from shapely.geometry import LineString, mapping
from shapely.ops import polygonize, unary_union

ENDPOINTS = ["https://overpass-api.de/api/interpreter",
             "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
kind, oid = sys.argv[1], sys.argv[2]
tol = float(sys.argv[3]) if len(sys.argv) > 3 else 0.002
q = f"[out:json][timeout:120];{kind}({oid});out geom;"

data = None
for ep in ENDPOINTS:
    try:
        req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(),
                                     headers={"User-Agent": "seidenstrasse-map/1.0"})
        data = json.load(urllib.request.urlopen(req, timeout=180))
        break
    except Exception as e:
        print(f"{ep}: {e}", file=sys.stderr)
if data is None:
    sys.exit("all Overpass endpoints failed")

el = data["elements"][0]
if kind == "way":
    lines = [LineString([(p["lon"], p["lat"]) for p in el["geometry"]])]
else:
    lines = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
             for m in el["members"] if m["type"] == "way" and m.get("role") in ("outer", "")
             and len(m.get("geometry", [])) > 1]
poly = unary_union(list(polygonize(unary_union(lines))))
poly = poly.simplify(tol, preserve_topology=True)


def rnd(o):
    if isinstance(o, (list, tuple)):
        return [rnd(x) for x in o]
    return round(o, 4)


g = mapping(poly)
print(json.dumps({"type": g["type"], "coordinates": rnd(g["coordinates"])}, separators=(",", ":")))
print(f"# {el.get('tags', {}).get('name')} / {el.get('tags', {}).get('name:en')}", file=sys.stderr)
