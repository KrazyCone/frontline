// Runs hourly. Writes one summary doc per UTC hour; each user's app reads the doc nearest THEIR local 5 PM.
import { db, gemini } from './lib';
import { keywords } from './util';

const now = Date.now();
const snap = await db.collection('events').where('ts', '>', now - 864e5).orderBy('ts', 'desc').limit(400).get();
const events = snap.docs.map((d) => d.data());

await db.doc('markets/keywords').set({ ts: now, items: keywords(events.map((e) => e.title)) });

if (events.length) {
  const top = [...events].sort((a, b) => b.severity - a.severity).slice(0, 120);
  const out = await gemini(`You write a neutral end-of-day briefing on global armed conflicts from the events below (last 24 hours).
Return JSON: {"overall": string, "conflicts": [{"name": string, "text": string}]}.
"overall": a short narrative of 2-3 paragraphs separated by \\n\\n covering the most significant developments.
"conflicts": up to 8 of the most active conflicts, each "text" 2-4 sentences.
State only what the events support. No speculation, no opinions.
Events:
${top.map((e) => `- [${e.conflict} | ${e.country} | ${new Date(e.ts).toISOString().slice(0, 16)}] ${e.title}${e.summary ? ': ' + e.summary : ''}`).join('\n')}`);
  if (typeof out?.overall !== 'string' || !Array.isArray(out.conflicts)) throw new Error('Unexpected Gemini summary shape');
  await db.doc(`summaries/${new Date(now).toISOString().slice(0, 13)}`).set({ ts: now, overall: out.overall, conflicts: out.conflicts });
  console.log(`summary written from ${events.length} events`);
}

// Retention: keep 14 days of events so the free Firestore quota is never a problem.
const old = await db.collection('events').where('ts', '<', now - 14 * 864e5).limit(400).get();
if (!old.empty) {
  const b = db.batch();
  old.docs.forEach((d) => b.delete(d.ref));
  await b.commit();
}
