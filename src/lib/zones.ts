import type { Ev, FC, Feature, Zone } from '../types';

type P = [number, number]; // [lon, lat]
const KM = 111.32; // km per degree of latitude

/** Convex hull (Andrew's monotone chain). */
export function hull(points: P[]): P[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: P[] = [];
  for (const q of [...p].reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Chaikin corner cutting: turns a jagged hull into a soft, organic outline. */
export function smooth(ring: P[], rounds = 2): P[] {
  let r = ring;
  for (let k = 0; k < rounds; k++) {
    const out: P[] = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    r = out;
  }
  return r;
}

const distKm = (a: Ev, b: Ev) => {
  const dLat = (a.lat - b.lat) * KM;
  const dLon = (a.lon - b.lon) * KM * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
};

/** Single-linkage clusters: events within `km` of each other (directly or through neighbours) share a cluster. */
export function clusters(evs: Ev[], km = 250): Ev[][] {
  const parent = evs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < evs.length; i++)
    for (let j = i + 1; j < evs.length; j++) if (distKm(evs[i], evs[j]) <= km) parent[find(i)] = find(j);
  const groups = new Map<number, Ev[]>();
  evs.forEach((e, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), e]));
  return [...groups.values()];
}

/**
 * Activity zones: for each conflict, events from the last 72h are grouped into clusters, and any cluster of 3+
 * becomes a soft shaded region around its events. These show WHERE reported activity is, not who controls
 * territory. Use admin zones for real control areas.
 * shortcut: single-linkage is O(n^2) per conflict, fine for a few hundred events; use a spatial index beyond that.
 */
export function activityZones(
  events: Ev[],
  now = Date.now(),
  keyOf: (e: Ev) => { key: string; name: string; color: string } = (e) => ({ key: e.conflict, name: e.conflict, color: '#ff9f0a' }),
): FC {
  const byKey = new Map<string, { name: string; color: string; evs: Ev[] }>();
  for (const e of events) {
    if (!e.conflict || now - e.ts > 72 * 36e5) continue;
    const k = keyOf(e);
    const g = byKey.get(k.key) ?? { name: k.name, color: k.color, evs: [] };
    g.evs.push(e);
    byKey.set(k.key, g);
  }
  const features: Feature[] = [];
  for (const [key, g] of byKey)
    for (const cl of clusters(g.evs)) {
      if (cl.length < 3) continue;
      const pts: P[] = [];
      for (const e of cl)
        for (let i = 0; i < 10; i++) {
          const a = (2 * Math.PI * i) / 10;
          const r = 40 + 4 * Math.min(cl.length, 10); // km of padding around each event
          pts.push([e.lon + (r / (KM * Math.max(0.2, Math.cos((e.lat * Math.PI) / 180)))) * Math.cos(a), e.lat + (r / KM) * Math.sin(a)]);
        }
      const ring = smooth(hull(pts));
      features.push({
        type: 'Feature',
        properties: { key, name: g.name, color: g.color, count: cl.length, approx: true },
        geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
      });
    }
  return { type: 'FeatureCollection', features };
}

const first = (p: Record<string, unknown>, keys: string[]) => {
  const k = keys.find((k) => typeof p[k] === 'string' && (p[k] as string).trim());
  return k ? (p[k] as string).trim() : undefined;
};
const isColor = (c?: string) => !!c && /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([^)]*\)|[a-z]{3,20})$/i.test(c);

/**
 * Admin-drawn zones: each doc stores a GeoJSON string (Polygon, Feature or FeatureCollection).
 * A feature's own properties win over the doc's: name, description and colour (several common spellings are
 * understood, since Gemini and GeoJSON tools disagree on them). Other plain properties are kept and shown in the panel.
 */
export function adminZones(zones: Zone[]): Feature[] {
  return zones.flatMap((z) => {
    try {
      const g = JSON.parse(z.geojson);
      const fs: any[] = g.type === 'FeatureCollection' ? g.features : g.type === 'Feature' ? [g] : [{ type: 'Feature', geometry: g }];
      return fs.map((f) => {
        const p: Record<string, unknown> = f.properties ?? {};
        const color = first(p, ['color', 'colour', 'fill', 'stroke', 'marker-color']);
        const plain = Object.fromEntries(Object.entries(p).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)));
        return {
          type: 'Feature' as const,
          geometry: f.geometry,
          properties: {
            ...plain,
            name: first(p, ['name', 'title', 'label']) ?? z.name,
            description: first(p, ['description', 'desc', 'details', 'notes', 'summary']) ?? z.description ?? '',
            color: isColor(color) ? color : z.color,
            count: 12,
            admin: true,
          },
        };
      });
    } catch {
      return [];
    }
  });
}
