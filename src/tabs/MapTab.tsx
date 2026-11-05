import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import Translate from '../components/Translate';
import { useData } from '../data';
import { usePrefs } from '../lib/prefs';
import { ago } from '../lib/time';
import { wikiLookup, type Wiki } from '../lib/wiki';
import { activityZones, adminZones } from '../lib/zones';
import type { Ev, Plane, Vessel } from '../types';

const STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};
// Natural Earth 110m country polygons, used only for click-to-select + highlight.
const COUNTRIES = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson';
const EMPTY = { type: 'FeatureCollection', features: [] };
const GROUPS: Record<string, string[]> = {
  Events: ['events'],
  Heatmap: ['heat'],
  'Activity zones': ['zones-fill', 'zones-line'],
  'Military aircraft': ['planes'],
  Vessels: ['vessels'],
};

type Sel =
  | { kind: 'country'; title: string; names: string[] }
  | { kind: 'event'; e: Ev }
  | { kind: 'plane'; p: Plane }
  | { kind: 'vessel'; v: Vessel };

const pt = (lon: number, lat: number, properties: object) => ({
  type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] },
});

function setup(m: maplibregl.Map) {
  m.addSource('countries', { type: 'geojson', data: COUNTRIES });
  for (const id of ['zones', 'events', 'planes', 'vessels']) m.addSource(id, { type: 'geojson', data: EMPTY as never });
  m.addLayer({ id: 'countries', type: 'fill', source: 'countries', paint: { 'fill-color': '#000', 'fill-opacity': 0 } });
  m.addLayer({ id: 'country-hl', type: 'fill', source: 'countries', filter: ['==', ['get', 'NAME'], ''], paint: { 'fill-color': '#4cc9f0', 'fill-opacity': 0.16 } });
  m.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 } });
  m.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [2, 2] } });
  m.addLayer({
    id: 'heat', type: 'heatmap', source: 'events',
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'severity'], 1, 0.3, 3, 1],
      'heatmap-radius': 28,
      'heatmap-opacity': 0.55,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.3, '#ffb703', 0.6, '#fb5607', 1, '#d00000'],
    },
  });
  m.addLayer({ id: 'vessels', type: 'circle', source: 'vessels', paint: { 'circle-radius': 3.5, 'circle-color': ['case', ['get', 'navy'], '#c77dff', '#8d99ae'], 'circle-stroke-width': 0.5, 'circle-stroke-color': '#fff' } });
  m.addLayer({ id: 'planes', type: 'circle', source: 'planes', paint: { 'circle-radius': 4.5, 'circle-color': '#4cc9f0', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' } });
  m.addLayer({
    id: 'events', type: 'circle', source: 'events',
    paint: {
      'circle-radius': ['+', 3, ['*', 2, ['get', 'severity']]],
      'circle-color': ['match', ['get', 'severity'], 3, '#ff3b30', 2, '#ff9f0a', '#ffd60a'],
      'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9,
    },
  });
}

export default function MapTab({ active }: { active: boolean }) {
  const { events, vessels, zones, planes } = useData();
  const { theme } = usePrefs();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | undefined>(undefined);
  const firstTheme = useRef(true);
  const [vis, setVis] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(GROUPS).map((k) => [k, true])));
  const [sel, setSel] = useState<Sel | null>(null);
  // Map callbacks outlive renders, so they read the latest values from here.
  const live = useRef({ events, vessels, zones, planes, vis });
  live.current = { events, vessels, zones, planes, vis };

  const push = () => {
    const m = map.current;
    if (!m) return;
    const L = live.current;
    const set = (id: string, data: unknown) => (m.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data as never);
    set('events', { type: 'FeatureCollection', features: L.events.map((e) => pt(e.lon, e.lat, { id: e.id, severity: e.severity })) });
    set('planes', { type: 'FeatureCollection', features: L.planes.map((p) => pt(p.lon, p.lat, { id: p.hex })) });
    set('vessels', { type: 'FeatureCollection', features: L.vessels.map((v) => pt(v.lon, v.lat, { id: v.mmsi, navy: v.navy })) });
    set('zones', { type: 'FeatureCollection', features: [...activityZones(L.events).features, ...adminZones(L.zones)] });
  };
  const applyVis = () => {
    const m = map.current;
    if (!m) return;
    for (const [g, layers] of Object.entries(GROUPS))
      for (const l of layers) if (m.getLayer(l)) m.setLayoutProperty(l, 'visibility', live.current.vis[g] ? 'visible' : 'none');
  };

  useEffect(() => {
    const m = new maplibregl.Map({ container: box.current!, style: STYLES[theme], center: [30, 28], zoom: 2, attributionControl: { compact: true } });
    map.current = m;
    m.on('style.load', () => { setup(m); push(); applyVis(); });
    m.on('click', (e: maplibregl.MapMouseEvent) => {
      const L = live.current;
      const hit = m.queryRenderedFeatures(e.point, { layers: ['events', 'planes', 'vessels'].filter((l) => m.getLayer(l)) })[0];
      if (hit) {
        const id = String(hit.properties?.id);
        if (hit.layer.id === 'events') { const x = L.events.find((v) => v.id === id); if (x) return setSel({ kind: 'event', e: x }); }
        if (hit.layer.id === 'planes') { const x = L.planes.find((v) => v.hex === id); if (x) return setSel({ kind: 'plane', p: x }); }
        if (hit.layer.id === 'vessels') { const x = L.vessels.find((v) => String(v.mmsi) === id); if (x) return setSel({ kind: 'vessel', v: x }); }
      }
      const c = m.getLayer('countries') ? m.queryRenderedFeatures(e.point, { layers: ['countries'] })[0] : undefined;
      if (!c) return setSel(null);
      const p = c.properties as Record<string, string>;
      setSel({ kind: 'country', title: p.NAME, names: [p.NAME, p.NAME_LONG, p.ADMIN, p.SOVEREIGNT].filter(Boolean) });
    });
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstTheme.current) { firstTheme.current = false; return; }
    map.current?.setStyle(STYLES[theme], { diff: false }); // full reload so 'style.load' re-adds our layers
  }, [theme]);
  useEffect(push, [events, vessels, zones, planes]);
  useEffect(applyVis, [vis]);
  useEffect(() => {
    const m = map.current;
    if (m?.getLayer('country-hl')) m.setFilter('country-hl', ['==', ['get', 'NAME'], sel?.kind === 'country' ? sel.title : '']);
  }, [sel]);
  useEffect(() => { if (active) setTimeout(() => map.current?.resize(), 0); }, [active]);

  return (
    <div className="mapwrap">
      <div ref={box} className="mapbox" />
      <details className="layers">
        <summary>Layers</summary>
        {Object.keys(GROUPS).map((g) => (
          <label key={g}>
            <input type="checkbox" checked={vis[g]} onChange={() => setVis({ ...vis, [g]: !vis[g] })} /> {g}
          </label>
        ))}
        <small className="muted">{planes.length} aircraft · {vessels.length} vessels</small>
      </details>
      {sel && <Sheet sel={sel} events={events} close={() => setSel(null)} />}
    </div>
  );
}

function WikiCard({ q }: { q: string }) {
  const [w, setW] = useState<Wiki | null | undefined>();
  useEffect(() => { setW(undefined); wikiLookup(q).then(setW); }, [q]);
  if (w === undefined) return <p className="muted">Loading…</p>;
  if (!w) return <p className="muted">No Wikipedia entry found.</p>;
  return (
    <div className="wiki">
      {w.img && <img src={w.img} alt={w.title} />}
      <h4>{w.title}</h4>
      <p>{w.extract}</p>
      <a href={w.url} target="_blank" rel="noreferrer">Wikipedia ↗</a>
    </div>
  );
}

function Sheet({ sel, events, close }: { sel: Sel; events: Ev[]; close: () => void }) {
  let body;
  if (sel.kind === 'country') {
    const names = sel.names.map((n) => n.toLowerCase());
    const list = events.filter((e) => names.includes(e.country.toLowerCase())).slice(0, 40);
    body = (
      <>
        <h3>{sel.title}</h3>
        <p className="muted">{list.length} events in the last 3 days</p>
        {list.map((e) => (
          <article key={e.id} className="row">
            <b>{e.title}</b>
            <small className="muted">{e.conflict} · {e.source} · {ago(e.ts)}</small>
            {e.summary && <p>{e.summary}</p>}
          </article>
        ))}
      </>
    );
  } else if (sel.kind === 'event') {
    const e = sel.e;
    body = (
      <>
        <h3>{e.title} <Translate text={`${e.title}. ${e.summary ?? ''}`} /></h3>
        <p className="muted">{e.conflict} · {e.country} · {e.source} · {ago(e.ts)} ago</p>
        {e.summary && <p>{e.summary}</p>}
        {e.url && <a href={e.url} target="_blank" rel="noreferrer">Source ↗</a>}
      </>
    );
  } else if (sel.kind === 'plane') {
    const p = sel.p;
    const kind = p.desc || p.t;
    body = (
      <>
        <h3>{p.flight || p.hex}</h3>
        <p className="muted">{kind ?? 'Unidentified type'}{p.alt ? ` · ${p.alt.toLocaleString()} ft` : ''}</p>
        {kind && <WikiCard q={`${kind} aircraft`} />}
      </>
    );
  } else {
    const v = sel.v;
    body = (
      <>
        <h3>{v.name || `MMSI ${v.mmsi}`}</h3>
        <p className="muted">{v.navy ? 'Naval vessel' : 'Vessel'} · MMSI {v.mmsi}</p>
        {v.navy && v.name && <WikiCard q={v.name} />}
      </>
    );
  }
  return (
    <div className="sheet">
      <button className="x" onClick={close} aria-label="Close">×</button>
      {body}
    </div>
  );
}
