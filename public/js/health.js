// Health & disease-risk overlay: zones from data/health.json, legend with per-group toggles.
import { showHealthZone } from './detail.js';

let data = null;
let mapRef = null;
const enabledGroups = new Set();

export async function initHealth(map) {
  mapRef = map;
  data = await (await fetch('data/health.json')).json();
  const legend = document.getElementById('disease-legend');

  for (const g of data.groups) {
    if (g.default !== false) enabledGroups.add(g.id);
    legend.insertAdjacentHTML('beforeend', `
      <label class="disease-item">
        <input type="checkbox" data-group="${g.id}" ${g.default !== false ? 'checked' : ''}>
        <i class="sw" style="--c:${g.color};${g.dashed ? `background:none;border:2px dashed ${g.color}` : ''}"></i>
        <span>${g.label}</span>
      </label>`);
  }
  legend.insertAdjacentHTML('beforeend', `<p class="note">${data.general_note}</p>`);
  legend.addEventListener('change', (e) => {
    const id = e.target.dataset.group;
    if (!id) return;
    if (e.target.checked) enabledGroups.add(id); else enabledGroups.delete(id);
    update(map);
  });

  update(map);

  map.on('mouseenter', 'health-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'health-fill', () => { map.getCanvas().style.cursor = ''; });
}

function update(map) {
  const features = data.zones.features.filter((f) => enabledGroups.has(f.properties.group));
  // draw least severe first so severe zones end up on top
  features.sort((a, b) => a.properties.severity - b.properties.severity);
  map.getSource('health').setData({ type: 'FeatureCollection', features });
}

// Called by the central click handler (places.js). Returns true if a zone was opened.
export function healthZoneAt(point) {
  if (!data || mapRef.getLayoutProperty('health-fill', 'visibility') === 'none') return false;
  const hits = mapRef.queryRenderedFeatures([[point.x - 2, point.y - 2], [point.x + 2, point.y + 2]], { layers: ['health-fill'] });
  if (!hits.length) return false;
  const f = hits.sort((a, b) => b.properties.severity - a.properties.severity)[0];
  const zone = data.zones.features.find((z) => z.properties.id === f.properties.id);
  if (zone) showHealthZone(zone.properties);
  return !!zone;
}
