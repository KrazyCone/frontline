import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { Plant, PowerStat } from '../types';

/** Colour and label per fuel group; the plant dots, legend and country panel all share these. */
export const FUEL: Record<string, [string, string]> = {
  coal: ['Coal', '#9aa0a6'], gas: ['Gas', '#ff9f0a'], oil: ['Oil', '#c1713b'], hydro: ['Hydro', '#4cc9f0'], nuclear: ['Nuclear', '#ffd60a'],
  solar: ['Solar', '#ffe066'], wind: ['Wind', '#80ed99'], bio: ['Biomass / waste', '#52b788'], geo: ['Geothermal', '#ff6b6b'], other: ['Other', '#adb5bd'],
};

/** Electricity access band -> colour for the country shading (red = many people without power). */
export const accessColor = (pct: number) => (pct < 50 ? '#ff453a' : pct < 80 ? '#ff9f0a' : pct < 95 ? '#ffd60a' : '#32d74b');

export type Power = { stats: Record<string, PowerStat>; plants: Plant[] };
let cache: Promise<Power> | undefined;

/** Loaded once, on first use: it is ~7 small documents that only change monthly. */
export function loadPower(): Promise<Power> {
  cache ??= Promise.all([getDoc(doc(db, 'power', 'countries')), getDocs(collection(db, 'power_plants'))])
    .then(([s, p]) => ({ stats: (s.data()?.items ?? {}) as Record<string, PowerStat>, plants: p.docs.flatMap((d) => (d.data().items ?? []) as Plant[]) }))
    .catch((e) => { cache = undefined; throw e; });
  return cache;
}
