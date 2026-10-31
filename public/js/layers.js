// Builds the map style: OpenFreeMap "Liberty" base + our overlay sources and layers.
import { BASE_STYLE_URL, SATELLITE, DEM, RAIL_COLORS, ALTITUDE_THRESHOLD } from './config.js';

const T = ALTITUDE_THRESHOLD;
const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

// Layer ids grouped by UI toggle
export const GROUPS = {
  hillshade: ['hillshade'],
  altitude: ['altitude'],
  climate: ['climate'],
  rail: ['rail-fast', 'rail-construction', 'rail-hsr-casing', 'rail-hsr'],
  railConv: ['rail-conventional'],
  stations: ['stations-other', 'stations-fast', 'stations-hsr', 'stations-label-other', 'stations-label-fast', 'stations-label-hsr'],
  places: ['place-areas-fill', 'place-areas-line'],
  disease: ['health-fill', 'health-line'],
};

export async function buildStyle(climateMeta) {
  const style = await (await fetch(BASE_STYLE_URL)).json();
  const firstSymbol = style.layers.findIndex((l) => l.type === 'symbol');
  const afterLandcover = style.layers.findIndex((l) => l.id === 'waterway_tunnel');

  // Tag base-map layers so the satellite switch knows what to hide.
  for (const l of style.layers) {
    l.metadata = { ...(l.metadata || {}), base: true };
  }

  Object.assign(style.sources, {
    satellite: { type: 'raster', tileSize: 256, ...SATELLITE },
    dem: { type: 'raster-dem', ...DEM },
    'terrain-dem': { type: 'raster-dem', tiles: DEM.tiles, encoding: DEM.encoding, tileSize: DEM.tileSize, maxzoom: DEM.maxzoom },
    climate: {
      type: 'image',
      url: 'data/climate/april-tmax.png',
      coordinates: corners(climateMeta.bounds),
    },
    'rail-hsr': { type: 'geojson', data: 'data/rail-hsr.geojson', attribution: 'Rail © OpenStreetMap contributors' },
    'rail-fast': { type: 'geojson', data: 'data/rail-fast.geojson' },
    'rail-construction': { type: 'geojson', data: 'data/rail-construction.geojson' },
    'rail-conventional': { type: 'geojson', data: 'data/rail-conventional.geojson' },
    stations: { type: 'geojson', data: 'data/stations.geojson' },
    health: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'place-areas': { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' },
  });

  const satellite = {
    id: 'satellite', type: 'raster', source: 'satellite',
    layout: { visibility: 'none' },
    paint: { 'raster-fade-duration': 150 },
  };

  const hillshade = {
    id: 'hillshade', type: 'hillshade', source: 'dem',
    paint: {
      'hillshade-exaggeration': 0.45,
      'hillshade-shadow-color': '#3b4a5a',
      'hillshade-highlight-color': '#ffffff',
      'hillshade-accent-color': '#5a6b5a',
    },
  };

  // Overlays that sit below the base-map labels
  const below = [
    {
      id: 'climate', type: 'raster', source: 'climate',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.72, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
    },
    {
      id: 'altitude', type: 'color-relief', source: 'dem',
      paint: {
        'color-relief-opacity': 0.6,
        'color-relief-color': [
          'interpolate', ['linear'], ['elevation'],
          -500, 'rgba(0,0,0,0)', T - 1, 'rgba(0,0,0,0)',
          T, '#ffd166', 2999, '#ffd166',
          3000, '#f3722c', 3499, '#f3722c',
          3500, '#d00000', 4499, '#d00000',
          4500, '#6a040f', 9000, '#6a040f',
        ],
      },
    },
    {
      id: 'health-fill', type: 'fill', source: 'health',
      layout: { visibility: 'none' },
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] },
    },
    {
      id: 'health-line', type: 'line', source: 'health',
      layout: { visibility: 'none' },
      paint: {
        'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.9,
        'line-dasharray': ['case', ['get', 'dashed'], ['literal', [3, 2]], ['literal', [1, 0]]],
      },
    },
    {
      id: 'place-areas-fill', type: 'fill', source: 'place-areas',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.32, 0.16],
      },
    },
    {
      id: 'place-areas-line', type: 'line', source: 'place-areas',
      paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 10, 2.5], 'line-opacity': 0.9 },
    },
    {
      id: 'rail-conventional', type: 'line', source: 'rail-conventional', minzoom: 4,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': RAIL_COLORS.conventional,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 1.2, 12, 2],
        'line-opacity': 0.75,
      },
    },
    {
      id: 'rail-fast', type: 'line', source: 'rail-fast',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': RAIL_COLORS.fast,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 1.2, 9, 2.5, 12, 4],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1],
      },
    },
    {
      id: 'rail-construction', type: 'line', source: 'rail-construction',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': RAIL_COLORS.construction, 'line-opacity': 0.8,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2, 12, 3],
        'line-dasharray': [2, 1.5],
      },
    },
    {
      id: 'rail-hsr-casing', type: 'line', source: 'rail-hsr',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 5, 12, 7], 'line-opacity': 0.8 },
    },
    {
      id: 'rail-hsr', type: 'line', source: 'rail-hsr',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': RAIL_COLORS.hsr, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 8, 3, 12, 4.5] },
    },
  ];

  // Station layers sit above everything so their labels win collisions.
  const kindColor = ['match', ['get', 'kind'], 'hsr', RAIL_COLORS.hsr, 'fast', RAIL_COLORS.fast, RAIL_COLORS.conventional];
  const isKind = (k) => ['==', ['get', 'kind'], k];
  const notMain = ['!', ['in', ['get', 'kind'], ['literal', ['hsr', 'fast']]]];
  const top = [
    stationCircle('stations-other', notMain, 9, [9, 2.2, 13, 5], kindColor),
    stationCircle('stations-fast', isKind('fast'), 7.5, [7.5, 2, 10, 4, 13, 6], kindColor),
    stationCircle('stations-hsr', isKind('hsr'), 5.5, [5.5, 1.8, 9, 4.5, 13, 7], kindColor),
    stationLabel('stations-label-other', notMain, 10.5, kindColor),
    stationLabel('stations-label-fast', isKind('fast'), 9, kindColor),
    stationLabel('stations-label-hsr', isKind('hsr'), 7.5, kindColor),
  ];

  style.layers.splice(firstSymbol, 0, ...below);
  style.layers.splice(afterLandcover, 0, satellite, hillshade);
  style.layers.push(...top);

  style.sky = {
    'sky-color': '#9ec5e8', 'horizon-color': '#e8eef4', 'fog-color': '#e8eef4',
    'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4,
  };
  return style;
}

function stationCircle(id, filter, minzoom, radius, color) {
  return {
    id, type: 'circle', source: 'stations', minzoom, filter,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], ...radius],
      'circle-color': '#fff', 'circle-stroke-color': color,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 1.2, 10, 2.5],
    },
  };
}

function stationLabel(id, filter, minzoom, color) {
  return {
    id, type: 'symbol', source: 'stations', minzoom, filter,
    layout: {
      'text-field': ['format', ['get', 'name_en'], {}, '\n', {}, ['get', 'name'], { 'font-scale': 0.85 }],
      'text-font': FONT_BOLD,
      'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10.5, 13, 13],
      'text-anchor': 'top', 'text-offset': [0, 0.6], 'text-max-width': 12,
    },
    paint: { 'text-color': color, 'text-halo-color': '#fff', 'text-halo-width': 1.6 },
  };
}

export function corners([w, s, e, n]) {
  return [[w, n], [e, n], [e, s], [w, s]];
}

export function setVisible(map, ids, on) {
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
}

// Satellite = hide the vector base fills/lines, keep labels and boundaries.
export function setBasemap(map, mode) {
  const sat = mode === 'satellite';
  for (const l of map.getStyle().layers) {
    if (!l.metadata?.base || l.type === 'symbol' || l.id.startsWith('boundary')) continue;
    map.setLayoutProperty(l.id, 'visibility', sat ? 'none' : 'visible');
  }
  map.setLayoutProperty('satellite', 'visibility', sat ? 'visible' : 'none');
  map.setPaintProperty('rail-hsr-casing', 'line-opacity', sat ? 0.35 : 0.8);
}

export { FONT };
