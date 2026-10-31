#!/usr/bin/env python3
"""Download remote photos referenced in public/data/places.json into public/photos/
(1200 px wide + 360 px thumbnail) and rewrite the `src` fields to the local copies.

Why: Wikimedia (and many photo hosts) are blocked in mainland China, and
self-hosted files on Cloudflare load faster. Credits/licence/link are kept.

Re-runnable: already-downloaded photos are skipped; photos that fail (e.g. HTTP 429
rate limits) keep their remote URL and are retried on the next run.

Usage:
    python3 scripts/localize_photos.py            # all places
    python3 scripts/localize_photos.py tiger-leaping-gorge shaxi
Requires: pip install pillow
"""
import io, json, sys, time, urllib.error, urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public/data/places.json"
OUT = ROOT / "public/photos"
UA = {"User-Agent": "SeidenstrasseMap/1.0 (https://seidenstrasse.romanleipe.com)"}


def fetch(url):
    for attempt in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 3:
                raise
            time.sleep(min(60, int(e.headers.get("Retry-After") or 0) or 5 * 2 ** attempt))


data = json.load(open(DATA))
only = set(sys.argv[1:])
OUT.mkdir(exist_ok=True)
for p in data["places"]:
    if only and p["id"] not in only:
        continue
    for i, ph in enumerate(p.get("photos", [])):
        if not ph["src"].startswith("http"):
            continue
        name = f"{p['id']}-{i + 1}"
        if (OUT / f"{name}.jpg").exists() and (OUT / f"{name}-thumb.jpg").exists():
            ph["remote"], ph["src"], ph["thumb"] = ph["src"], f"photos/{name}.jpg", f"photos/{name}-thumb.jpg"
            continue  # already downloaded on an earlier run
        try:
            im = Image.open(io.BytesIO(fetch(ph["src"]))).convert("RGB")
        except Exception as e:
            print(f"  ! {name}: {e}", file=sys.stderr)
            continue
        big = im.copy(); big.thumbnail((1200, 1200)); big.save(OUT / f"{name}.jpg", quality=80, optimize=True, progressive=True)
        small = im.copy(); small.thumbnail((360, 360)); small.save(OUT / f"{name}-thumb.jpg", quality=75, optimize=True)
        ph["remote"] = ph["src"]
        ph["src"] = f"photos/{name}.jpg"
        ph["thumb"] = f"photos/{name}-thumb.jpg"
        print(f"  ✓ {name}", file=sys.stderr)
        time.sleep(1)

with open(DATA, "w") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write("\n")
