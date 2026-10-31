#!/usr/bin/env python3
"""Turn the curated zone definitions (scripts/health_zones.json) into
public/data/health.json by dissolving the referenced admin boundaries.

Usage:
    python3 scripts/build_boundaries.py china-latest.osm.pbf build/admin.geojson   # once
    python3 scripts/build_health.py build/admin.geojson public/data/health.json [ne_10m_land.shp]

The optional Natural Earth land shapefile clips zones to the coastline (admin
boundaries include territorial waters):
    https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip   (pip install pyshp)

Edit scripts/health_zones.json (text, members, colors) and re-run to update.
"""
import json, sys
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ADMIN, OUT = sys.argv[1], sys.argv[2]
LAND = None
if len(sys.argv) > 3:
    import shapefile
    from shapely.geometry import box
    clip = box(95, 15, 125, 35)
    LAND = unary_union([shape(s.__geo_interface__).intersection(clip)
                        for s in shapefile.Reader(sys.argv[3]).shapes()
                        if box(*s.bbox).intersects(clip)]).buffer(0)
cfg = json.load(open(Path(__file__).with_name("health_zones.json")))
admin = json.load(open(ADMIN))["features"]


def geoms(names):
    out = []
    for n in names:
        hits = [shape(f["geometry"]).buffer(0) for f in admin if f["properties"]["name"] == n]
        if not hits:
            print(f"WARNING: no boundary named {n}", file=sys.stderr)
        out += hits
    return out


def rnd(o):
    return [rnd(x) for x in o] if isinstance(o, (list, tuple)) else round(o, 3)


groups = {g["id"]: g for g in cfg["groups"]}
features = []
for z in cfg["zones"]:
    g = unary_union(geoms(z["members"]))
    if z.get("minus"):
        g = g.difference(unary_union(geoms(z["minus"])).buffer(0.002))
    if LAND is not None:
        g = g.intersection(LAND)
    g = g.simplify(0.01, preserve_topology=True)
    gm = mapping(g)
    props = {k: v for k, v in z.items() if k not in ("members", "minus")}
    props.update(severity=z["level"], group_label=groups[z["group"]]["label"], as_of=cfg["as_of"],
                 dashed=bool(z.get("dashed")))
    features.append({"type": "Feature", "properties": props,
                     "geometry": {"type": gm["type"], "coordinates": rnd(gm["coordinates"])}})

json.dump({"groups": cfg["groups"], "general_note": cfg["general_note"],
           "zones": {"type": "FeatureCollection", "features": features}},
          open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(features)} zones -> {OUT}", file=sys.stderr)
