// Right-hand detail panel: renders places and health zones.
import { CATEGORIES, WOW_VERDICT, CROWD_VERDICT, ALTITUDE_THRESHOLD } from './config.js';

const panel = document.getElementById('detail');
const content = document.getElementById('detail-content');
let onCloseCb = null;

document.getElementById('detail-close').addEventListener('click', () => closeDetail());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

export function onDetailClose(cb) { onCloseCb = cb; }

export function closeDetail() {
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  onCloseCb?.();
}

function open(html) {
  content.innerHTML = html;
  panel.scrollTop = 0;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
}

export const isDetailOpen = () => panel.classList.contains('open');

// ───────── tiny, safe markdown: paragraphs, - lists, **bold**, *italic*, [text](url)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

export function md(text) {
  if (!text) return '';
  const src = Array.isArray(text) ? text.join('\n\n') : text;
  return src.split(/\n\s*\n/).map((block) => {
    const lines = block.trim().split('\n');
    if (lines.every((l) => /^\s*[-*] /.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${inline(lines.join(' '))}</p>`;
  }).join('');
}

function icons(n, glyph) {
  return Array.from({ length: 5 }, (_, i) => `<span class="${i < n ? '' : 'off'}">${glyph}</span>`).join('');
}

function gallery(photos, fallbackIcon) {
  if (!photos?.length) return `<div class="gallery empty">${fallbackIcon}</div>`;
  const slides = photos.map((p) => ({
    src: p.src,
    credit: `${p.credit ? esc(p.credit) + ' · ' : ''}${esc(p.license || '')}${p.link ? ` · <a href="${esc(p.link)}" target="_blank" rel="noopener">source</a>` : ''}`,
  }));
  const multi = slides.length > 1;
  return `<div class="gallery" data-slides='${esc(JSON.stringify(slides))}' data-i="0">
    <img src="${esc(slides[0].src)}" alt="" loading="eager" referrerpolicy="no-referrer">
    ${multi ? `<span class="count">1 / ${slides.length}</span><button class="nav prev" aria-label="Previous photo">‹</button><button class="nav next" aria-label="Next photo">›</button>` : ''}
    <div class="credit">${slides[0].credit}</div>
  </div>`;
}

function wireGallery() {
  const g = content.querySelector('.gallery[data-slides]');
  if (!g) return;
  const slides = JSON.parse(g.dataset.slides);
  const show = (d) => {
    const i = (Number(g.dataset.i) + d + slides.length) % slides.length;
    g.dataset.i = i;
    g.querySelector('img').src = slides[i].src;
    g.querySelector('.credit').innerHTML = slides[i].credit;
    const c = g.querySelector('.count');
    if (c) c.textContent = `${i + 1} / ${slides.length}`;
  };
  g.querySelector('.prev')?.addEventListener('click', () => show(-1));
  g.querySelector('.next')?.addEventListener('click', () => show(1));
  // preload the rest
  slides.slice(1).forEach((s) => { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = s.src; });
}

function elevationText(el) {
  if (el == null) return null;
  const [lo, hi] = Array.isArray(el) ? el : [el, el];
  const txt = lo === hi ? `${lo.toLocaleString('en')} m` : `${lo.toLocaleString('en')}–${hi.toLocaleString('en')} m`;
  return hi >= ALTITUDE_THRESHOLD ? `<span class="warn">${txt} ⚠︎ above ${ALTITUDE_THRESHOLD.toLocaleString('en')} m</span>` : txt;
}

export function maxElevation(p) {
  if (p.elevation_m == null) return null;
  return Array.isArray(p.elevation_m) ? p.elevation_m[1] : p.elevation_m;
}

export function showPlace(p, { shortlisted, onShortlist, inside = [], partOf = [], onSelect } = {}) {
  const cat = CATEGORIES[p.category] || { label: p.category, color: '#666', icon: '📍' };
  const [lng, lat] = p.coordinates;
  const isRegion = p.kind === 'region';
  const facts = [
    ['Elevation', elevationText(p.elevation_m)],
    ['Overnight at', p.base_elevation_m != null ? elevationText(p.base_elevation_m) : null],
    ['Time needed', esc(p.time_needed)],
    ['Getting there', inline(p.access || '')],
    [isRegion ? 'Gateway stations' : 'Nearest station', esc(p.nearest_station)],
    ['Best for', esc(p.best_for)],
  ].filter(([, v]) => v);

  const links = [
    ...(p.links || []),
    { label: 'Amap 高德', url: `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(p.name_zh || p.name)}&coordinate=wgs84` },
    { label: 'OpenStreetMap', url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=13/${lat}/${lng}` },
  ];

  const kindLabel = { region: 'Region to explore', area: 'Protected area' }[p.kind];
  const placeChip = (q) => {
    const c = CATEGORIES[q.category] || { color: '#666', icon: '📍' };
    return `<button class="place-chip" data-goto="${esc(q.id)}" style="--c:${c.color}"><span>${c.icon}</span>${esc(q.name)} <small>${'★'.repeat(q.wow)}</small></button>`;
  };

  open(`
    ${gallery(p.photos, isRegion ? '🗺️' : cat.icon)}
    <div class="detail-body">
      <div class="kicker" style="--c:${cat.color}"><i></i><span>${kindLabel ? `<b>${kindLabel}</b> · ` : ''}${esc(cat.label)} · ${esc(p.region)}</span></div>
      <h2>${esc(p.name)}</h2>
      ${p.name_zh ? `<div class="zh">${esc(p.name_zh)}<button data-copy="${esc(p.name_zh)}" title="Copy Chinese name (for taxis, booking apps)">copy</button></div>` : ''}
      ${p.tagline ? `<p class="tagline">${inline(p.tagline)}</p>` : ''}

      <div class="ratings">
        <div class="rating"><div class="label">Wow factor</div><div class="icons">${icons(p.wow, '★')}</div><div class="verdict">${WOW_VERDICT[p.wow] || ''}</div></div>
        <div class="rating"><div class="label">People density</div><div class="icons">${icons(p.crowds, '👥')}</div><div class="verdict">${CROWD_VERDICT[p.crowds] || ''}</div></div>
      </div>

      <button class="shortlist-btn" data-shortlist>${shortlisted ? '♥ On our shortlist' : '♡ Add to shortlist'}</button>

      ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}

      ${partOf.length ? `<div class="part-of">Part of ${partOf.map((r) => `<button class="link-btn" data-goto="${esc(r.id)}">🗺️ ${esc(r.name)}</button>`).join(', ')}</div>` : ''}

      ${md(p.description)}
      ${inside.length ? `<h3>Spots in this ${isRegion ? 'region' : 'area'}</h3><div class="place-chips">${inside.map(placeChip).join('')}</div>` : ''}
      ${p.highlights?.length ? `<h3>${isRegion ? 'Don\'t miss' : 'Highlights'}</h3><ul>${p.highlights.map((h) => `<li>${inline(h)}</li>`).join('')}</ul>` : ''}
      ${p.getting_around ? `<h3>Getting around</h3>${md(p.getting_around)}` : ''}
      ${p.stay ? `<h3>Where to stay</h3>${md(p.stay)}` : ''}
      ${p.route_idea ? `<h3>Route idea</h3>${md(p.route_idea)}` : ''}
      ${p.crowd_tips ? `<h3>Beating the crowds</h3>${md(p.crowd_tips)}` : ''}
      ${p.april ? `<div class="callout april"><strong>In April:</strong> ${inline(p.april)}</div>` : ''}
      ${p.health ? `<div class="callout health"><strong>Health / pregnancy:</strong> ${inline(p.health)}</div>` : ''}
      <div class="links">${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>
      ${p.tags?.length ? `<div class="tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    </div>`);

  wireGallery();
  content.querySelector('[data-copy]')?.addEventListener('click', (e) => {
    navigator.clipboard?.writeText(e.target.dataset.copy);
    e.target.textContent = 'copied ✓';
  });
  content.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => onSelect?.(b.dataset.goto)));
  content.querySelector('[data-shortlist]')?.addEventListener('click', (e) => {
    const on = onShortlist?.();
    e.target.textContent = on ? '♥ On our shortlist' : '♡ Add to shortlist';
  });
}

export function showHealthZone(z) {
  open(`
    <div class="gallery empty" style="background:${esc(z.color)}22">${z.icon || '🦟'}</div>
    <div class="detail-body">
      <div class="kicker" style="--c:${esc(z.color)}"><i></i>Health · ${esc(z.group_label)}</div>
      <h2>${esc(z.title)}</h2>
      ${z.level_label ? `<p class="tagline">Risk level: <strong>${esc(z.level_label)}</strong></p>` : ''}
      ${md(z.summary)}
      ${z.april ? `<div class="callout april"><strong>In April:</strong> ${inline(z.april)}</div>` : ''}
      ${z.pregnancy ? `<div class="callout health"><strong>Pregnancy:</strong> ${inline(z.pregnancy)}</div>` : ''}
      ${z.prevention ? `<h3>Prevention</h3>${md(z.prevention)}` : ''}
      ${z.sources?.length ? `<h3>Sources</h3><div class="links">${z.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join('')}</div>` : ''}
      <p class="note" style="font-size:12px;color:#8a94a6;margin-top:18px">Curated summary as of ${esc(z.as_of || 'late 2026')} — not medical advice. Check current CDC/WHO notices and see a travel-medicine clinic ~6–8 weeks before departure.</p>
    </div>`);
}
