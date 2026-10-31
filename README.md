# Seidenstrasse 丝绸之路: China trip planner map

An interactive, high-fidelity planning map for a 3.5-week trip through southern and south-western China in April:
Hong Kong / Shenzhen → Guizhou · Guangxi · Hunan → **Yunnan** → **Chengdu** & the Sichuan mountains → **Chongqing**.

Live at **https://seidenstrasse.romanleipe.com** (once deployed, see below).

## Features

| Layer / feature | What it shows | Data |
|---|---|---|
| **Railways & stations** | High-speed lines (G/D trains), "fast conventional" lines (≥140 km/h, where D/C trains run, e.g. Kunming→Xishuangbanna, Dali→Lijiang→Shangri-La), HSR under construction, other passenger lines, ~10,000 stations with English + Chinese names | OpenStreetMap (ODbL), extracted Oct 2026 |
| **High altitude** | Everything above **2,500 m**, in bands (2.5–3k, 3–3.5k, 3.5–4.5k, >4.5k m) | AWS Terrain Tiles (SRTM etc.), rendered live |
| **Health & disease risk** | Aedes zones (dengue / chikungunya / Zika vector), rare malaria border areas, Japanese encephalitis; click a zone for details, April seasonality, pregnancy notes and sources | Curated from CDC, WHO, China CDC and the published literature |
| **April climate** | Average April high, low and rainfall | WorldClim 2.1 (1970–2000 normals, ~9 km) |
| **Cursor read-out** | Elevation + April high/low/rain at the mouse position (tap on mobile) | as above |
| **Regions to explore** | Hatched, labelled zones worth roaming (road trips, village stays, off the highlight circuit), with *getting around*, *where to stay*, *route idea*, and a list of the spots inside | `public/data/places.json` (`"kind": "region"`) |
| **Places & areas** | Points of interest and shaded areas with a slide-in detail panel: photos, ★ wow factor, 👥 people density, elevation warning, access, April notes, health notes, links (incl. Amap) | `public/data/places.json` |
| **Filters** | Min. wow, max. crowds, category, search, "hide places above 2,500 m", ♥ shortlist (stored in the browser) | |
| Base maps | Vector map (OpenFreeMap) with English + Chinese labels, satellite (Esri), hillshade, **3D terrain** | |

Share a place with `?place=<id>`, e.g. `/?place=tiger-leaping-gorge`. The map position is kept in the URL hash.

## Project layout

```
public/                  ← the website (deployed as-is, no build step)
  index.html
  css/app.css
  js/                    ← ES modules: main, layers, places, detail, health, readout, config
  vendor/maplibre-gl/    ← MapLibre GL JS 5.16 (vendored)
  data/
    places.json          ← ✏️ YOUR CONTENT: places & areas
    places.schema.json   ← schema (VS Code validates places.json against it)
    rail-*.geojson, stations.geojson   ← generated
    health.json          ← generated from scripts/health_zones.json
    climate/             ← generated
  photos/                ← self-hosted photos (Wikimedia is blocked in mainland China)
  _headers               ← Cloudflare caching headers
scripts/                 ← data pipeline (Python), only needed to regenerate data
```

## Run locally

```bash
python3 -m http.server 8080 -d public
```

Then open http://localhost:8080.

---

## Deploying to Cloudflare Pages

There's no build step: Cloudflare just serves the `public/` folder.

### 1. Get the code onto `main`

The work lives on the branch `claude/brave-ride-56meea`. The repo had no commits before, so there is no `main` yet. On GitHub, create `main` from this branch (branch dropdown → type `main` → "Create branch main from claude/brave-ride-56meea") and make it the default branch under Settings → General. Alternatively, enter `claude/brave-ride-56meea` as the production branch in step 2.

### 2. Create the Pages project

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application**. Choose the **Pages** tab ("Import an existing Git repository"). Cloudflare also offers a Workers flow on that screen; pick **Pages**.
2. **Connect to Git** → authorise GitHub if asked → select `rleipe/seidenstrasse`.
3. Build settings:
   - **Project name:** `seidenstrasse` (gives you `seidenstrasse.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `public`
4. **Save and Deploy**. After ~1 minute the site is live at `https://seidenstrasse.pages.dev`.

From then on, every push to `main` redeploys automatically. Every other branch gets its own preview URL (`https://<branch>.seidenstrasse.pages.dev`), which is handy for trying changes.

### 3. Add the custom domain `seidenstrasse.romanleipe.com`

In the Pages project → **Custom domains** → **Set up a custom domain** → enter `seidenstrasse.romanleipe.com`.

- **If `romanleipe.com` already uses Cloudflare DNS:** Cloudflare creates the `CNAME` record for you. Confirm, and it's done (SSL is issued automatically within a few minutes).
- **If the DNS is elsewhere** (registrar, Netlify, …): add a DNS record there:

  | Type | Name | Target |
  |---|---|---|
  | `CNAME` | `seidenstrasse` | `seidenstrasse.pages.dev` |

  Then click **Check DNS records** in Cloudflare. Activation usually takes 5–30 minutes. Add the domain in the Pages UI *before or together with* the CNAME, otherwise Cloudflare answers with a 522 error.

### 4. Optional: keep it private

The site is public by default. To restrict it to the two of you, use **Cloudflare Zero Trust → Access → Applications → Add → Self-hosted**, domain `seidenstrasse.romanleipe.com`, with a policy "Allow, emails: you + your wife". You then log in with a one-time code by email. It's free for up to 50 users.

---

## Adding places

Edit `public/data/places.json`; each entry is one place. Minimal example:

```json
{
  "id": "baisha-village",
  "kind": "poi",
  "category": "village",
  "name": "Baisha Village",
  "name_zh": "白沙古镇",
  "region": "Yunnan",
  "coordinates": [100.218, 26.966],
  "wow": 3,
  "crowds": 3,
  "elevation_m": 2450,
  "tagline": "Quieter Naxi village north of Lijiang with Ming-era murals.",
  "description": ["Paragraph one with **markdown**.", "Paragraph two."],
  "april": "…",
  "health": "…",
  "photos": [],
  "links": [{ "label": "Wikipedia", "url": "https://en.wikipedia.org/wiki/…" }],
  "tags": ["Naxi", "murals"]
}
```

- **Fields:** see `public/data/places.schema.json` for everything (time_needed, access, nearest_station, best_for, highlights, crowd_tips, zoom …).
- **`category`:** `nature`, `hike`, `wildlife`, `village`, `culture`, `city` or `market` (colours and icons are in `public/js/config.js`).
- **`coordinates`:** `[longitude, latitude]` in WGS84, as on OpenStreetMap or Google Maps outside China. Do **not** use Amap/Baidu coordinates, which are shifted.
- **Three kinds of entries:**
  - `"poi"`: a single spot (marker).
  - `"area"`: an official boundary such as a national park (solid shaded polygon plus marker). Pull the boundary from OpenStreetMap:
    ```bash
    python3 scripts/osm_area.py relation 13556512   # e.g. Giant Panda National Park
    ```
  - `"region"`: a zone worth roaming (hatched polygon with a map label). Extra fields: `short_name` (map label), `base_elevation_m` (typical overnight altitude), `getting_around`, `stay`, `route_idea`. Generate a smooth outline around anchor towns:
    ```bash
    # convex hull of the anchors, buffered by 6 km, clipped to China
    python3 scripts/region_from_points.py --km 6 --clip build/admin.geojson 99.852,26.3195 99.9046,26.5401 99.3781,25.918
    # --path: buffer the route through the anchors in order (valleys, rivers, road trips)
    python3 scripts/region_from_points.py --km 6 --path 98.8628,25.8588 98.9154,26.5573 98.6215,28.0181
    ```
    Or draw it by hand at [geojson.io](https://geojson.io) and paste the `geometry` object.
  - Spots inside an area or region are detected automatically. A region's panel lists them, and a spot's panel links back to its region.
- **Photos:** fetch coordinates and freely licensed photos from a Wikipedia article, then copy them into the site:
  ```bash
  pip install pillow shapely
  python3 scripts/wiki_photos.py "Tiger Leaping Gorge"        # prints JSON to paste into "photos"
  python3 scripts/localize_photos.py tiger-leaping-gorge      # downloads + rewrites src to photos/
  ```
  Your own photos also work: put them in `public/photos/` and reference them as `"src": "photos/my-photo.jpg"`.

**Rating guide:** *Wow* ★1–5 (5 = once in a lifetime). *Crowds* 👥1–5 = how busy in late April **outside** holidays (1 = alone, 5 = shoulder-to-shoulder). Avoid Qingming (≈ 5 Apr) and the 1–5 May Labour Day week.

## Regenerating the data layers

Only needed to refresh rail/health/climate data (e.g. right before the trip, to pick up new HSR lines).

```bash
pip install osmium shapely pypinyin opencc-python-reimplemented rasterio pillow numpy pyshp

# OpenStreetMap China extract (~1.8 GB)
curl -O https://download.openstreetmap.fr/extracts/asia/china-latest.osm.pbf

# Rail + stations (~10 min)
python3 scripts/build_rail.py china-latest.osm.pbf public/data

# Health zones: admin boundaries, then dissolve zones (texts live in scripts/health_zones.json)
mkdir -p build
python3 scripts/build_boundaries.py china-latest.osm.pbf build/admin.geojson
curl -O https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip && unzip ne_10m_land.zip -d ne_land
python3 scripts/build_health.py build/admin.geojson public/data/health.json ne_land/ne_10m_land.shp

# April climate (WorldClim 2.1, 5 arc-min)
for v in tmax tmin prec; do curl -O https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_5m_$v.zip && unzip -o wc2.1_5m_$v.zip "*_04.tif" -d wc; done
python3 scripts/build_climate.py wc public/data/climate
```

## Caveats

- **Rail:** OSM tagging isn't perfect. A few lines may be missing the high-speed tag, and the "fast conventional" class is a heuristic (named lines with any section ≥140 km/h). Always check real timetables on [12306](https://www.12306.cn/en/) or Trip.com.
- **Health:** a curated summary as of late 2026, **not medical advice**. Check [CDC travel notices](https://wwwnc.cdc.gov/travel/notices) shortly before travelling and see a travel-medicine clinic 6–8 weeks ahead, especially in case of pregnancy.
- **Climate:** long-term averages; individual years vary a lot (especially rain onset in Yunnan/Guangxi).
- **In mainland China:** the base map and elevation tiles come from servers outside China. They work fine with a roaming SIM/eSIM (traffic exits abroad) but may be slow on local Chinese networks.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL) · Vector tiles: [OpenFreeMap](https://openfreemap.org) / OpenMapTiles · Satellite: Esri World Imagery · Elevation: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) · Climate: [WorldClim 2.1](https://www.worldclim.org) (Fick & Hijmans 2017) · Coastlines: [Natural Earth](https://www.naturalearthdata.com) · Photos: Wikimedia Commons contributors (credited per photo) · Rendering: [MapLibre GL JS](https://maplibre.org) (BSD-3).
