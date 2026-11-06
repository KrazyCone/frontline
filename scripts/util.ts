// Pure helpers shared by the fetcher scripts (no network, no Firebase) so they can be unit-tested.

export const CONFLICT_RE =
  /\b(war|attack\w*|strike[sd]?|airstrike\w*|missile\w*|troops?|militar\w+|killed|ceasefire|truce|drone\w*|shell(?:ing|ed)|clash\w*|offensive|bomb\w*|rebels?|militia\w*|invasion|invade\w*|hostages?|army|soldiers?|insurgen\w+|casualt\w+|navy|warship\w*|frontline|blast|raid\w*)\b/i;

/** Headlines about blackouts or damage to electricity infrastructure, anywhere in the world. */
export const POWER_RE =
  /\b(blackouts?|power (?:cuts?|outages?|grid|plants?|stations?|lines?|infrastructure|shortages?)|power(?:ed)? (?:down|out)|(?:electric(?:ity)?|energy) (?:grid|infrastructure|supply|outages?|cuts?|shortages?)|substations?|load.?shedding|(?:without|lose|lost|loses) (?:power|electricity)|nuclear (?:plant|power)|thermal power)\b/i;

const clean = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();

// shortcut: regex RSS parser, fine for these well-formed feeds; swap for an XML parser if a feed breaks it.
export function parseRss(xml: string) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)]
    .map((m) => {
      const get = (tag: string) => clean(m[0].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '');
      return { title: get('title'), url: get('link'), summary: get('description'), ts: Date.parse(get('pubDate')) || Date.now() };
    })
    .filter((i) => i.title && i.url);
}

const STOP = new Set(
  'the and for with from after over into new says say said not but has have had will would could more than amid near about against its his her their they who what when how why also one two three first last that this are was were been out'.split(
    ' ',
  ),
);

export function keywords(titles: string[], n = 15) {
  const count = new Map<string, number>();
  for (const t of titles)
    for (const w of new Set(t.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []))
      if (!STOP.has(w)) count.set(w, (count.get(w) ?? 0) + 1);
  return [...count]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

export const gdeltTs = (s?: string) =>
  Date.parse((s ?? '').replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, '$1-$2-$3T$4:$5:$6Z')) || Date.now();

/** Posts from a Bluesky getAuthorFeed response, as news items. Skips reposts and posts with no real text (image-only). */
export function parseBsky(j: any) {
  return (j?.feed ?? []).flatMap((f: any) => {
    const p = f?.post;
    const text = String(p?.record?.text ?? '').replace(/\s+/g, ' ').trim();
    const rkey = String(p?.uri ?? '').split('/').pop();
    const langs = p?.record?.langs; // Bluesky tags each post with its language(s); untagged posts fall through to isEnglish
    if (f.reason || text.length < 20 || !p?.author?.handle || !rkey || (Array.isArray(langs) && langs.length && !langs.includes('en'))) return [];
    return [{
      title: text.slice(0, 280),
      url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
      ts: Date.parse(p.record.createdAt) || Date.now(),
      source: `@${p.author.handle} on Bluesky`,
    }];
  });
}

const NAVY_RE = /^(USS|USNS|HMS|HMAS|HMCS|FS|INS|RFS|JS|ROKS|TCG|HDMS|PLAN)\s/;
/** Vessel group from the AIS ship-type number (35 = military, 70s = cargo, 80s = tanker...) or a warship name prefix. */
export function vesselKind(type: number | undefined, name = ''): string {
  if (type === 35 || NAVY_RE.test(name)) return 'navy';
  if (type === undefined) return 'other';
  if (type >= 70 && type < 80) return 'cargo';
  if (type >= 80 && type < 90) return 'tanker';
  if (type >= 60 && type < 70) return 'passenger';
  if (type === 30) return 'fishing';
  if (type === 31 || type === 32 || type === 52 || type === 33) return 'tug';
  if (type === 36 || type === 37) return 'sail';
  return 'other';
}

const words = (list: string) => new Set(list.split(' '));
const EN = words('the and of to for with after from that has are was will its says said at by be over in on as kills killed hits strike strikes attack attacks war ceasefire military army forces troops');
// Common words of the languages the news feeds actually carry; "in", "an" and "on" are left out because several share them with English.
const FOREIGN = words(
  'el la los las del con por una que se en muertos ataque ' + // Spanish
  'le les des du sur une est dans pour avec plusieurs ' + // French
  'der die das und mit von nicht auf für ist ' + // German
  'il di che per della non com para ' + // Italian / Portuguese
  've bir için ile', // Turkish
);
/**
 * Cheap English check for a headline, so other-language reports never reach the map.
 * Rejects non-Latin scripts outright, and Latin-script text with more foreign than English common words.
 * shortcut: a heuristic, not a language detector; a rare foreign headline can slip through, and Gemini is also told to skip them.
 */
export function isEnglish(s: string): boolean {
  const letters = s.match(/\p{L}/gu) ?? [];
  if (!letters.length) return false;
  if (letters.filter((c) => /\p{Script=Latin}/u.test(c)).length / letters.length < 0.85) return false;
  let en = 0, other = 0;
  for (const w of s.toLowerCase().split(/[^\p{L}]+/u)) {
    if (EN.has(w)) en++;
    else if (FOREIGN.has(w)) other++;
  }
  return other <= en;
}
