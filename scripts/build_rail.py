#!/usr/bin/env python3
"""Extract China's railway network (high-speed, under construction, conventional)
and railway stations from an OpenStreetMap extract into compact GeoJSON files.

Usage:
    python3 scripts/build_rail.py china-latest.osm.pbf public/data

Input: an OSM PBF extract of China, e.g.
    https://download.openstreetmap.fr/extracts/asia/china-latest.osm.pbf
Requires: pip install osmium shapely pypinyin opencc-python-reimplemented
Data © OpenStreetMap contributors, ODbL.
"""
import json, re, sys
from collections import defaultdict

import osmium
from shapely.geometry import LineString, Point, mapping
from shapely.ops import linemerge
from shapely.strtree import STRtree
from pypinyin import lazy_pinyin
from opencc import OpenCC

T2S = OpenCC("t2s")

PBF, OUT = sys.argv[1], sys.argv[2]

EXCLUDED_STATION_KINDS = {"subway", "light_rail", "monorail", "tram", "funicular"}


def speed(tags):
    m = re.match(r"\d+", tags.get("maxspeed", "") or "")
    return int(m.group()) if m else None


class RailHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.lines = []      # (cls, name, name_en, maxspeed, coords)
        self.stations = []   # dicts

    def _station(self, tags, lon, lat, osm_id):
        if tags.get("railway") != "station":
            return
        if tags.get("station") in EXCLUDED_STATION_KINDS or tags.get("subway") == "yes" \
                or tags.get("light_rail") == "yes" or tags.get("monorail") == "yes":
            return
        name = tags.get("name:zh") or tags.get("name")
        if not name:
            return
        self.stations.append(dict(id=osm_id, lon=lon, lat=lat, name=name,
                                  name_en=tags.get("name:en"), usage=tags.get("usage")))

    def node(self, n):
        if n.tags.get("railway") == "station":
            self._station(n.tags, n.location.lon, n.location.lat, f"n{n.id}")

    def way(self, w):
        t = w.tags
        rw = t.get("railway")
        if rw not in ("rail", "construction", "station"):
            return
        try:
            coords = [(nd.lon, nd.lat) for nd in w.nodes if nd.location.valid()]
        except osmium.InvalidLocationError:
            return
        if len(coords) < 2:
            return
        if rw == "station":
            xs, ys = zip(*coords)
            self._station(t, sum(xs) / len(xs), sum(ys) / len(ys), f"w{w.id}")
            return
        if t.get("service") or t.get("usage") in ("industrial", "military", "tourism", "test"):
            return
        hs = t.get("highspeed") == "yes"
        if rw == "construction":
            if not hs or t.get("construction", "rail") not in ("rail", "yes"):
                return
            cls = "construction"
        else:
            cls = "hsr" if hs else ("conventional" if t.get("usage") in ("main", "branch") else None)
        if cls is None:
            return
        self.lines.append((cls, t.get("name", ""), t.get("name:en", ""), speed(t), coords))


h = RailHandler()
h.apply_file(PBF, locations=True, idx="flex_mem")
print(f"{len(h.lines)} rail ways, {len(h.stations)} stations", file=sys.stderr)

# ---------------------------------------------------------------- lines
groups = defaultdict(list)
for cls, name, name_en, ms, coords in h.lines:
    groups[(cls, name, name_en, ms)].append(LineString(coords))

# Conventional lines where any named segment allows >=140 km/h usually carry
# EMU "D"/"C" trains (e.g. Kunming-Vientiane, Dali-Lijiang-Shangri-La) -> "fast".
line_max = defaultdict(int)
for (cls, name, _, ms) in groups:
    if cls == "conventional" and name and ms:
        line_max[name] = max(line_max[name], ms)
for key in list(groups):
    cls, name, name_en, ms = key
    if cls == "conventional" and ((ms or 0) >= 140 or line_max.get(name, 0) >= 140):
        groups[("fast", name, name_en, ms)].extend(groups.pop(key))

TOL = {"hsr": 0.0002, "fast": 0.0003, "construction": 0.0004, "conventional": 0.0006}
hsr_raw = []
fast_raw = []
out = defaultdict(list)
for (cls, name, name_en, ms), geoms in groups.items():
    if cls == "hsr":
        hsr_raw.extend(geoms)
    elif cls == "fast":
        fast_raw.extend(geoms)
    merged = linemerge(geoms)
    parts = list(getattr(merged, "geoms", [merged]))
    for g in parts:
        g = g.simplify(TOL[cls], preserve_topology=False)
        if g.is_empty or g.length < 0.0005:
            continue
        coords = [[round(x, 5), round(y, 5)] for x, y in g.coords]
        props = {"name": name}
        if name_en:
            props["name_en"] = name_en
        if ms:
            props["maxspeed"] = ms
        out[cls].append({"type": "Feature", "properties": props,
                         "geometry": {"type": "LineString", "coordinates": coords}})

for cls, feats in out.items():
    with open(f"{OUT}/rail-{cls}.geojson", "w") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f,
                  ensure_ascii=False, separators=(",", ":"))
    print(f"rail-{cls}: {len(feats)} features", file=sys.stderr)

# ---------------------------------------------------------------- stations
hsr_tree = STRtree(hsr_raw)
fast_tree = STRtree(fast_raw)
con_geoms = [LineString(c) for cls, *_, c in h.lines if cls == "construction"]
con_tree = STRtree(con_geoms) if con_geoms else None
NEAR = 0.006  # ~600 m


def romanize(zh):
    base = re.sub(r"(火车站|站)$", "", zh)
    suffix = {"东": "East", "西": "West", "南": "South", "北": "North"}
    tail = ""
    if len(base) > 2 and base[-1] in suffix:
        tail, base = " " + suffix[base[-1]], base[:-1]
    return "".join(lazy_pinyin(base)).capitalize() + tail


seen = set()
feats = []
for s in h.stations:
    key = (s["name"], round(s["lon"], 2), round(s["lat"], 2))
    if key in seen:
        continue
    seen.add(key)
    p = Point(s["lon"], s["lat"])
    hsr = len(hsr_tree.query(p, predicate="dwithin", distance=NEAR)) > 0
    fast = (not hsr) and len(fast_tree.query(p, predicate="dwithin", distance=NEAR)) > 0
    soon = (not hsr) and con_tree is not None and \
        len(con_tree.query(p, predicate="dwithin", distance=NEAR)) > 0
    name_en = s["name_en"]
    if name_en and T2S.convert(s["name"]) != s["name"]:
        # Traditional-script names (Hong Kong): keep the official English name
        name_en = re.sub(r"\s+(Railway\s+)?Station$", "", name_en, flags=re.I)
    else:
        name_en = romanize(s["name"])
    feats.append({"type": "Feature",
                  "properties": {"name": re.sub(r"站$", "", s["name"]), "name_en": name_en,
                                 "kind": "hsr" if hsr else "fast" if fast else
                                 "construction" if soon else "conventional"},
                  "geometry": {"type": "Point",
                               "coordinates": [round(s["lon"], 5), round(s["lat"], 5)]}})

with open(f"{OUT}/stations.geojson", "w") as f:
    json.dump({"type": "FeatureCollection", "features": feats}, f,
              ensure_ascii=False, separators=(",", ":"))
kinds = defaultdict(int)
for ft in feats:
    kinds[ft["properties"]["kind"]] += 1
print("stations:", dict(kinds), file=sys.stderr)
