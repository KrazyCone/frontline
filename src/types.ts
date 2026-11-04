export type Ev = {
  id: string;
  title: string;
  summary?: string;
  lat: number;
  lon: number;
  country: string;
  conflict: string;
  type: string;
  severity: 1 | 2 | 3;
  source: string;
  url?: string;
  ts: number;
};
export type Plane = { hex: string; flight?: string; t?: string; desc?: string; lat: number; lon: number; alt?: number };
export type Vessel = { mmsi: number; name: string; lat: number; lon: number; navy: boolean };
export type Quote = { sym: string; label: string; group: string; price: number; pct: number };
export type Word = { word: string; count: number };
export type Summary = { ts: number; overall: string; conflicts: { name: string; text: string }[] };
export type Zone = { id: string; name: string; color: string; geojson: string };
// Minimal GeoJSON shape so we don't depend on @types/geojson.
export type Feature = { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown };
export type FC = { type: 'FeatureCollection'; features: Feature[] };
