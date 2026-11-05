// Runs every ~10 min from GitHub Actions. Each source is independent: one failing doesn't stop the others.
import { createHash } from 'node:crypto';
import { db, gemini } from './lib';
import { CONFLICT_RE, gdeltTs, parseRss } from './util';

type Item = { title: string; url: string; summary?: string; ts: number };

const FEEDS = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  'https://www.theguardian.com/world/rss',
];
const GDELT =
  'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
  encodeURIComponent('(war OR airstrike OR missile OR ceasefire OR shelling) sourcelang:english') +
  '&mode=artlist&maxrecords=60&format=json&timespan=2h';

const get = async (u: string) => {
  const r = await fetch(u, { headers: { 'user-agent': 'Frontline/1.0 (news aggregator)' } });
  if (!r.ok) throw new Error(`${u} -> ${r.status}`);
  return r;
};

const PROMPT = `You triage news headlines for a global armed-conflict tracker. For each numbered headline decide whether it reports a specific armed-conflict event (attack, strike, clash, shelling, military movement, ceasefire news).
Return a JSON array with one object per headline: {"i":number,"relevant":boolean,"lat":number,"lon":number,"country":string,"conflict":string,"type":"airstrike"|"battle"|"explosion"|"shelling"|"naval"|"ceasefire"|"other","severity":1|2|3,"summary":string}.
lat/lon = best estimate of where it happened (use the named city, else the capital). country = common English name. conflict = short stable name such as "Russia-Ukraine war", "Gaza war", "Sudan civil war". summary = neutral, max 25 words. severity: 3 mass casualties or major escalation, 2 notable, 1 minor. If not relevant, set relevant false and use 0 / "" for the rest.
Headlines:
`;

const valid = (o: any) =>
  Number.isFinite(o.lat) && Number.isFinite(o.lon) && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180 &&
  !(o.lat === 0 && o.lon === 0) && !!o.country && !!o.conflict;

async function news() {
  const results = await Promise.allSettled([
    ...FEEDS.map(async (u) => parseRss(await (await get(u)).text())),
    (async (): Promise<Item[]> => {
      const j: any = await (await get(GDELT)).json();
      return (j.articles ?? []).map((a: any) => ({ title: a.title, url: a.url, ts: gdeltTs(a.seendate) }));
    })(),
  ]);
  const items = results.flatMap((r) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn('source failed:', r.reason?.message);
    return [];
  });

  // One small doc remembers recent ids so we don't re-bill Gemini or re-read Firestore for old headlines.
  const seenRef = db.doc('meta/seen');
  const seen = new Set<string>((await seenRef.get()).data()?.ids ?? []);
  const fresh = new Map<string, Item>();
  for (const it of items) {
    if (!CONFLICT_RE.test(it.title)) continue;
    const id = createHash('sha1').update(it.url).digest('hex').slice(0, 20);
    if (!seen.has(id)) fresh.set(id, it);
  }
  const todo = [...fresh].slice(0, 90);
  const done: string[] = [];
  try {
    for (let i = 0; i < todo.length; i += 30) {
      const batch = todo.slice(i, i + 30);
      const out = await gemini(PROMPT + batch.map(([, it], n) => `${n}. ${it.title} - ${(it.summary ?? '').slice(0, 200)}`).join('\n'));
      if (!Array.isArray(out)) throw new Error('Gemini did not return an array');
      const w = db.batch();
      for (const o of out) {
        const [id, it] = batch[o.i] ?? [];
        if (!it || !o.relevant || !valid(o)) continue;
        w.set(db.collection('events').doc(id), {
          title: it.title,
          summary: String(o.summary ?? ''),
          lat: o.lat,
          lon: o.lon,
          country: String(o.country),
          conflict: String(o.conflict),
          type: String(o.type ?? 'other'),
          severity: [1, 2, 3].includes(o.severity) ? o.severity : 1,
          source: new URL(it.url).hostname.replace(/^www\./, ''),
          url: it.url,
          ts: it.ts,
        });
      }
      await w.commit();
      done.push(...batch.map(([id]) => id));
    }
  } finally {
    if (done.length) await seenRef.set({ ids: [...seen, ...done].slice(-2000) });
  }
  console.log(`news: ${done.length} headlines triaged`);
}

async function acled() {
  const { ACLED_EMAIL, ACLED_PASSWORD } = process.env;
  if (!ACLED_EMAIL || !ACLED_PASSWORD) return;
  const now = new Date();
  // shortcut: ACLED only updates weekly, so pull in the first 30 min of every 6th hour. Keeps Firestore inside the free quota. FORCE=1 overrides.
  if (!process.env.FORCE && (now.getUTCHours() % 6 || now.getUTCMinutes() >= 30)) return;

  const tok: any = await (
    await fetch('https://acleddata.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: ACLED_EMAIL, password: ACLED_PASSWORD, grant_type: 'password', client_id: 'acled' }),
    })
  ).json();
  if (!tok.access_token) throw new Error('ACLED auth failed (account may still need API access approval)');

  const day = (d: number) => new Date(now.getTime() - d * 864e5).toISOString().slice(0, 10);
  const r = await fetch(
    `https://acleddata.com/api/acled/read?_format=json&event_date=${day(3)}|${day(0)}&event_date_where=BETWEEN&limit=500`,
    { headers: { authorization: `Bearer ${tok.access_token}` } },
  );
  if (!r.ok) throw new Error(`ACLED read -> ${r.status}`);
  const rows: any[] = ((await r.json()) as any).data ?? [];
  const refs = rows.map((x) => db.collection('events').doc(`acled_${x.event_id_cnty}`));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const w = db.batch();
  let n = 0;
  rows.forEach((x, i) => {
    const lat = Number(x.latitude), lon = Number(x.longitude), f = Number(x.fatalities) || 0;
    if (snaps[i].exists || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    n++;
    w.set(refs[i], {
      title: `${x.sub_event_type || x.event_type} - ${x.location}, ${x.country}`,
      summary: String(x.notes ?? '').slice(0, 300),
      lat, lon,
      country: x.country,
      conflict: x.country, // shortcut: ACLED has no conflict name, so it groups by country and may sit beside a Gemini-named conflict
      type: String(x.event_type ?? 'other').toLowerCase(),
      severity: f >= 10 ? 3 : f > 0 ? 2 : 1,
      source: 'ACLED',
      url: 'https://acleddata.com/',
      ts: Date.parse(x.event_date) || Date.now(),
    });
  });
  if (n) await w.commit();
  console.log(`acled: ${n} new events`);
}

const BOXES = [
  [[10, 32], [30, 50]], // Red Sea / Gulf of Aden
  [[22, 48], [30, 60]], // Persian Gulf / Hormuz
  [[40, 27], [47, 42]], // Black Sea
  [[31, 29], [37, 37]], // Eastern Mediterranean
  [[21, 117], [27, 123]], // Taiwan Strait
];
const NAVY_RE = /^(USS|USNS|HMS|HMAS|HMCS|FS|INS|RFS|JS|ROKS|TCG|HDMS|PLAN)\s/;

async function vessels() {
  const key = process.env.AISSTREAM_KEY;
  if (!key) return;
  const ships = new Map<number, any>();
  await new Promise<void>((resolve) => {
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    const done = () => { try { ws.close(); } catch {} resolve(); };
    setTimeout(done, 45_000);
    ws.onopen = () => ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: BOXES, FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }));
    ws.onerror = done;
    ws.onclose = done;
    ws.onmessage = async (m) => {
      try {
        const txt = typeof m.data === 'string' ? m.data : Buffer.from(await (m.data as Blob).arrayBuffer()).toString();
        const j = JSON.parse(txt);
        const md = j.MetaData;
        if (!md?.MMSI) return;
        const v = ships.get(md.MMSI) ?? { mmsi: md.MMSI };
        Object.assign(v, { name: String(md.ShipName ?? '').trim(), lat: md.latitude, lon: md.longitude });
        // shortcut: type 35 (military) is only seen if a static message lands inside this 45s window; name prefixes cover the rest. Cache MMSI->type in Firestore if naval coverage looks thin.
        if (j.MessageType === 'ShipStaticData') v.type = j.Message?.ShipStaticData?.Type;
        ships.set(md.MMSI, v);
      } catch {}
    };
  });
  const items = [...ships.values()]
    .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lon))
    .map((v) => ({ mmsi: v.mmsi, name: v.name, lat: v.lat, lon: v.lon, navy: v.type === 35 || NAVY_RE.test(v.name) }))
    .sort((a, b) => Number(b.navy) - Number(a.navy))
    .slice(0, 400);
  if (items.length) await db.doc('vessels/latest').set({ ts: Date.now(), items });
  console.log(`vessels: ${items.length} (${items.filter((v) => v.navy).length} naval)`);
}

async function planes() {
  // Fetched here, not in the browser: adsb.lol sends no CORS header, so web pages can't read it.
  const j: any = await (await get('https://api.adsb.lol/v2/mil')).json();
  const ac = (j.ac ?? []).filter((a: any) => typeof a.lat === 'number' && typeof a.lon === 'number').slice(0, 800);

  // The feed gives ICAO type codes ("C17"); Gemini names each new code once and Firestore remembers it.
  const typesRef = db.doc('meta/types');
  const names: Record<string, string> = (await typesRef.get()).data() ?? {};
  const fresh = [...new Set<string>(ac.map((a: any) => a.t).filter((t: any) => t && !(t in names)))].slice(0, 60);
  if (fresh.length) {
    try {
      const out = await gemini(
        `Map each ICAO aircraft type designator to the aircraft's common full name, e.g. "C17" -> "Boeing C-17 Globemaster III". Return a JSON object {code: name}. Use "" if you are not sure.\nCodes: ${fresh.join(', ')}`,
      );
      for (const c of fresh) names[c] = typeof out?.[c] === 'string' ? out[c] : '';
      await typesRef.set(names);
    } catch (e) {
      console.warn('type names failed:', (e as Error).message);
    }
  }
  const items = ac.map((a: any) => ({
    hex: a.hex, flight: a.flight?.trim() ?? '', t: a.t ?? '', desc: a.desc || names[a.t] || '',
    lat: a.lat, lon: a.lon, alt: typeof a.alt_baro === 'number' ? a.alt_baro : 0,
  }));
  if (items.length) await db.doc('planes/latest').set({ ts: Date.now(), items });
  console.log(`planes: ${items.length}`);
}

const SYMBOLS: [string, string, string][] = [
  ['LMT', 'Lockheed Martin', 'Defense'], ['RTX', 'RTX', 'Defense'], ['NOC', 'Northrop Grumman', 'Defense'],
  ['GD', 'General Dynamics', 'Defense'], ['BA', 'Boeing', 'Defense'],
  ['CL=F', 'WTI Crude', 'Commodities'], ['BZ=F', 'Brent Crude', 'Commodities'], ['NG=F', 'Natural Gas', 'Commodities'], ['GC=F', 'Gold', 'Commodities'],
  ['EURUSD=X', 'EUR/USD', 'Forex'], ['USDJPY=X', 'USD/JPY', 'Forex'], ['USDRUB=X', 'USD/RUB', 'Forex'], ['USDCNY=X', 'USD/CNY', 'Forex'],
];

async function markets() {
  // Unofficial Yahoo chart endpoint: no key, delayed prices. It can change without notice.
  const res = await Promise.allSettled(
    SYMBOLS.map(async ([sym, label, group]) => {
      const j: any = await (await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`)).json();
      const m = j.chart.result[0].meta;
      return { sym, label, group, price: m.regularMarketPrice, pct: (m.regularMarketPrice / m.chartPreviousClose - 1) * 100 };
    }),
  );
  const items = res.flatMap((r) => (r.status === 'fulfilled' && Number.isFinite(r.value.price) && Number.isFinite(r.value.pct) ? [r.value] : []));
  if (items.length) await db.doc('markets/latest').set({ ts: Date.now(), items });
  console.log(`markets: ${items.length}/${SYMBOLS.length} quotes`);
}

for (const [name, fn] of Object.entries({ news, acled, vessels, planes, markets })) {
  try { await fn(); } catch (e) { console.error(`${name} failed:`, e); process.exitCode = 1; }
}
