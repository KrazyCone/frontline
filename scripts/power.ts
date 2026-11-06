// Monthly (and on demand): country electricity stats from the World Bank + big power plants from the WRI
// Global Power Plant Database -> Firestore. Both are slow-moving datasets, so this is not part of the 10-minute job.
import type { PowerStat } from '../src/types';
import { mixByCountry, readPlants } from './csv';
import { db } from './lib';

const PLANTS_URL =
  process.env.PLANTS_URL ||
  'https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv';
const MIN_MW = 100; // smaller plants would make the map unreadable and the Firestore docs huge
const CHUNK = 1200; // plants per document (~100 KB), well under the 1 MB document limit

const WB = [
  ['access', 'EG.ELC.ACCS.ZS'], // % of population with electricity
  ['kwh', 'EG.USE.ELEC.KH.PC'], // electric power consumption, kWh per person
  ['loss', 'EG.ELC.LOSS.ZS'], // transmission and distribution losses, % of output
] as const;

const get = async (u: string) => {
  const r = await fetch(u, { headers: { 'user-agent': 'Frontline/1.0 (power data)' } });
  if (!r.ok) throw new Error(`${u} -> ${r.status}`);
  return r;
};

async function main() {
  const stats: Record<string, PowerStat> = {};
  const failed: string[] = [];

  // mrnev=1 returns each country's most recent non-empty value, and its year, so old data is labelled as old.
  for (const [key, code] of WB) {
    try {
      const j: any = await (await get(`https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=500&mrnev=1`)).json();
      for (const r of j?.[1] ?? []) {
        const iso = r.countryiso3code;
        if (!iso || iso.length !== 3 || typeof r.value !== 'number') continue;
        const s = (stats[iso] ??= {});
        s[key] = Math.round(r.value * 10) / 10;
        (s.yr ??= {})[key] = Number(r.date);
      }
    } catch (e) {
      failed.push(`World Bank ${code}: ${(e as Error).message}`);
    }
  }

  let plants: ReturnType<typeof readPlants> = [];
  try {
    plants = readPlants(await (await get(PLANTS_URL)).text());
  } catch (e) {
    failed.push(`plants: ${(e as Error).message}`);
  }

  if (plants.length) {
    for (const [iso, v] of Object.entries(mixByCountry(plants))) Object.assign((stats[iso] ??= {}), v);
    const big = plants.filter((p) => p.m >= MIN_MW).sort((a, b) => b.m - a.m);
    const docs = Math.ceil(big.length / CHUNK);
    for (let i = 0; i < docs; i++) await db.doc(`power_plants/c${i}`).set({ items: big.slice(i * CHUNK, (i + 1) * CHUNK) });
    // Remove chunks left over from a previous, larger run so the app never shows stale plants.
    for (const ref of await db.collection('power_plants').listDocuments()) {
      if (Number(ref.id.slice(1)) >= docs) await ref.delete();
    }
    console.log(`plants: ${big.length} of ${plants.length} (>= ${MIN_MW} MW) in ${docs} docs`);
  }

  if (Object.keys(stats).length) await db.doc('power/countries').set({ ts: Date.now(), items: stats });
  console.log(`countries: ${Object.keys(stats).length}`);

  if (failed.length) {
    console.error('some parts failed:\n' + failed.join('\n'));
    process.exitCode = 1;
  }
}

await main();
