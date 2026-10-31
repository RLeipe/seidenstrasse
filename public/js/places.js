// Places & areas: markers, area polygons, filters, list and deep links.
import { CATEGORIES, REGIONS, ALTITUDE_THRESHOLD } from './config.js';
import { showPlace, maxElevation, onDetailClose } from './detail.js';

const SHORTLIST_KEY = 'seidenstrasse.shortlist';
const state = {
  places: [],
  markers: new Map(), // id -> { marker, el }
  filters: { wow: 1, crowds: 5, search: '', categories: new Set(Object.keys(CATEGORIES)), lowOnly: false, shortlistOnly: false },
  shortlist: new Set(JSON.parse(localStorage.getItem(SHORTLIST_KEY) || '[]')),
  visible: true,
  activeId: null,
};

let map;

export async function initPlaces(m) {
  map = m;
  const data = await (await fetch('data/places.json')).json();
  state.places = data.places.filter((p) => p.coordinates && p.id);

  // Area polygons → GeoJSON source
  map.getSource('place-areas').setData({
    type: 'FeatureCollection',
    features: state.places.filter((p) => p.geometry).map((p) => ({
      type: 'Feature', id: p.id, geometry: p.geometry,
      properties: { id: p.id, color: CATEGORIES[p.category]?.color || '#666' },
    })),
  });

  for (const p of state.places) createMarker(p);

  // area interaction
  let hovered = null;
  map.on('mousemove', 'place-areas-fill', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const id = e.features[0]?.id;
    if (hovered !== id) {
      if (hovered) map.setFeatureState({ source: 'place-areas', id: hovered }, { hover: false });
      hovered = id;
      map.setFeatureState({ source: 'place-areas', id }, { hover: true });
    }
  });
  map.on('mouseleave', 'place-areas-fill', () => {
    map.getCanvas().style.cursor = '';
    if (hovered) map.setFeatureState({ source: 'place-areas', id: hovered }, { hover: false });
    hovered = null;
  });
  map.on('click', 'place-areas-fill', (e) => {
    if (e.originalEvent.cancelBubble) return;
    const p = byId(e.features[0].properties.id);
    if (p) select(p, { fly: false });
  });

  map.on('zoom', updateLabelVisibility);
  updateLabelVisibility();
  onDetailClose(() => setActive(null));

  buildFilterUI();
  applyFilters();

  const deep = new URLSearchParams(location.search).get('place');
  if (deep && byId(deep)) select(byId(deep), { fly: true });
}

// Wikimedia thumbnail of a given width, for both /thumb/ URLs and original-file URLs
export function thumbUrl(src, w) {
  const m = src.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w\/\w\w)\/([^/]+)$/);
  if (m) return `${m[1]}/thumb/${m[2]}/${m[3]}/${w}px-${m[3]}`;
  return src.replace(/\/\d+px-/, `/${w}px-`);
}

const byId = (id) => state.places.find((p) => p.id === id);

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
  document.body.classList.toggle('show-place-labels', map.getZoom() >= 6.5);
}

function setActive(id) {
  if (state.activeId) state.markers.get(state.activeId)?.el.classList.remove('active');
  state.activeId = id;
  if (id) state.markers.get(id)?.el.classList.add('active');
  const url = new URL(location.href);
  if (id) url.searchParams.set('place', id); else url.searchParams.delete('place');
  history.replaceState(null, '', url);
}

export function select(p, { fly = true } = {}) {
  setActive(p.id);
  showPlace(p, {
    shortlisted: state.shortlist.has(p.id),
    onShortlist: () => toggleShortlist(p.id),
  });
  if (fly) {
    const wide = window.innerWidth > 760;
    map.flyTo({
      center: p.coordinates,
      zoom: Math.max(map.getZoom(), p.zoom || (p.kind === 'area' ? 8 : 10)),
      padding: wide ? { left: 340, right: 460, top: 0, bottom: 0 } : { bottom: window.innerHeight * 0.6 },
      speed: 1.4,
    });
  }
}

function toggleShortlist(id) {
  if (state.shortlist.has(id)) state.shortlist.delete(id); else state.shortlist.add(id);
  localStorage.setItem(SHORTLIST_KEY, JSON.stringify([...state.shortlist]));
  applyFilters();
  return state.shortlist.has(id);
}

// ───────── filters
function passes(p) {
  const f = state.filters;
  if (p.wow < f.wow || p.crowds > f.crowds) return false;
  if (!f.categories.has(p.category)) return false;
  if (f.lowOnly && (maxElevation(p) ?? 0) > ALTITUDE_THRESHOLD) return false;
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
  for (const [id, { el }] of state.markers) el.hidden = !state.visible || !ids.has(id);
  if (map.getLayer('place-areas-fill')) {
    const f = ['in', ['get', 'id'], ['literal', [...ids]]];
    map.setFilter('place-areas-fill', f);
    map.setFilter('place-areas-line', f);
  }
  renderList(shown);
}

export function setPlacesVisible(on) {
  state.visible = on;
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
  legend.insertAdjacentHTML('beforeend', '<p class="note">Marker size = wow factor. Click a marker or a shaded area for details.</p>');
}

function renderList(shown) {
  const ul = document.getElementById('place-list');
  ul.innerHTML = '';
  if (!shown.length) {
    ul.innerHTML = '<li class="empty">No places match these filters.</li>';
    return;
  }
  const order = (r) => { const i = REGIONS.indexOf(r); return i < 0 ? 99 : i; };
  shown.sort((a, b) => order(a.region) - order(b.region) || b.wow - a.wow || a.crowds - b.crowds);
  let region = null;
  for (const p of shown) {
    if (p.region !== region) {
      region = p.region;
      ul.insertAdjacentHTML('beforeend', `<div class="region-head">${region}</div>`);
    }
    const cat = CATEGORIES[p.category] || { icon: '📍' };
    const li = document.createElement('li');
    const ph = p.photos?.[0];
    const thumb = ph && (ph.thumb || thumbUrl(ph.src, 330));
    li.innerHTML = `
      <div class="thumb" style="${thumb ? `background-image:url('${thumb}')` : ''}">${thumb ? '' : cat.icon}</div>
      <div class="meta">
        <div class="name">${state.shortlist.has(p.id) ? '♥ ' : ''}${p.name}</div>
        <div class="region">${p.tagline ? p.tagline.slice(0, 70) + (p.tagline.length > 70 ? '…' : '') : p.region}</div>
        <div class="scores">${'★'.repeat(p.wow)} <span style="opacity:.6">wow</span> · ${'👥'.repeat(p.crowds)}${(maxElevation(p) ?? 0) > ALTITUDE_THRESHOLD ? ' · <span style="color:#b42318">⛰ high</span>' : ''}</div>
      </div>`;
    li.addEventListener('click', () => select(p, { fly: true }));
    ul.append(li);
  }
}
