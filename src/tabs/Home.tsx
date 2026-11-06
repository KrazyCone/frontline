import { useMemo } from 'react';
import { useData } from '../data';
import { ago } from '../lib/time';

export default function Home({ go }: { go: (t: string) => void }) {
  const { events, latest } = useData();
  const conflicts = useMemo(() => {
    const now = Date.now();
    const m = new Map<string, { total: number; day: number }>();
    for (const e of events) {
      const c = m.get(e.conflict) ?? { total: 0, day: 0 };
      c.total++;
      if (now - e.ts < 864e5) c.day++;
      m.set(e.conflict, c);
    }
    return [...m].sort((a, b) => b[1].day - a[1].day || b[1].total - a[1].total).slice(0, 12);
  }, [events]);

  return (
    <>
      <h2>Home</h2>
      {latest && (
        <button className="card summary-card" onClick={() => go('summary')}>
          <small className="muted">Latest daily summary</small>
          <p>{latest.overall.split('\n\n')[0]}</p>
          <small className="accent">Read full briefing →</small>
        </button>
      )}

      <h3>Active conflicts</h3>
      {conflicts.length === 0 && <p className="muted">No events yet. Once the background fetcher runs, conflicts appear here (see README).</p>}
      <div className="chips">
        {conflicts.map(([name, c]) => (
          <div key={name} className="card chip">
            <b>{name}</b>
            <span className={`badge ${c.day >= 10 ? 'high' : c.day >= 3 ? 'mid' : ''}`}>{c.day >= 10 ? 'High' : c.day >= 3 ? 'Active' : 'Low'}</span>
            <small className="muted">{c.day} today · {c.total} in 3d</small>
          </div>
        ))}
      </div>

      <h3>Top headlines</h3>
      {events.slice(0, 15).map((e) => (
        <article key={e.id} className="row">
          <a href={e.url} target="_blank" rel="noreferrer"><b>{e.title}</b></a>
          <small className="muted">{e.country} · {e.source} · {ago(e.ts)}</small>
        </article>
      ))}
    </>
  );
}
