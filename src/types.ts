export type Ev = {
  id: string;
  title: string;
  summary?: string;
  lat: number;
  lon: number;
  country: string;
  /** Empty for pure power/outage reports that aren't conflict-related. */
  conflict: string;
  type: string;
  severity: 1 | 2 | 3;
  source: string;
  url?: string;
  ts: number;
  /** True when the report is about a blackout or damage to electricity infrastructure. */
  power?: boolean;
};
export type Plane = { hex: string; flight?: string; t?: string; desc?: string; lat: number; lon: number; alt?: number; trk?: number };
export type Vessel = { mmsi: number; name: string; lat: number; lon: number; navy: boolean; hdg?: number; kind?: string };
export type Quote = { sym: string; label: string; group: string; price: number; pct: number };
export type Word = { word: string; count: number };
export type Summary = { ts: number; overall: string; conflicts: { name: string; text: string }[] };
export type Zone = { id: string; name: string; color: string; geojson: string; description?: string };
/**
 * Electricity facts for one country. access/kwh/loss come from the World Bank (yr = the year each value is from);
 * mw/mix are installed megawatts (total and per fuel group) summed from the plant database.
 */
export type PowerStat = { access?: number; kwh?: number; loss?: number; yr?: Record<string, number>; mw?: number; mix?: Record<string, number> };
/** One power plant: name, lon, lat, megawatts, fuel group, ISO3 country. */
export type Plant = { n: string; x: number; y: number; m: number; f: string; c: string };
// Minimal GeoJSON shape so we don't depend on @types/geojson.
export type Feature = { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown };
export type FC = { type: 'FeatureCollection'; features: Feature[] };
