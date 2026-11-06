export const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 6e4);
  return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

/** "8m ago", or "just now". */
export const agoText = (ts: number) => (ago(ts) === 'now' ? 'just now' : `${ago(ts)} ago`);

/** The last n local-5-PM instants that have already passed, newest first. */
export function recent5pms(n: number, now = new Date()) {
  const d = new Date(now);
  d.setHours(17, 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    return x;
  });
}

export function next5pm(now = new Date()) {
  const d = new Date(now);
  d.setHours(17, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

/** Doc id written by scripts/summarize.ts. shortcut: :30/:45 time zones floor to the UTC hour, so those users see a summary up to 45 min early. */
export const hourId = (d: Date) => d.toISOString().slice(0, 13);
