import type { Ev } from '../types';
import { sameCountry } from './countries';

/**
 * Reference list of ongoing conflicts so every one of them is always on the map, even on a quiet day.
 * It holds only stable facts (where, which countries, what to look up). Status comes from live event counts
 * and the description is fetched live from Wikipedia, so nothing here goes stale.
 * ORDER MATTERS: the first entry whose pattern matches wins, so narrower conflicts come before broader ones.
 */
export type Conflict = {
  id: string;
  name: string;
  region: string;
  lon: number;
  lat: number;
  zoom: number;
  countries: string[];
  iso: string[];
  match: RegExp;
  wiki: string;
};

const c = (id: string, name: string, region: string, lon: number, lat: number, zoom: number, countries: string[], iso: string[], match: RegExp, wiki: string): Conflict =>
  ({ id, name, region, lon, lat, zoom, countries, iso, match, wiki });

export const CONFLICTS: Conflict[] = [
  c('ukraine', 'Russia–Ukraine war', 'Europe', 34, 48.6, 4.6, ['Ukraine', 'Russia'], ['UKR', 'RUS'], /\b(ukrain\w*|kyiv|kharkiv|donetsk|zaporizhzhia|crimea|kursk)\b|russia.?ukraine/i, 'Russo-Ukrainian War'),
  c('yemen', 'Yemen conflict', 'Middle East', 47.5, 15.8, 5.2, ['Yemen'], ['YEM'], /\b(yemen\w*|houthis?)\b/i, 'Yemeni civil war (2014–present)'),
  c('lebanon', 'Israel–Lebanon conflict', 'Middle East', 35.7, 33.6, 7, ['Lebanon'], ['LBN'], /\b(lebanon|lebanese|hezbollah)\b/i, 'Israel–Hezbollah conflict (2023–present)'),
  c('syria', 'Syria', 'Middle East', 38.5, 35, 5.6, ['Syria'], ['SYR'], /\bsyria\w*/i, 'Syrian civil war'),
  c('iraq', 'Iraq', 'Middle East', 43.7, 33.2, 5.4, ['Iraq'], ['IRQ'], /\biraq\w*/i, 'Iraqi insurgency Islamic State remnants'),
  c('iran', 'Iran–Israel conflict', 'Middle East', 52, 33, 4.6, ['Iran'], ['IRN'], /\biran\w*/i, 'Iran–Israel proxy war'),
  c('israel-palestine', 'Israeli–Palestinian conflict', 'Middle East', 34.8, 31.6, 6.2, ['Israel', 'Palestine'], ['ISR', 'PSE'], /\b(gaza|palestin\w*|west bank|hamas|israel\w*)\b/i, 'Israeli–Palestinian conflict'),
  c('south-sudan', 'South Sudan conflict', 'Africa', 30.5, 7.3, 5, ['South Sudan'], ['SSD'], /south sudan/i, 'South Sudanese Civil War'),
  c('sudan', 'Sudan civil war', 'Africa', 30, 15.5, 4.6, ['Sudan'], ['SDN'], /(?<!south )\bsudan\w*|\brsf\b|rapid support forces/i, 'Sudanese civil war (2023–present)'),
  c('ethiopia', 'Ethiopia conflicts', 'Africa', 39.5, 9, 4.8, ['Ethiopia', 'Eritrea'], ['ETH', 'ERI'], /\b(ethiopia\w*|tigray|amhara|oromia|eritrea\w*)\b/i, 'Ethiopian civil conflict'),
  c('somalia', 'Somalia conflict', 'Africa', 46, 3, 5, ['Somalia'], ['SOM'], /\b(somalia\w*|al-?shabaab)\b/i, 'Somali Civil War'),
  c('drc', 'DR Congo conflict', 'Africa', 28.5, -1.5, 5, ['Democratic Republic of the Congo'], ['COD'], /\b(congo\w*|m23|kivu|goma|drc)\b/i, 'Kivu conflict'),
  c('sahel', 'Sahel insurgencies', 'Africa', 0, 14, 4.4, ['Mali', 'Burkina Faso', 'Niger'], ['MLI', 'BFA', 'NER'], /\b(mali|burkina faso|niger|sahel|jnim)\b/i, 'Sahel conflict Mali Burkina Faso Niger jihadist insurgency'),
  c('nigeria', 'Nigeria insecurity', 'Africa', 8, 10, 4.8, ['Nigeria'], ['NGA'], /\b(nigeria\w*|boko haram|iswap|bandits?)\b/i, 'Boko Haram insurgency Nigeria'),
  c('cameroon', 'Cameroon conflicts', 'Africa', 11.5, 5.8, 5.6, ['Cameroon'], ['CMR'], /\b(cameroon\w*|ambazonia)\b/i, 'Anglophone Crisis Cameroon'),
  c('car', 'Central African Republic conflict', 'Africa', 20.5, 6.5, 5, ['Central African Republic'], ['CAF'], /central african|\bcar\b/i, 'Central African Republic Civil War'),
  c('mozambique', 'Cabo Delgado insurgency', 'Africa', 40, -12.5, 6, ['Mozambique'], ['MOZ'], /\b(mozambique|cabo delgado)\b/i, 'Insurgency in Cabo Delgado'),
  c('libya', 'Libya', 'Africa', 17, 28, 4.6, ['Libya'], ['LBY'], /\blibya\w*/i, 'Libyan crisis (2011–present)'),
  c('myanmar', 'Myanmar civil war', 'Asia', 96.5, 20.5, 4.8, ['Myanmar'], ['MMR'], /\b(myanmar|burma|burmese)\b/i, 'Myanmar civil war (2021–present)'),
  c('afghanistan', 'Afghanistan', 'Asia', 66, 34, 5, ['Afghanistan'], ['AFG'], /\b(afghan\w*|taliban)\b/i, 'Afghanistan Taliban conflict ISIS-K'),
  c('kashmir', 'India–Pakistan / Kashmir', 'Asia', 75, 34, 5.4, [], ['IND', 'PAK'], /kashmir|\bindia\b.*\bpakistan\b|\bpakistan\b.*\bindia\b/i, 'Kashmir conflict'),
  c('pakistan', 'Pakistan insurgencies', 'Asia', 68, 30.5, 5, ['Pakistan'], ['PAK'], /\b(pakistan\w*|balochistan|khyber|ttp)\b/i, 'Insurgency in Khyber Pakhtunkhwa'),
  c('mexico', 'Mexican drug war', 'Americas', -102, 23.5, 4.2, ['Mexico'], ['MEX'], /\b(mexic\w*|cartels?)\b/i, 'Mexican drug war'),
  c('colombia', 'Colombian conflict', 'Americas', -73, 4.5, 4.8, ['Colombia'], ['COL'], /\bcolombia\w*/i, 'Colombian conflict'),
  c('venezuela', 'Venezuela', 'Americas', -66, 7, 4.8, ['Venezuela'], ['VEN'], /\bvenezuela\w*/i, 'Venezuelan crisis'),
  c('ecuador', 'Ecuador gang conflict', 'Americas', -78.5, -1.5, 5.4, ['Ecuador'], ['ECU'], /\becuador\w*/i, 'Ecuador internal armed conflict gangs'),
  c('haiti', 'Haiti gang conflict', 'Americas', -72.3, 19, 6.2, ['Haiti'], ['HTI'], /\bhaiti\w*/i, 'Haitian crisis (2018–present)'),
];

/**
 * Which listed conflict an event belongs to. Tries, in order: the conflict name the AI gave it, the country it
 * happened in, then the headline. Returns undefined for conflicts not on the list (they still show on the map).
 */
export function conflictFor(e: Pick<Ev, 'country' | 'title'> & { conflict?: string }): Conflict | undefined {
  return (
    (e.conflict ? CONFLICTS.find((x) => x.match.test(e.conflict!)) : undefined) ??
    CONFLICTS.find((x) => x.countries.some((n) => sameCountry(n, e.country))) ??
    CONFLICTS.find((x) => x.match.test(e.title))
  );
}

export type Level = 'high' | 'active' | 'low';
export const levelOf = (day: number): Level => (day >= 10 ? 'high' : day >= 3 ? 'active' : 'low');

export type Stat = { day: number; total: number; major: number; power: number; last: number };

/** Event counts per listed conflict (`byId`) plus conflict names the list doesn't cover (`other`). */
export function conflictStats(events: Ev[], now = Date.now()) {
  const byId = new Map<string, Stat>(CONFLICTS.map((x) => [x.id, { day: 0, total: 0, major: 0, power: 0, last: 0 }]));
  const other = new Map<string, Stat>();
  for (const e of events) {
    if (!e.conflict) continue; // pure power/outage reports aren't conflict events
    const hit = conflictFor(e);
    const s = hit ? byId.get(hit.id)! : other.get(e.conflict) ?? other.set(e.conflict, { day: 0, total: 0, major: 0, power: 0, last: 0 }).get(e.conflict)!;
    s.total++;
    if (now - e.ts < 864e5) s.day++;
    if (e.severity === 3) s.major++;
    if (e.power) s.power++;
    s.last = Math.max(s.last, e.ts);
  }
  return { byId, other };
}

/** Stable colour per conflict so its zone, label and list entry match. */
const PALETTE = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#bf5af2', '#ff375f', '#5e5ce6', '#ac8e68', '#40c8e0'];
export const colorFor = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
