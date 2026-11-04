export type Wiki = { title: string; extract: string; img?: string; url: string };

const cache = new Map<string, Wiki | null>();

/** Best Wikipedia match for a free-text query (aircraft type, ship name): intro text + thumbnail in one call. */
export async function wikiLookup(q: string): Promise<Wiki | null> {
  if (cache.has(q)) return cache.get(q)!;
  const url =
    'https://en.wikipedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: q, gsrlimit: '1',
      prop: 'extracts|pageimages|info', exintro: '1', explaintext: '1', exchars: '500',
      piprop: 'thumbnail', pithumbsize: '480', inprop: 'url', format: 'json', origin: '*',
    });
  let out: Wiki | null = null;
  try {
    const j = await (await fetch(url)).json();
    const p: any = Object.values(j.query?.pages ?? {})[0];
    if (p) out = { title: p.title, extract: p.extract ?? '', img: p.thumbnail?.source, url: p.fullurl };
  } catch {
    /* offline or blocked: show "no entry" */
  }
  cache.set(q, out);
  return out;
}
