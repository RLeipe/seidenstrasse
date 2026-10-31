import { INITIAL_VIEW } from './config.js';
import { buildStyle, GROUPS, setVisible, setBasemap } from './layers.js';
import { initReadout, loadClimate } from './readout.js';
import { initPlaces, setPlacesVisible } from './places.js';
import { initHealth } from './health.js';
import { closeDetail, isDetailOpen } from './detail.js';

const $ = (id) => document.getElementById(id);

async function main() {
  const climateMeta = await (await fetch('data/climate/meta.json')).json();
  const style = await buildStyle(climateMeta);

  const map = new maplibregl.Map({
    container: 'map',
    style,
    bounds: INITIAL_VIEW.bounds,
    fitBoundsOptions: { padding: { left: window.innerWidth > 760 ? 340 : 10, top: 20, right: 20, bottom: 20 } },
    hash: 'map',
    maxPitch: 75,
    attributionControl: { compact: true },
  });
  window.map = map; // handy for debugging in the console

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  map.addControl(new maplibregl.FullscreenControl(), 'top-right');

  await map.once('load');

  initReadout(map, $('readout'));
  loadClimate(climateMeta);
  await Promise.all([initPlaces(map), initHealth(map)]);
  wireLayerToggles(map, climateMeta);
  wireStations(map);
  wireSidebar();

  // click on empty map closes the detail panel
  map.on('click', (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: ['place-areas-fill', 'health-fill', 'stations-hsr', 'stations-fast', 'stations-other'].filter((l) => map.getLayer(l)) });
    if (!hits.length && isDetailOpen() && !e.originalEvent.target.closest('.place-marker')) closeDetail();
  });
}

function wireLayerToggles(map, meta) {
  const bind = (id, fn) => {
    const el = $(id);
    const run = () => {
      fn(el.checked);
      el.closest('.layer-group')?.classList.toggle('off', !el.checked);
    };
    el.addEventListener('change', run);
    run();
  };

  // hillshade over satellite shows ocean-floor artefacts, so it only applies to the map basemap
  let basemap = 'map';
  bind('lyr-hillshade', (on) => setVisible(map, GROUPS.hillshade, on && basemap === 'map'));
  bind('lyr-altitude', (on) => setVisible(map, GROUPS.altitude, on));
  bind('lyr-rail', (on) => {
    setVisible(map, GROUPS.rail, on);
    setVisible(map, GROUPS.railConv, on && $('lyr-rail-conv').checked);
    setVisible(map, GROUPS.stations, on && $('lyr-stations').checked);
  });
  bind('lyr-rail-conv', (on) => setVisible(map, GROUPS.railConv, on && $('lyr-rail').checked));
  bind('lyr-stations', (on) => setVisible(map, GROUPS.stations, on && $('lyr-rail').checked));
  bind('lyr-disease', (on) => setVisible(map, GROUPS.disease, on));
  bind('lyr-climate', (on) => setVisible(map, GROUPS.climate, on));
  bind('lyr-places', (on) => { setVisible(map, GROUPS.places, on); setPlacesVisible(on); });

  bind('lyr-3d', (on) => {
    if (!on && !map.getTerrain()) return; // initial state: nothing to undo
    if (on) {
      map.setTerrain({ source: 'terrain-dem', exaggeration: 1.4 });
      if (map.getPitch() < 30) map.easeTo({ pitch: 60, duration: 900 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, duration: 600 });
    }
  });

  // basemap
  $('basemap-switch').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-basemap]');
    if (!b) return;
    for (const x of $('basemap-switch').children) x.classList.toggle('active', x === b);
    basemap = b.dataset.basemap;
    setBasemap(map, basemap);
    setVisible(map, GROUPS.hillshade, basemap === 'map' && $('lyr-hillshade').checked);
  });

  // climate variable
  const ramp = $('climate-ramp');
  const setClimate = (v) => {
    map.getSource('climate').updateImage({ url: `data/climate/april-${v}.png` });
    const stops = v === 'prec' ? meta.prec_stops : meta.temp_stops.filter(([t]) => t >= -10);
    ramp.innerHTML = stops.map(([val, col]) => {
      const dark = v === 'prec' ? val >= 150 : val <= -10 || val >= 30;
      return `<span style="background:${col}" class="${dark ? 'dark' : ''}">${val}${v === 'prec' ? '' : '°'}</span>`;
    }).join('') + `<span style="flex:0 0 auto;padding:0 3px;background:#fff">${v === 'prec' ? 'mm' : '°C'}</span>`;
  };
  $('climate-switch').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-var]');
    if (!b) return;
    for (const x of $('climate-switch').children) x.classList.toggle('active', x === b);
    setClimate(b.dataset.var);
    if (!$('lyr-climate').checked) { $('lyr-climate').checked = true; $('lyr-climate').dispatchEvent(new Event('change')); }
  });
  setClimate('tmax');
}

function wireStations(map) {
  const popup = new maplibregl.Popup({ closeButton: false, offset: 10, maxWidth: '260px' });
  const label = { hsr: ['High-speed rail station', '#d7263d'], fast: ['Fast conventional line', '#f28f3b'], construction: ['On a line under construction', '#d7263d'], conventional: ['Conventional rail station', '#6c7a89'] };
  for (const layer of ['stations-hsr', 'stations-fast', 'stations-other']) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    map.on('click', layer, (e) => {
      e.originalEvent.cancelBubble = true;
      const p = e.features[0].properties;
      const [txt, col] = label[p.kind] || label.conventional;
      popup.setLngLat(e.features[0].geometry.coordinates).setHTML(`
        <div class="popup-title">${p.name_en}</div>
        <div class="popup-zh">${p.name}站</div>
        <span class="badge" style="--c:${col}">${txt}</span>
        <div class="popup-sub">Search trains: <a href="https://www.trip.com/trains/china/" target="_blank" rel="noopener">Trip.com</a> · <a href="https://www.12306.cn/en/index.html" target="_blank" rel="noopener">12306</a></div>`).addTo(map);
    });
  }
}

function wireSidebar() {
  const sb = $('sidebar');
  $('sidebar-toggle').addEventListener('click', () => sb.classList.toggle('collapsed'));
  if (window.innerWidth <= 760) sb.classList.add('collapsed');
  sb.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    sb.classList.remove('collapsed');
    for (const x of sb.querySelectorAll('.tab')) x.classList.toggle('active', x === t);
    for (const p of sb.querySelectorAll('.tab-panel')) p.classList.toggle('active', p.dataset.panel === t.dataset.tab);
  });
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<div class="readout" style="bottom:50%">Could not load the map: ${err.message}</div>`);
});
