import * as maplibregl from 'maplibre-gl';
// MapLibre 6 runs its drawing code in a separate worker file. `?worker&url` makes Vite bundle it into a standalone
// file and give us its URL; without this the map stays blank with "Worker failed to load".
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Sheet, { type Sel } from '../components/Sheet';
import { useData } from '../data';
import { CONFLICTS, colorFor, conflictFor, conflictStats, levelOf, type Level } from '../lib/conflicts';
import { PLANE, addIcons } from '../lib/icons';
import { eventKind, planeKind, planeRank, vesselKindOf } from '../lib/kinds';
import { FUEL, accessColor, loadPower, type Power } from '../lib/power';
import { usePrefs } from '../lib/prefs';
import { agoText } from '../lib/time';
import { tensionColor, tensionLevel, tensionSeries } from '../lib/tension';
import type { Ev } from '../types';
import { activityZones, adminZones } from '../lib/zones';

maplibregl.setWorkerUrl(workerUrl);

const STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};
// Natural Earth 110m country polygons, used for click-to-select, highlight and the power shading.
const COUNTRIES = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson';
const EMPTY = { type: 'FeatureCollection', features: [] };
const CLICKABLE = ['events', 'planes', 'vessels', 'plants-big', 'plants'];
const GROUPS: Record<string, string[]> = {
  Events: ['ev-glow', 'events', 'pulse'],
  'Conflict zones': ['zones-fill', 'zones-glow', 'zones-line'],
  'Conflict labels': [],
  Heatmap: ['heat'],
  'Military aircraft': ['planes'],
  Vessels: ['vessels'],
  'Power grid': ['power-fill', 'plants-big', 'plants'],
};
const DEFAULT_ON = new Set(['Events', 'Conflict zones', 'Conflict labels', 'Military aircraft', 'Vessels']);
// Cluster badges are HTML markers (no map fonts needed). Which layer group hides them is listed here.
const CLUSTERS = [
  { src: 'events', group: 'Events', cls: 'ev' },
  { src: 'planes', group: 'Military aircraft', cls: 'pl' },
  { src: 'vessels', group: 'Vessels', cls: 'sh' },
] as const;
const sevColor = ['match', ['get', 'severity'], 3, '#ff453a', 2, '#ff9f0a', '#ffd60a'];
const fuelColor = ['match', ['get', 'f'], ...Object.entries(FUEL).flatMap(([k, [, c]]) => [k, c]), '#adb5bd'];
const plantRadius = (lo: number, hi: number) => [
  'interpolate', ['linear'], ['zoom'],
  1, ['interpolate', ['linear'], ['get', 'm'], 100, lo, 20000, hi],
  8, ['interpolate', ['linear'], ['get', 'm'], 100, lo * 2.2, 20000, hi * 2.2],
];

const pt = (lon: number, lat: number, properties: object) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] } });
const readGlobe = () => { try { return localStorage.getItem('globe') !== '0'; } catch { return true; } };

function setup(m: maplibregl.Map) {
  addIcons(m);
  // Shaded areas go under the basemap's labels; icons go on top of everything.
  const before = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  const cluster = (radius: number, max: number) => ({ type: 'geojson', data: EMPTY, cluster: true, clusterRadius: radius, clusterMaxZoom: max, clusterProperties: { sev: ['max', ['get', 'severity']] } }) as never;
  m.addSource('countries', { type: 'geojson', data: COUNTRIES });
  for (const id of ['zones', 'plants', 'pulse', 'evraw', 'focus']) m.addSource(id, { type: 'geojson', data: EMPTY as never });
  m.addSource('events', cluster(44, 6));
  m.addSource('planes', cluster(52, 7));
  m.addSource('vessels', cluster(52, 7));

  m.addLayer({ id: 'countries', type: 'fill', source: 'countries', paint: { 'fill-color': '#000', 'fill-opacity': 0 } }, before);
  m.addLayer({ id: 'power-fill', type: 'fill', source: 'countries', paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0.38 } }, before);
  m.addLayer({ id: 'country-hl', type: 'fill', source: 'countries', filter: ['==', ['get', 'NAME'], ''], paint: { 'fill-color': '#4cc9f0', 'fill-opacity': 0.16 } }, before);
  m.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'admin'], 0.3, 0.16] } }, before);
  m.addLayer({ id: 'zones-glow', type: 'line', source: 'zones', paint: { 'line-color': ['get', 'color'], 'line-width': 8, 'line-blur': 6, 'line-opacity': 0.35 } }, before);
  m.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.9 } }, before);
  m.addLayer({
    id: 'heat', type: 'heatmap', source: 'evraw',
    layout: { visibility: 'none' },
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'severity'], 1, 0.3, 3, 1],
      'heatmap-radius': 28,
      'heatmap-opacity': 0.55,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.3, '#ffb703', 0.6, '#fb5607', 1, '#d00000'],
    },
  }, before);

  const plantPaint = (lo: number, hi: number) => ({ 'circle-radius': plantRadius(lo, hi), 'circle-color': fuelColor, 'circle-opacity': 0.9, 'circle-stroke-width': 0.6, 'circle-stroke-color': 'rgba(255,255,255,.85)' }) as never;
  m.addLayer({ id: 'plants', type: 'circle', source: 'plants', minzoom: 4, filter: ['<', ['get', 'm'], 1000], layout: { visibility: 'none' }, paint: plantPaint(1.6, 5) });
  m.addLayer({ id: 'plants-big', type: 'circle', source: 'plants', filter: ['>=', ['get', 'm'], 1000], layout: { visibility: 'none' }, paint: plantPaint(3, 8) });

  const unclustered = ['!', ['has', 'point_count']];
  const size = ['interpolate', ['linear'], ['zoom'], 1, 0.55, 6, 0.85, 10, 1.1] as never;
  m.addLayer({ id: 'pulse', type: 'circle', source: 'pulse', paint: { 'circle-radius': 8, 'circle-color': '#ff453a', 'circle-opacity': 0.4 } });
  m.addLayer({ id: 'ev-glow', type: 'circle', source: 'events', filter: unclustered as never, paint: { 'circle-radius': 15, 'circle-color': sevColor as never, 'circle-blur': 0.9, 'circle-opacity': 0.3 } });
  m.addLayer({
    id: 'vessels', type: 'symbol', source: 'vessels', filter: unclustered as never,
    layout: { 'icon-image': ['concat', 'ship-', ['get', 'kind']], 'icon-rotate': ['get', 'hdg'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-size': size },
  });
  m.addLayer({
    id: 'planes', type: 'symbol', source: 'planes', filter: unclustered as never,
    layout: { 'icon-image': ['get', 'kind'], 'icon-rotate': ['get', 'trk'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-size': size },
  });
  m.addLayer({ id: 'focus', type: 'circle', source: 'focus', paint: { 'circle-radius': 20, 'circle-color': 'rgba(255,255,255,0)', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#fff' } });
  m.addLayer({
    id: 'events', type: 'symbol', source: 'events', filter: unclustered as never,
    layout: { 'icon-image': ['concat', 'ev-', ['get', 'kind'], '-', ['to-string', ['get', 'severity']]], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': size, 'symbol-sort-key': ['get', 'severity'] },
  });
}

/** Switch between the 3D globe and the flat map, and keep the user from zooming out past the edge of the world. */
function setLimits(m: maplibregl.Map, globe: boolean) {
  const c = m.getContainer();
  m.setMaxBounds(globe ? null : [[-180, -85], [180, 85]]);
  m.setMinZoom(globe ? 1 : Math.max(1, Math.log2(Math.max(c.clientWidth, c.clientHeight) / 512)));
}
function setView(m: maplibregl.Map, globe: boolean) {
  try { m.setProjection({ type: globe ? 'globe' : 'mercator' }); } catch (e) { console.warn('projection:', e); }
  try { if (globe) m.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] } as never); } catch { /* sky is cosmetic */ }
  setLimits(m, globe);
}

export default function MapTab({ active }: { active: boolean }) {
  const { events, vessels, zones, planes } = useData();
  const { theme } = usePrefs();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | undefined>(undefined);
  const firstTheme = useRef(true);
  const clusterMarkers = useRef(new Map<string, maplibregl.Marker>());
  const hotMarkers = useRef<maplibregl.Marker[]>([]);
  const [vis, setVis] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(GROUPS).map((k) => [k, DEFAULT_ON.has(k)])));
  const [sel, setSel] = useState<Sel | null>(null);
  const [globe, setGlobe] = useState(readGlobe);
  const [win, setWin] = useState(72); // hours of events to show
  const [panel, setPanel] = useState(false);
  const [power, setPower] = useState<Power | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ label: string; sub: string; go: () => void }[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState<Ev | null>(null);
  // Map callbacks outlive renders, so they read the latest values from here.
  const live = useRef({ events, vessels, zones, planes, vis, win, power, globe });
  live.current = { events, vessels, zones, planes, vis, win, power, globe };

  const inWindow = useMemo(() => events.filter((e) => Date.now() - e.ts < win * 36e5), [events, win]);
  const stats = useMemo(() => conflictStats(inWindow), [inWindow]);

  const pick = (s: Sel | null, fly?: { lon: number; lat: number; zoom: number }) => {
    setSel(s);
    setPlaying(false);
    if (fly) map.current?.flyTo({ center: [fly.lon, fly.lat], zoom: Math.max(map.current.getZoom(), fly.zoom), essential: true });
  };

  const syncClusters = () => {
    const m = map.current;
    if (!m) return;
    const store = clusterMarkers.current;
    const seen = new Set<string>();
    for (const { src, group, cls } of CLUSTERS) {
      if (!m.getSource(src) || !m.isSourceLoaded(src)) continue;
      for (const f of m.querySourceFeatures(src, { filter: ['has', 'point_count'] })) {
        const p = f.properties as { cluster_id: number; point_count: number; sev?: number };
        const key = `${src}:${p.cluster_id}`;
        seen.add(key);
        const at = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
        let mk = store.get(key);
        if (!mk) {
          const el = document.createElement('button');
          const n = p.point_count;
          const d = Math.round(26 + Math.min(22, Math.log2(n) * 5));
          el.className = `cl ${cls}${cls === 'ev' ? ` sev${p.sev ?? 1}` : ''}`;
          el.style.width = el.style.height = `${d}px`;
          el.textContent = n > 999 ? `${Math.round(n / 100) / 10}k` : String(n);
          el.title = `${n} items. Tap to zoom in.`;
          el.onclick = () => (m.getSource(src) as maplibregl.GeoJSONSource).getClusterExpansionZoom(p.cluster_id).then((z) => m.easeTo({ center: at, zoom: z + 0.4 }));
          if (src === 'planes') {
            // Show the most notable aircraft in the bunch (its callsign and heading) instead of just a count.
            (m.getSource(src) as maplibregl.GeoJSONSource).getClusterLeaves(p.cluster_id, 80, 0).then((leaves) => {
              const top = leaves.reduce((a, b) => (Number(b.properties?.rank) > Number(a.properties?.rank) ? b : a));
              const t = (top.properties ?? {}) as Record<string, unknown>;
              const label = String(t.label ?? '').replace(/[<>&"]/g, '');
              el.className = 'cl pl main';
              el.style.width = el.style.height = '';
              el.innerHTML = `<svg viewBox="0 0 24 24" style="transform:rotate(${Number(t.trk) || 0}deg)"><path d="${PLANE}"/></svg><b>${label}</b><i>+${n - 1}</i>`;
              el.title = `${label} and ${n - 1} more aircraft here. Tap to zoom in.`;
            }).catch(() => { /* keep the plain count badge */ });
          }
          mk = new maplibregl.Marker({ element: el }).setLngLat(at).addTo(m);
          store.set(key, mk);
        }
        mk.getElement().style.display = live.current.vis[group] ? '' : 'none';
      }
    }
    for (const [key, mk] of store) if (!seen.has(key)) { mk.remove(); store.delete(key); }
  };

  const push = () => {
    const m = map.current;
    if (!m) return;
    const L = live.current;
    const now = Date.now();
    const evs = L.events.filter((e) => now - e.ts < L.win * 36e5);
    const set = (id: string, data: unknown) => (m.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data as never);
    const fc = (features: unknown[]) => ({ type: 'FeatureCollection', features });
    const evFeatures = evs.map((e) => pt(e.lon, e.lat, { id: e.id, severity: e.severity, kind: eventKind(e.type, e.power) }));
    set('events', fc(evFeatures));
    set('evraw', fc(evFeatures)); // unclustered copy for the heatmap
    set('pulse', fc(evs.filter((e) => e.severity === 3 && now - e.ts < 6 * 36e5).map((e) => pt(e.lon, e.lat, {}))));
    set('planes', fc(L.planes.map((p) => pt(p.lon, p.lat, { id: p.hex, kind: planeKind(p), trk: p.trk ?? 0, rank: planeRank(p), label: p.flight?.trim() || p.t || p.hex }))));
    set('vessels', fc(L.vessels.map((v) => pt(v.lon, v.lat, { id: v.mmsi, kind: vesselKindOf(v), hdg: v.hdg ?? 0 }))));
    const zoneKey = (e: (typeof evs)[number]) => {
      const c = conflictFor(e);
      return c ? { key: c.id, name: c.name, color: colorFor(c.id) } : { key: e.conflict, name: e.conflict, color: colorFor(e.conflict) };
    };
    set('zones', fc([...activityZones(evs, now, zoneKey).features, ...adminZones(L.zones)]));
    if (L.power) {
      set('plants', fc(L.power.plants.map((p) => pt(p.x, p.y, { n: p.n, m: p.m, f: p.f, c: p.c }))));
      const pairs = Object.entries(L.power.stats).flatMap(([iso, s]) => (s.access === undefined ? [] : [iso, accessColor(s.access)]));
      if (m.getLayer('power-fill')) m.setPaintProperty('power-fill', 'fill-color', pairs.length ? ['match', ['get', 'ISO_A3_EH'], ...pairs, 'rgba(0,0,0,0)'] : 'rgba(0,0,0,0)');
    }
    // A fresh data set means fresh cluster ids, so rebuild the cluster badges once the source has reloaded.
    for (const mk of clusterMarkers.current.values()) mk.remove();
    clusterMarkers.current.clear();
    drawHotspots();
  };

  const drawHotspots = () => {
    const m = map.current;
    if (!m) return;
    hotMarkers.current.forEach((h) => h.remove());
    hotMarkers.current = [];
    const { byId, other } = conflictStats(live.current.events.filter((e) => Date.now() - e.ts < live.current.win * 36e5));
    const add = (name: string, lon: number, lat: number, day: number, s: Sel, zoom: number) => {
      const lvl: Level = levelOf(day);
      const el = document.createElement('button');
      el.className = `hot ${lvl}`;
      el.innerHTML = `<i></i><span class="lb">${name.replace(/[<>&]/g, '')}</span>`;
      el.onclick = () => pick(s, { lon, lat, zoom });
      const mk = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(m);
      mk.getElement().style.display = live.current.vis['Conflict labels'] ? '' : 'none';
      hotMarkers.current.push(mk);
    };
    for (const c of CONFLICTS) add(c.name, c.lon, c.lat, byId.get(c.id)!.day, { kind: 'conflict', id: c.id }, c.zoom);
    for (const [name, st] of other) {
      const evs = live.current.events.filter((e) => e.conflict === name);
      if (!evs.length) continue;
      const lat = evs.reduce((a, e) => a + e.lat, 0) / evs.length, lon = evs.reduce((a, e) => a + e.lon, 0) / evs.length;
      add(name, lon, lat, st.day, { kind: 'conflict', id: name, other: name }, 5);
    }
  };

  const applyVis = () => {
    const m = map.current;
    if (!m) return;
    const v = live.current.vis;
    for (const [g, layers] of Object.entries(GROUPS)) for (const l of layers) if (m.getLayer(l)) m.setLayoutProperty(l, 'visibility', v[g] ? 'visible' : 'none');
    for (const h of hotMarkers.current) h.getElement().style.display = v['Conflict labels'] ? '' : 'none';
    for (const { src, group } of CLUSTERS) for (const [k, mk] of clusterMarkers.current) if (k.startsWith(src + ':')) mk.getElement().style.display = v[group] ? '' : 'none';
  };

  useEffect(() => {
    const g = live.current.globe;
    const m = new maplibregl.Map({
      container: box.current!, style: STYLES[theme], center: [30, 25], zoom: g ? 1.6 : 2.2,
      renderWorldCopies: false, maxZoom: 12, attributionControl: { compact: true },
    });
    map.current = m;
    m.on('style.load', () => { setup(m); setView(m, live.current.globe); push(); applyVis(); });
    m.on('error', (e: { error?: unknown }) => console.warn('map:', e.error ?? e));
    m.on('sourcedata', (e: { sourceId?: string; isSourceLoaded?: boolean }) => { if (e.isSourceLoaded && CLUSTERS.some((c) => c.src === e.sourceId)) syncClusters(); });
    m.on('moveend', syncClusters);
    m.on('zoom', () => box.current?.classList.toggle('zin', m.getZoom() >= 3.4));
    m.on('resize', () => setLimits(m, live.current.globe));
    m.on('mousemove', (e: maplibregl.MapMouseEvent) => {
      const layers = [...CLICKABLE, 'zones-fill'].filter((l) => m.getLayer(l));
      m.getCanvas().style.cursor = layers.length && m.queryRenderedFeatures(e.point, { layers }).length ? 'pointer' : '';
    });
    m.on('click', (e: maplibregl.MapMouseEvent) => {
      const L = live.current;
      const q = (layers: string[]) => m.queryRenderedFeatures(e.point, { layers: layers.filter((l) => m.getLayer(l)) })[0];
      const hit = q(CLICKABLE);
      if (hit) {
        const p = hit.properties as Record<string, string | number>;
        const id = String(p.id);
        if (hit.layer.id === 'events') { const x = L.events.find((v) => v.id === id); if (x) return pick({ kind: 'event', e: x }); }
        if (hit.layer.id === 'planes') { const x = L.planes.find((v) => v.hex === id); if (x) return pick({ kind: 'plane', p: x }); }
        if (hit.layer.id === 'vessels') { const x = L.vessels.find((v) => String(v.mmsi) === id); if (x) return pick({ kind: 'vessel', v: x }); }
        if (hit.layer.id.startsWith('plants')) {
          const x = L.power?.plants.find((v) => v.n === p.n && v.m === p.m && v.c === p.c);
          if (x) return pick({ kind: 'plant', p: x });
        }
      }
      const z = q(['zones-fill']);
      if (z) return pick({ kind: 'zone', props: z.properties as Record<string, unknown> });
      const c = q(['countries']);
      if (!c) return pick(null);
      const p = c.properties as Record<string, string>;
      pick({ kind: 'country', title: p.NAME, iso: p.ISO_A3_EH || p.ISO_A3 || p.ADM0_A3, names: [p.NAME, p.NAME_LONG, p.ADMIN, p.SOVEREIGNT].filter(Boolean) });
    });
    return () => { clusterMarkers.current.clear(); hotMarkers.current = []; m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstTheme.current) { firstTheme.current = false; return; }
    map.current?.setStyle(STYLES[theme], { diff: false }); // full reload so 'style.load' re-adds our layers
  }, [theme]);
  useEffect(push, [events, vessels, zones, planes, win, power]);
  useEffect(applyVis, [vis]);
  useEffect(() => {
    const m = map.current;
    if (m?.getLayer('country-hl')) m.setFilter('country-hl', ['==', ['get', 'NAME'], sel?.kind === 'country' ? sel.title : '']);
  }, [sel]);
  useEffect(() => {
    if (map.current) setView(map.current, globe);
    try { localStorage.setItem('globe', globe ? '1' : '0'); } catch { /* private mode */ }
  }, [globe]);
  // Power data is only fetched when someone asks for it (the layer or a country's Power tab).
  useEffect(() => {
    if (power || !(vis['Power grid'] || sel?.kind === 'country')) return;
    loadPower().then(setPower).catch((e) => console.warn('power data:', e));
  }, [vis, sel, power]);
  useEffect(() => { if (active) setTimeout(() => map.current?.resize(), 0); }, [active]);

  // Slow pulsing ring around the latest major events.
  useEffect(() => {
    let raf = 0, last = 0;
    const tick = (t: number) => {
      const m = map.current;
      if (active && m?.getLayer('pulse') && t - last > 50) {
        last = t;
        const p = (t % 2200) / 2200;
        m.setPaintProperty('pulse', 'circle-radius', 8 + 26 * p);
        m.setPaintProperty('pulse', 'circle-opacity', 0.45 * (1 - p));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // Play: fly through the newest events one by one, like a live replay.
  useEffect(() => {
    if (!playing) { setCur(null); return; }
    const queue = [...live.current.events].filter((e) => Date.now() - e.ts < 24 * 36e5).sort((a, b) => b.ts - a.ts).slice(0, 40);
    if (!queue.length) { setPlaying(false); return; }
    let i = 0;
    const step = () => {
      const e = queue[i++ % queue.length];
      setCur(e);
      map.current?.flyTo({ center: [e.lon, e.lat], zoom: 5, duration: 2500, essential: true });
    };
    step();
    const t = setInterval(step, 6000);
    return () => clearInterval(t);
  }, [playing]);
  useEffect(() => {
    (map.current?.getSource('focus') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: cur ? [pt(cur.lon, cur.lat, {})] : [] } as never);
  }, [cur]);

  const search = async (ev: FormEvent) => {
    ev.preventDefault();
    const s = q.trim().toLowerCase();
    if (s.length < 2) return;
    const out: { label: string; sub: string; go: () => void }[] = [];
    for (const c of CONFLICTS)
      if (`${c.name} ${c.countries.join(' ')}`.toLowerCase().includes(s)) out.push({ label: c.name, sub: 'Conflict', go: () => pick({ kind: 'conflict', id: c.id }, { lon: c.lon, lat: c.lat, zoom: c.zoom }) });
    for (const p of planes.filter((x) => (x.flight ?? '').toLowerCase().includes(s) || x.hex === s).slice(0, 3))
      out.push({ label: p.flight?.trim() || p.hex, sub: `Aircraft ${p.desc ?? p.t ?? ''}`, go: () => pick({ kind: 'plane', p }, { lon: p.lon, lat: p.lat, zoom: 7 }) });
    for (const v of vessels.filter((x) => x.name.toLowerCase().includes(s)).slice(0, 3))
      out.push({ label: v.name, sub: 'Vessel', go: () => pick({ kind: 'vessel', v }, { lon: v.lon, lat: v.lat, zoom: 7 }) });
    setHits([...out]);
    try {
      // OpenStreetMap's free place search; only called when the user presses Enter, as its usage policy asks.
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=${encodeURIComponent(q.trim())}`);
      const places: { display_name: string; type: string; boundingbox: string[]; lat: string; lon: string }[] = await r.json();
      for (const x of places) {
        const [south, north, west, east] = x.boundingbox.map(Number);
        out.push({
          label: x.display_name.split(', ').slice(0, 3).join(', '), sub: 'Place',
          go: () => { setSel(null); map.current?.fitBounds([[west, south], [east, north]], { padding: 60, maxZoom: 9, duration: 1800 }); },
        });
      }
      setHits([...out]);
    } catch { /* offline or blocked: the local matches above still show */ }
    if (!out.length) setHits([]);
  };

  const series = useMemo(() => tensionSeries(events), [events]);
  const tNow = series[series.length - 1], tYesterday = series[series.length - 9];

  const list = useMemo(() => {
    const rows = CONFLICTS.map((c) => ({ id: c.id, name: c.name, region: c.region, st: stats.byId.get(c.id)!, s: { kind: 'conflict', id: c.id } as Sel, lon: c.lon, lat: c.lat, zoom: c.zoom }));
    for (const [name, st] of stats.other) {
      const evs = inWindow.filter((e) => e.conflict === name);
      if (evs.length) rows.push({ id: name, name, region: 'Other', st, s: { kind: 'conflict', id: name, other: name }, lon: evs[0].lon, lat: evs[0].lat, zoom: 5 });
    }
    return rows.sort((a, b) => b.st.day - a.st.day || b.st.total - a.st.total);
  }, [stats, inWindow]);

  return (
    <div className="mapwrap">
      <div ref={box} className="mapbox" />
      <div className="mapbar">
        <form className="search" onSubmit={search}>
          <input value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setHits(null); }} placeholder="Search places, conflicts, flights, ships" aria-label="Search the globe" />
          <button type="submit" aria-label="Search">🔍</button>
          {hits && (
            <div className="hits">
              {hits.length === 0 && <small className="muted">No matches.</small>}
              {hits.map((h, i) => <button key={i} type="button" onClick={() => { h.go(); setHits(null); }}><b>{h.label}</b><small className="muted">{h.sub}</small></button>)}
            </div>
          )}
        </form>
        <button className={panel ? 'on' : ''} onClick={() => setPanel(!panel)}>☰ Conflicts <b>{list.filter((r) => r.st.total).length}</b></button>
        <div className="seg">
          {[[24, '24h'], [72, '3 days']].map(([h, l]) => <button key={h} className={win === h ? 'on' : ''} onClick={() => setWin(h as number)}>{l}</button>)}
        </div>
        <button className={playing ? 'on' : ''} onClick={() => setPlaying(!playing)} title="Fly through the latest events">{playing ? '⏸ Live' : '▶ Live'}</button>
        <button onClick={() => setGlobe(!globe)} title="Switch between the 3D globe and the flat map">{globe ? '🌐 3D' : '🗺 2D'}</button>
      </div>
      <details className="layers">
        <summary>Layers</summary>
        {Object.keys(GROUPS).map((g) => (
          <label key={g}>
            <input type="checkbox" checked={vis[g]} onChange={() => setVis({ ...vis, [g]: !vis[g] })} /> {g}
          </label>
        ))}
        {vis['Power grid'] && (
          <small className="legend">
            {Object.values(FUEL).slice(0, 6).map(([n, c]) => <span key={n}><i style={{ background: c }} />{n}</span>)}
            <span className="muted">Country shading: share of people with electricity (red low, green high)</span>
          </small>
        )}
        <small className="muted">{planes.length} aircraft · {vessels.length} vessels</small>
      </details>
      {panel && (
        <div className="cpanel">
          {list.map((r) => {
            const lvl = levelOf(r.st.day);
            return (
              <button key={r.id} className="crow" onClick={() => { pick(r.s, { lon: r.lon, lat: r.lat, zoom: r.zoom }); setPanel(false); }}>
                <i className={`dot ${lvl}`} />
                <span><b>{r.name}</b><small className="muted">{r.region}</small></span>
                <em>{r.st.day}<small className="muted">24h</small></em>
              </button>
            );
          })}
        </div>
      )}
      {cur && (
        <button className="live" onClick={() => pick({ kind: 'event', e: cur })}>
          <b>● LIVE</b> <span>{agoText(cur.ts)}</span> <em>{cur.title}</em> <small>{cur.source}</small>
        </button>
      )}
      <div className="tension" title="Based on how many conflict reports came in over the last 24 hours, with serious ones counting more. A rough, relative measure, not a scientific one.">
        <div>
          <small>World tension</small>
          <b style={{ color: tensionColor(tNow) }}>{tNow}</b>
          <span>{tensionLevel(tNow)}</span>
          <small style={{ color: tNow > tYesterday ? 'var(--accent)' : 'var(--muted)' }}>{tNow === tYesterday ? 'steady' : `${tNow > tYesterday ? '▲' : '▼'} ${Math.abs(tNow - tYesterday)} vs yesterday`}</small>
        </div>
        <svg viewBox="0 0 120 36" preserveAspectRatio="none" aria-label="Tension over the last 48 hours">
          <polyline fill="none" stroke={tensionColor(tNow)} strokeWidth="2" strokeLinejoin="round" points={series.map((v, i) => `${(i * 120) / (series.length - 1)},${34 - (v / 100) * 32}`).join(' ')} />
        </svg>
      </div>
      {sel && <Sheet sel={sel} events={events} power={power} close={() => setSel(null)} pick={pick} />}
    </div>
  );
}
