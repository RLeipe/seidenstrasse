// Cursor read-out: elevation (decoded from Terrarium DEM tiles) + April climate values.
import { DEM, ALTITUDE_THRESHOLD } from './config.js';

const TILE = 256;
const cache = new Map(); // key -> Promise<ImageData|null>
const MAX_CACHE = 80;

function tileFor(lng, lat, z) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x: Math.floor(x), y: Math.floor(y), px: Math.floor((x % 1) * TILE), py: Math.floor((y % 1) * TILE) };
}

async function loadPixels(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height);
}

export async function elevationAt(lng, lat, zoom) {
  const z = Math.max(3, Math.min(DEM.maxzoom, Math.round(zoom) + 1));
  const t = tileFor(lng, lat, z);
  const key = `${z}/${t.x}/${t.y}`;
  if (!cache.has(key)) {
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    const url = DEM.tiles[0].replace('{z}', z).replace('{x}', t.x).replace('{y}', t.y);
    cache.set(key, loadPixels(url).catch(() => null));
  }
  const img = await cache.get(key);
  if (!img) return null;
  const i = (t.py * img.width + t.px) * 4;
  const d = img.data;
  return Math.round(d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768);
}

// April climate grid: R = tmax*2+100, G = tmin*2+100, B = prec/2, A = valid
let climate = null;
export async function loadClimate(meta) {
  const img = await loadPixels('data/climate/april-values.png');
  climate = { img, meta };
}

export function climateAt(lng, lat) {
  if (!climate?.img) return null;
  const [w, s, e, n] = climate.meta.bounds;
  if (lng < w || lng > e || lat < s || lat > n) return null;
  const { width, height, data } = climate.img;
  const x = Math.min(width - 1, Math.floor(((lng - w) / (e - w)) * width));
  const y = Math.min(height - 1, Math.floor(((n - lat) / (n - s)) * height));
  const i = (y * width + x) * 4;
  if (data[i + 3] === 0) return null;
  return { tmax: (data[i] - 100) / 2, tmin: (data[i + 1] - 100) / 2, prec: data[i + 2] * 2 };
}

export function initReadout(map, el) {
  let pending = null;
  let timer = null;

  async function update(lngLat) {
    const { lng, lat } = lngLat;
    const [elev, clim] = [await elevationAt(lng, lat, map.getZoom()), climateAt(lng, lat)];
    const parts = [`${lat.toFixed(3)}°N ${lng.toFixed(3)}°E`];
    if (elev !== null) {
      const hi = elev >= ALTITUDE_THRESHOLD;
      parts.push(`⛰ ${hi ? '<b class="high">' : ''}${elev.toLocaleString('en')} m${hi ? '</b>' : ''}`);
    }
    if (clim) {
      parts.push(`🌡 April ${Math.round(clim.tmax)}° / ${Math.round(clim.tmin)} °C`);
      parts.push(`🌧 ${Math.round(clim.prec)} mm`);
    }
    el.innerHTML = parts.join('<span class="sep">·</span>');
    el.hidden = false;
  }

  const handler = (e) => {
    pending = e.lngLat;
    if (!timer) timer = setTimeout(() => { timer = null; update(pending); }, 70);
  };
  map.on('mousemove', handler);
  map.on('click', (e) => update(e.lngLat)); // touch devices
  map.getCanvasContainer().addEventListener('mouseleave', () => { el.hidden = true; });
}
