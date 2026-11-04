import type { Ev, FC, Feature, Zone } from '../types';

const ring = (lat: number, lon: number, km: number, n = 28) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    const dLon = (km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))) * Math.cos(a);
    return [lon + dLon, lat + (km / 111) * Math.sin(a)];
  });

/**
 * Approximate "activity zones": any 2-degree grid cell with 3+ events in the last 48h becomes a circle
 * sized by event count. These are NOT real control lines - use the admin zones for those.
 * shortcut: fixed grid (a cluster straddling a cell edge splits in two); swap for DBSCAN if that looks wrong.
 */
export function activityZones(events: Ev[], now = Date.now()): FC {
  const cells = new Map<string, Ev[]>();
  for (const e of events) {
    if (now - e.ts > 48 * 36e5) continue;
    const k = `${Math.floor(e.lat / 2)},${Math.floor(e.lon / 2)}`;
    cells.set(k, [...(cells.get(k) ?? []), e]);
  }
  const features: Feature[] = [];
  for (const evs of cells.values()) {
    if (evs.length < 3) continue;
    const lat = evs.reduce((s, e) => s + e.lat, 0) / evs.length;
    const lon = evs.reduce((s, e) => s + e.lon, 0) / evs.length;
    features.push({
      type: 'Feature',
      properties: { name: evs[0].conflict, color: evs.length >= 8 ? '#ff3b30' : '#ff9f0a', approx: true },
      geometry: { type: 'Polygon', coordinates: [ring(lat, lon, 50 + 20 * Math.min(evs.length, 12))] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Admin-drawn zones: each doc stores a GeoJSON string (Polygon, Feature or FeatureCollection). */
export function adminZones(zones: Zone[]): Feature[] {
  return zones.flatMap((z) => {
    try {
      const g = JSON.parse(z.geojson);
      const fs: any[] = g.type === 'FeatureCollection' ? g.features : g.type === 'Feature' ? [g] : [{ type: 'Feature', geometry: g }];
      return fs.map((f) => ({ type: 'Feature' as const, geometry: f.geometry, properties: { name: z.name, color: z.color } }));
    } catch {
      return [];
    }
  });
}
