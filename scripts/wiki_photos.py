#!/usr/bin/env python3
"""Look up coordinates and freely-licensed photos for a Wikipedia article and print
a JSON snippet ("coordinates", "photos") to paste into public/data/places.json.

Usage:
    python3 scripts/wiki_photos.py "Tiger Leaping Gorge" [max_photos=4]

Photos are hot-linked from upload.wikimedia.org (allowed, with attribution); the
credit + license are stored alongside and shown in the detail panel.
"""
import json, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = {"User-Agent": "SeidenstrasseMap/1.0 (https://seidenstrasse.romanleipe.com)"}
API = "https://en.wikipedia.org/w/api.php"


def get(url, **params):
    params.update(format="json", formatversion="2")
    req = urllib.request.Request(url + "?" + urllib.parse.urlencode(params), headers=UA)
    for attempt in range(6):
        try:
            return json.load(urllib.request.urlopen(req, timeout=30))
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 0) or 5 * 2 ** attempt)


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def photos_for(title, n=4):
    page = get(API, action="query", titles=title, redirects=1,
               prop="coordinates|pageimages|images|info", piprop="name", imlimit=60, inprop="url")["query"]["pages"][0]
    lead = page.get("pageimage")
    files = ([f"File:{lead}"] if lead else []) + [
        i["title"] for i in page.get("images", [])
        if re.search(r"\.(jpe?g)$", i["title"], re.I) and (not lead or lead not in i["title"])]
    out = []
    # one batched imageinfo call (via en.wikipedia, which proxies Commons files)
    res = get(API, action="query", titles="|".join(files[: n * 3]), prop="imageinfo",
              iiprop="url|extmetadata|size", iiurlwidth=1280).get("query", {}).get("pages", []) if files else []
    by_title = {p["title"]: p for p in res}
    for f in files[: n * 3]:
        info = by_title.get(f.replace("_", " ")) or by_title.get(f)
        if not info or "imageinfo" not in info:
            continue
        ii = info["imageinfo"][0]
        md = ii.get("extmetadata", {})
        lic = strip_html(md.get("LicenseShortName", {}).get("value"))
        if ii.get("width", 0) < 800 or not lic:
            continue
        out.append({"src": (ii.get("thumburl") or ii["url"]).split("?")[0],
                    "credit": strip_html(md.get("Artist", {}).get("value"))[:80],
                    "license": lic, "link": ii["descriptionurl"]})
        if len(out) >= n:
            break
    coords = page.get("coordinates", [{}])[0]
    return {"wiki": page.get("fullurl"),
            "coordinates": [round(coords["lon"], 4), round(coords["lat"], 4)] if coords else None,
            "photos": out}


if __name__ == "__main__":
    print(json.dumps(photos_for(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 4),
                     ensure_ascii=False, indent=1))
