// Places: spots (markers), areas (shaded official boundaries) and regions
// (hatched "explore this area" zones), plus filters, list, deep links and
// the click dispatcher that decides what a map click opens.
import { CATEGORIES, REGIONS, ALTITUDE_THRESHOLD } from './config.js';
import { showPlace, maxElevation, onDetailClose, closeDetail, isDetailOpen } from './detail.js';
import { healthZoneAt } from './health.js';

const SHORTLIST_KEY = 'seidenstrasse.shortlist';
const state = {
  places: [],
  markers: new Map(), // id -> { marker, el }
  filters: {
    wow: 1, crowds: 5, search: '', categories: new Set(Object.keys(CATEGORIES)),
    kinds: new Set(['region', 'area', 'poi']), lowOnly: false, shortlistOnly: false,
  },
  shortlist: new Set(JSON.parse(localStorage.getItem(SHORTLIST_KEY) || '[]')),
  visible: { places: true },
  activeId: null,
};

let map;

export const KIND_LABEL = { region: 'Region to explore', area: 'Protected area', poi: 'Spot' };

export async function initPlaces(m) {
  map = m;
  const data = await (await fetch('data/places.json')).json();
  state.places = data.places.filter((p) => p.coordinates && p.id);
  for (const p of state.places) {
    if (p.geometry) p._bbox = bbox(p.geometry);
  }

  addHatchPatterns();

  const color = (p) => CATEGORIES[p.category]?.color || '#666';
  const regions = state.places.filter((p) => p.kind === 'region' && p.geometry);
  map.getSource('regions').setData({
    type: 'FeatureCollection',
    features: regions.map((p) => ({
      type: 'Feature', id: p.id, geometry: p.geometry,
      properties: { id: p.id, color: color(p), category: p.category, size: bboxSize(p._bbox) },
    })),
  });
  map.getSource('region-labels').setData({
    type: 'FeatureCollection',
    features: regions.map((p) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: p.label_at || p.coordinates },
      properties: { id: p.id, name: p.short_name || p.name, color: color(p), wow: p.wow },
    })),
  });
  map.getSource('place-areas').setData({
    type: 'FeatureCollection',
    features: state.places.filter((p) => p.kind === 'area' && p.geometry).map((p) => ({
      type: 'Feature', id: p.id, geometry: p.geometry,
      properties: { id: p.id, color: color(p) },
    })),
  });

  for (const p of state.places) if (p.kind !== 'region') createMarker(p);

  hoverState('place-areas-fill', 'place-areas');
  hoverState('regions-fill', 'regions');
  for (const l of ['region-labels']) {
    map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
  }

  map.on('zoom', updateLabelVisibility);
  updateLabelVisibility();
  onDetailClose(() => setActive(null));

  buildFilterUI();
  applyFilters();

  const deep = new URLSearchParams(location.search).get('place');
  if (deep && byId(deep)) select(byId(deep), { fly: true });
}

// One click handler for everything polygon-shaped. Priority:
// protected area > region label > smallest region > health zone > close panel.
export function handleMapClick(e) {
  if (e.originalEvent.cancelBubble) return; // e.g. a station popup handled it
  const layers = ['place-areas-fill', 'region-labels', 'regions-fill'].filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none');
  const { x, y } = e.point;
  const hits = map.queryRenderedFeatures([[x - 3, y - 3], [x + 3, y + 3]], { layers });
  const pick = (layer) => hits.filter((f) => f.layer.id === layer);
  const area = pick('place-areas-fill')[0] || pick('region-labels')[0]
    || pick('regions-fill').sort((a, b) => a.properties.size - b.properties.size)[0];
  if (area) return select(byId(area.properties.id), { fly: false });
  if (healthZoneAt(e.point)) return;
  if (isDetailOpen()) closeDetail();
}

function hoverState(layer, source) {
  let hovered = null;
  map.on('mousemove', layer, (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const f = layer === 'regions-fill'
      ? [...e.features].sort((a, b) => a.properties.size - b.properties.size)[0]
      : e.features[0];
    if (hovered !== f?.id) {
      if (hovered) map.setFeatureState({ source, id: hovered }, { hover: false });
      hovered = f?.id;
      if (hovered) map.setFeatureState({ source, id: hovered }, { hover: true });
    }
  });
  map.on('mouseleave', layer, () => {
    map.getCanvas().style.cursor = '';
    if (hovered) map.setFeatureState({ source, id: hovered }, { hover: false });
    hovered = null;
  });
}

// Diagonal hatch pattern per category colour, used to fill regions.
function addHatchPatterns() {
  const px = 2 * (window.devicePixelRatio || 1);
  const size = 11 * px;
  for (const [key, c] of Object.entries(CATEGORIES)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.strokeStyle = c.color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.5 * px;
    for (const o of [-size, 0, size]) {
      ctx.beginPath(); ctx.moveTo(o, size); ctx.lineTo(o + size, 0); ctx.stroke();
    }
    map.addImage(`hatch-${key}`, ctx.getImageData(0, 0, size, size), { pixelRatio: px });
  }
}

// Wikimedia thumbnail of a given width, for both /thumb/ URLs and original-file URLs
export function thumbUrl(src, w) {
  const m = src.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w\/\w\w)\/([^/]+)$/);
  if (m) return `${m[1]}/thumb/${m[2]}/${m[3]}/${w}px-${m[3]}`;
  return src.replace(/\/\d+px-/, `/${w}px-`);
}

const byId = (id) => state.places.find((p) => p.id === id);
export const selectById = (id) => { const p = byId(id); if (p) select(p, { fly: true }); };

function createMarker(p) {
  const cat = CATEGORIES[p.category] || { color: '#666', icon: '📍' };
  const el = document.createElement('button');
  el.className = `place-marker wow-${p.wow}${p.kind === 'area' ? ' is-area' : ''}`;
  el.style.setProperty('--c', cat.color);
  el.innerHTML = `<span class="pin">${cat.icon}</span><span class="label">${p.name}</span>`;
  el.title = `${p.name} — wow ${p.wow}/5 · crowds ${p.crowds}/5`;
  el.addEventListener('click', (e) => { e.stopPropagation(); select(p, { fly: false }); });
  const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(p.coordinates).addTo(map);
  state.markers.set(p.id, { marker, el });
}

function updateLabelVisibility() {
  const z = map.getZoom();
  document.body.classList.toggle('show-place-labels', z >= 7.5);
  document.body.classList.toggle('zoomed-out', z < 6.3);
}

function setActive(id) {
  if (state.activeId) state.markers.get(state.activeId)?.el.classList.remove('active');
  if (state.activeId && byId(state.activeId)?.kind === 'region') map.setFeatureState({ source: 'regions', id: state.activeId }, { active: false });
  state.activeId = id;
  if (id) state.markers.get(id)?.el.classList.add('active');
  if (id && byId(id)?.kind === 'region') map.setFeatureState({ source: 'regions', id }, { active: true });
  const url = new URL(location.href);
  if (id) url.searchParams.set('place', id); else url.searchParams.delete('place');
  history.replaceState(null, '', url);
}

export function select(p, { fly = true } = {}) {
  setActive(p.id);
  const inside = p.geometry && p.kind !== 'poi'
    ? state.places.filter((q) => q.id !== p.id && q.kind !== 'region' && contains(p, q.coordinates))
      .sort((a, b) => b.wow - a.wow || a.crowds - b.crowds)
    : [];
  const partOf = state.places.filter((r) => r.kind === 'region' && r.id !== p.id && r.geometry && contains(r, p.coordinates));
  showPlace(p, {
    shortlisted: state.shortlist.has(p.id),
    onShortlist: () => toggleShortlist(p.id),
    inside, partOf, onSelect: selectById,
  });
  if (!fly) return;
  const wide = window.innerWidth > 760;
  const padding = wide ? { left: 350, right: 470, top: 40, bottom: 40 } : { top: 20, left: 20, right: 20, bottom: window.innerHeight * 0.65 };
  if (p.geometry && p.kind !== 'poi') {
    const [w, s, e, n] = p._bbox;
    map.fitBounds([[w, s], [e, n]], { padding, maxZoom: p.zoom || 11, speed: 1.4 });
  } else {
    map.flyTo({ center: p.coordinates, zoom: Math.max(map.getZoom(), p.zoom || 10), padding, speed: 1.4 });
  }
}

function toggleShortlist(id) {
  if (state.shortlist.has(id)) state.shortlist.delete(id); else state.shortlist.add(id);
  localStorage.setItem(SHORTLIST_KEY, JSON.stringify([...state.shortlist]));
  applyFilters();
  return state.shortlist.has(id);
}

// ───────── geometry helpers
function bbox(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]);
      b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]);
    } else c.forEach(walk);
  };
  walk(g.coordinates);
  return b;
}
const bboxSize = (b) => (b[2] - b[0]) * (b[3] - b[1]);

function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function contains(p, pt) {
  const [w, s, e, n] = p._bbox;
  if (pt[0] < w || pt[0] > e || pt[1] < s || pt[1] > n) return false;
  const polys = p.geometry.type === 'Polygon' ? [p.geometry.coordinates] : p.geometry.coordinates;
  return polys.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
}

// ───────── filters
function passes(p) {
  const f = state.filters;
  if (p.wow < f.wow || p.crowds > f.crowds) return false;
  if (!f.categories.has(p.category) || !f.kinds.has(p.kind)) return false;
  if (f.lowOnly && (p.kind === 'region' ? (p.base_elevation_m ?? 0) : (maxElevation(p) ?? 0)) > ALTITUDE_THRESHOLD) return false;
  if (f.shortlistOnly && !state.shortlist.has(p.id)) return false;
  if (f.search) {
    const hay = `${p.name} ${p.name_zh || ''} ${p.region} ${(p.tags || []).join(' ')} ${p.tagline || ''}`.toLowerCase();
    if (!hay.includes(f.search)) return false;
  }
  return true;
}

function applyFilters() {
  const shown = state.places.filter(passes);
  const ids = new Set(shown.map((p) => p.id));
  for (const [id, { el }] of state.markers) el.hidden = !state.visible.places || !ids.has(id);
  const f = ['in', ['get', 'id'], ['literal', [...ids]]];
  for (const l of ['place-areas-fill', 'place-areas-line', 'regions-tint', 'regions-fill', 'regions-casing', 'regions-line', 'region-labels']) {
    if (map.getLayer(l)) map.setFilter(l, f);
  }
  renderList(shown);
}

export function setPlacesVisible(on) {
  state.visible.places = on;
  applyFilters();
}

function buildFilterUI() {
  const $ = (id) => document.getElementById(id);
  const bindRange = (id, key) => {
    $(id).addEventListener('input', (e) => {
      state.filters[key] = Number(e.target.value);
      $(`${id}-out`).textContent = e.target.value;
      applyFilters();
    });
  };
  bindRange('f-wow', 'wow');
  bindRange('f-crowd', 'crowds');
  $('f-pregnancy').addEventListener('change', (e) => { state.filters.lowOnly = e.target.checked; applyFilters(); });
  $('f-search').addEventListener('input', (e) => { state.filters.search = e.target.value.trim().toLowerCase(); applyFilters(); });

  const kinds = $('f-kinds');
  for (const [key, label, icon] of [['region', 'Regions', '🗺️'], ['area', 'Protected areas', '🌲'], ['poi', 'Spots', '📍']]) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.innerHTML = `${icon} ${label}`;
    chip.addEventListener('click', () => {
      const s = state.filters.kinds;
      if (s.has(key)) s.delete(key); else s.add(key);
      chip.classList.toggle('off', !s.has(key));
      applyFilters();
    });
    kinds.append(chip);
  }

  const chips = $('f-categories');
  const legend = $('category-legend');
  const used = new Set(state.places.map((p) => p.category));
  for (const [key, c] of Object.entries(CATEGORIES)) {
    if (!used.has(key)) continue;
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.style.setProperty('--c', c.color);
    chip.innerHTML = `<i></i>${c.icon} ${c.label}`;
    chip.addEventListener('click', () => {
      const s = state.filters.categories;
      if (s.has(key)) s.delete(key); else s.add(key);
      chip.classList.toggle('off', !s.has(key));
      applyFilters();
    });
    chips.append(chip);
    legend.insertAdjacentHTML('beforeend', `<div><span class="legend-pin" style="--c:${c.color}">${c.icon}</span>${c.label}</div>`);
  }
  const sl = document.createElement('button');
  sl.className = 'chip off';
  sl.innerHTML = '♥ Shortlist only';
  sl.addEventListener('click', () => {
    state.filters.shortlistOnly = !state.filters.shortlistOnly;
    sl.classList.toggle('off', !state.filters.shortlistOnly);
    applyFilters();
  });
  chips.append(sl);
  legend.insertAdjacentHTML('beforeend', `
    <div><span class="legend-area"></span>Protected area (official boundary)</div>
    <p class="note">Marker size = wow factor. Click a marker or shaded area for details.</p>`);
}

function renderList(shown) {
  const ul = document.getElementById('place-list');
  ul.innerHTML = '';
  if (!shown.length) {
    ul.innerHTML = '<li class="empty">No places match these filters.</li>';
    return;
  }
  const order = (r) => { const i = REGIONS.indexOf(r); return i < 0 ? 99 : i; };
  const kindOrder = { region: 0, area: 1, poi: 2 };
  shown.sort((a, b) => order(a.region) - order(b.region) || kindOrder[a.kind] - kindOrder[b.kind] || b.wow - a.wow || a.crowds - b.crowds);
  let region = null;
  for (const p of shown) {
    if (p.region !== region) {
      region = p.region;
      ul.insertAdjacentHTML('beforeend', `<div class="region-head">${region}</div>`);
    }
    const cat = CATEGORIES[p.category] || { icon: '📍', color: '#666' };
    const li = document.createElement('li');
    if (p.kind === 'region') li.className = 'is-region';
    li.style.setProperty('--c', cat.color);
    const ph = p.photos?.[0];
    const thumb = ph && (ph.thumb || thumbUrl(ph.src, 330));
    li.innerHTML = `
      <div class="thumb" style="${thumb ? `background-image:url('${thumb}')` : ''}">${thumb ? '' : (p.kind === 'region' ? '🗺️' : cat.icon)}</div>
      <div class="meta">
        ${p.kind === 'region' ? '<div class="kind-badge">Region</div>' : ''}
        <div class="name">${state.shortlist.has(p.id) ? '♥ ' : ''}${p.name}</div>
        <div class="region">${p.tagline ? p.tagline.slice(0, 70) + (p.tagline.length > 70 ? '…' : '') : p.region}</div>
        <div class="scores">${'★'.repeat(p.wow)} <span style="opacity:.6">wow</span> · ${'👥'.repeat(p.crowds)}${(maxElevation(p) ?? 0) > ALTITUDE_THRESHOLD ? ' · <span style="color:#b42318">⛰ high</span>' : ''}</div>
      </div>`;
    li.addEventListener('click', () => select(p, { fly: true }));
    ul.append(li);
  }
}
