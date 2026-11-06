import type { Plant } from '../src/types';

/** Minimal CSV parser (handles quoted fields, escaped quotes and newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/** Collapse the dataset's many fuel names into the groups the map has icons for. */
export function fuelKey(f: string): string {
  const s = f.toLowerCase();
  if (/coal|petcoke/.test(s)) return 'coal';
  if (/^gas|cogeneration/.test(s)) return 'gas';
  if (/oil/.test(s)) return 'oil';
  if (/hydro|wave|tidal|storage/.test(s)) return 'hydro';
  if (/nuclear/.test(s)) return 'nuclear';
  if (/solar/.test(s)) return 'solar';
  if (/wind/.test(s)) return 'wind';
  if (/biomass|waste/.test(s)) return 'bio';
  if (/geothermal/.test(s)) return 'geo';
  return 'other';
}

/** Read the WRI Global Power Plant Database CSV by column NAME, so a reordered file still works. */
export function readPlants(text: string): Plant[] {
  const [head, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const col = (k: string) => {
    const i = (head ?? []).indexOf(k);
    if (i < 0) throw new Error(`plants CSV has no "${k}" column (got: ${(head ?? []).slice(0, 8).join(', ')})`);
    return i;
  };
  const [ci, ni, mi, yi, xi, fi] = ['country', 'name', 'capacity_mw', 'latitude', 'longitude', 'primary_fuel'].map(col);
  return rows.flatMap((r) => {
    const m = parseFloat(r[mi]), y = parseFloat(r[yi]), x = parseFloat(r[xi]);
    if (!r[ci] || !Number.isFinite(m) || !Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{ n: (r[ni] ?? '').slice(0, 40), x: +x.toFixed(3), y: +y.toFixed(3), m: Math.round(m), f: fuelKey(r[fi] ?? ''), c: r[ci] }];
  });
}

/** Installed megawatts per fuel group, per ISO3 country. */
export function mixByCountry(plants: Plant[]) {
  const out: Record<string, { mw: number; mix: Record<string, number> }> = {};
  for (const p of plants) {
    const c = (out[p.c] ??= { mw: 0, mix: {} });
    c.mw += p.m;
    c.mix[p.f] = (c.mix[p.f] ?? 0) + p.m;
  }
  return out;
}
