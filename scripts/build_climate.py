#!/usr/bin/env python3
"""Build April climate overlays from WorldClim 2.1 (1970-2000 normals, 5 arc-min).

Usage:
    python3 scripts/build_climate.py <dir with wc2.1_5m_{tmax,tmin,prec}_04.tif> public/data/climate

Downloads: https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_5m_{tmax,tmin,prec}.zip
Requires: pip install rasterio pillow numpy

Outputs
  april-tmax.png / april-tmin.png / april-prec.png  colored overlays, reprojected to
                                                    Web Mercator rows (for a MapLibre image source)
  april-values.png   raw value grid (equirectangular) for hover look-ups:
                     R = tmax*2+100, G = tmin*2+100 (0.5 °C steps), B = prec/2 (2 mm steps), A = 255 valid
  meta.json          bounds + legend definitions
WorldClim: Fick, S.E. & R.J. Hijmans (2017) Int. J. Climatology 37: 4302-4315.
"""
import json, math, sys
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
W, S, E, N = 70.0, 15.0, 140.0, 55.0

TEMP_STOPS = [  # (°C, rgb) - band edges, 2 °C steps get interpolated
    (-20, (49, 54, 149)), (-10, (69, 117, 180)), (0, (116, 173, 209)), (5, (171, 217, 233)),
    (10, (224, 243, 248)), (14, (255, 255, 191)), (18, (254, 224, 144)), (22, (253, 174, 97)),
    (26, (244, 109, 67)), (30, (215, 48, 39)), (35, (165, 0, 38))]
PREC_STOPS = [
    (0, (255, 247, 236)), (10, (254, 232, 200)), (25, (237, 248, 177)), (50, (199, 233, 180)),
    (75, (127, 205, 187)), (100, (65, 182, 196)), (150, (29, 145, 192)), (200, (34, 94, 168)),
    (300, (37, 52, 148)), (450, (8, 29, 88))]


def read(var):
    with rasterio.open(f"{SRC}/wc2.1_5m_{var}_04.tif") as ds:
        win = from_bounds(W, S, E, N, ds.transform)
        a = ds.read(1, window=win).astype("float32")
        nd = ds.nodata
    a[(a == nd) | (a < -1000)] = np.nan
    return a


def colorize(a, stops, step):
    q = np.floor(a / step) * step + step / 2  # discrete bands
    vals = np.array([s[0] for s in stops], dtype="float32")
    rgb = np.zeros(a.shape + (4,), dtype="uint8")
    for c in range(3):
        rgb[..., c] = np.interp(q, vals, [s[1][c] for s in stops]).astype("uint8")
    rgb[..., 3] = np.where(np.isnan(a), 0, 255)
    return rgb


def to_mercator(img, out_w):
    """Resample an equirectangular RGBA array onto evenly spaced Web Mercator rows."""
    h, w = img.shape[:2]
    my = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    y0, y1 = my(N), my(S)
    out_h = int(round(out_w * (y1 - y0) / math.radians(W - E)))
    ys = np.linspace(y0, y1, out_h)
    lats = np.degrees(2 * np.arctan(np.exp(ys)) - math.pi / 2)
    rows = np.clip(((N - lats) / (N - S) * h).astype(int), 0, h - 1)
    cols = np.clip((np.arange(out_w) / out_w * w).astype(int), 0, w - 1)
    return img[rows][:, cols]


tmax, tmin, prec = read("tmax"), read("tmin"), read("prec")
print("grid", tmax.shape, file=sys.stderr)

for name, arr, stops, step in [("tmax", tmax, TEMP_STOPS, 2), ("tmin", tmin, TEMP_STOPS, 2),
                               ("prec", prec, PREC_STOPS, 1)]:
    if name == "prec":  # uneven precipitation classes
        edges = np.array([0, 10, 25, 50, 75, 100, 150, 200, 300, 450, 2000], dtype="float32")
        idx = np.clip(np.digitize(np.nan_to_num(arr, nan=0), edges) - 1, 0, len(PREC_STOPS) - 1)
        rgb = np.zeros(arr.shape + (4,), dtype="uint8")
        cols = np.array([s[1] for s in PREC_STOPS], dtype="uint8")
        rgb[..., :3] = cols[idx]
        rgb[..., 3] = np.where(np.isnan(arr), 0, 255)
    else:
        rgb = colorize(arr, stops, step)
    Image.fromarray(to_mercator(rgb, arr.shape[1] * 2)).save(f"{OUT}/april-{name}.png", optimize=True)

enc = np.zeros(tmax.shape + (4,), dtype="uint8")
enc[..., 0] = np.clip(np.nan_to_num(tmax) * 2 + 100, 0, 255).round()
enc[..., 1] = np.clip(np.nan_to_num(tmin) * 2 + 100, 0, 255).round()
enc[..., 2] = np.clip(np.nan_to_num(prec) / 2, 0, 255).round()
enc[..., 3] = np.where(np.isnan(tmax) | np.isnan(prec), 0, 255)
enc[enc[..., 3] == 0, :3] = 0
Image.fromarray(enc).save(f"{OUT}/april-values.png", optimize=True)

meta = {
    "bounds": [W, S, E, N],
    "grid": {"width": int(tmax.shape[1]), "height": int(tmax.shape[0])},
    "temp_stops": [[v, "#%02x%02x%02x" % c] for v, c in TEMP_STOPS],
    "prec_stops": [[v, "#%02x%02x%02x" % c] for v, c in PREC_STOPS],
    "source": "WorldClim 2.1, April averages 1970-2000, 5 arc-minute (~9 km)",
}
json.dump(meta, open(f"{OUT}/meta.json", "w"), indent=1)
