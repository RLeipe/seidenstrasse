// Central configuration: tile sources, colors, categories.

export const INITIAL_VIEW = { bounds: [[97.0, 20.6], [116.0, 32.6]] }; // HK → Yunnan → Chengdu/Chongqing

export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const SATELLITE = {
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  maxzoom: 18,
};

// Mapzen/AWS Terrain Tiles (Terrarium encoding): elevation = R*256 + G + B/256 - 32768
export const DEM = {
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 14,
  attribution: 'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>',
};

export const ALTITUDE_THRESHOLD = 2500;

export const RAIL_COLORS = {
  hsr: '#d7263d',
  fast: '#f28f3b',
  construction: '#d7263d',
  conventional: '#6c7a89',
};

export const CATEGORIES = {
  nature:   { label: 'Nature & landscapes', color: '#2a9d8f', icon: '🏞️' },
  hike:     { label: 'Hiking',              color: '#4f772d', icon: '🥾' },
  wildlife: { label: 'Wildlife',            color: '#9c6644', icon: '🐼' },
  village:  { label: 'Villages & towns',    color: '#e76f51', icon: '🏘️' },
  culture:  { label: 'Temples & heritage',  color: '#7b2cbf', icon: '🏯' },
  city:     { label: 'Cities',              color: '#1d3557', icon: '🌆' },
  market:   { label: 'Markets & food',      color: '#e9a23b', icon: '🍜' },
};

// Route order, used to group the place list
export const REGIONS = ['Hong Kong', 'Guangdong', 'Guangxi', 'Guizhou', 'Hunan', 'Yunnan', 'Sichuan', 'Chongqing'];

export const WOW_VERDICT = ['', 'Nice if passing', 'Worth a detour', 'Very memorable', 'Highlight of a trip', 'Once in a lifetime'];
export const CROWD_VERDICT = ['', 'You may be alone', 'A few others', 'Busy at peaks', 'Crowded', 'Shoulder-to-shoulder'];
