#!/usr/bin/env python3
"""Draw a smooth, organic "region to explore" polygon around a set of anchor
points (towns, villages, sights) and print it as GeoJSON geometry, ready to
paste into public/data/places.json ("kind": "region", "geometry": ...).

Usage:
    python3 scripts/region_from_points.py [--km 6] [--path] [--clip build/admin.geojson] LON,LAT LON,LAT ...

  --km    buffer around the anchors in kilometres (default 6)
  --path  buffer the line through the anchors in the given order (valleys,
          rivers, road trips) instead of their convex hull
  --clip  clip to China's outline (provinces from scripts/build_boundaries.py),
          so regions near borders don't spill into neighbouring countries

Alternatively draw regions by hand at https://geojson.io.
"""
import argparse, json, math
from shapely.geometry import MultiPoint, LineString, shape, mapping
from shapely.ops import unary_union


def region(points, km=6.0, path=False, clip=None):
    lat0 = sum(p[1] for p in points) / len(points)
    kx = math.cos(math.radians(lat0))
    # work in a locally equal-distance frame (x scaled by cos(lat)) so buffers are round
    pts = [(x * kx, y) for x, y in points]
    r = km / 111.0
    core = LineString(pts) if path and len(pts) > 1 else MultiPoint(pts).convex_hull
    g = core.buffer(r, quad_segs=24).buffer(r * 0.4, quad_segs=24).buffer(-r * 0.4, quad_segs=24)
    g = g.simplify(r * 0.04)
    from shapely import affinity
    g = affinity.scale(g, xfact=1 / kx, yfact=1, origin=(0, 0))
    if clip is not None:
        g = g.intersection(clip)
    return g


def china_outline(admin_path):
    feats = json.load(open(admin_path))["features"]
    return unary_union([shape(f["geometry"]).buffer(0) for f in feats if f["properties"]["level"] in (3, 4)]).buffer(0.01)


def rounded(g, nd=3):
    def r(o):
        return [r(x) for x in o] if isinstance(o, (list, tuple)) else round(o, nd)
    m = mapping(g)
    return {"type": m["type"], "coordinates": r(m["coordinates"])}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--km", type=float, default=6)
    ap.add_argument("--path", action="store_true")
    ap.add_argument("--clip")
    ap.add_argument("points", nargs="+")
    a = ap.parse_args()
    pts = [tuple(map(float, p.split(","))) for p in a.points]
    clip = china_outline(a.clip) if a.clip else None
    print(json.dumps(rounded(region(pts, a.km, a.path, clip)), separators=(",", ":")))
