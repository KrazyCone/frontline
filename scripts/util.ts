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
