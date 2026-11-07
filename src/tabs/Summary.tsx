import { collection, documentId, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { hourId, next5pm, recent5pms } from '../lib/time';
import type { Summary } from '../types';

// shortcut: slots are computed at mount; an app left open across 5 PM needs a refresh to show the new one.
export default function SummaryTab() {
  const slots = useMemo(() => recent5pms(7), []);
  const [i, setI] = useState(0);
  const [docs, setDocs] = useState<Record<string, Summary | null>>({});
  const id = hourId(slots[i]);

  useEffect(() => {
    if (id in docs) return;
    // GitHub's scheduler can run late or skip an hour, so take the newest summary at or before this slot,
    // as long as it was written within 12 hours of 5 PM.
    getDocs(query(collection(db, 'summaries'), where(documentId(), '<=', id), orderBy(documentId(), 'desc'), limit(1)))
      .then((r) => {
        const s = r.docs[0]?.data() as Summary | undefined;
        setDocs((d) => ({ ...d, [id]: s && Math.abs(slots[i].getTime() - s.ts) < 12 * 36e5 ? s : null }));
      })
      .catch(() => setDocs((d) => ({ ...d, [id]: null })));
  }, [id, docs]);

  const s = docs[id];
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <>
      <h2>Daily summary</h2>
      <p className="muted">Ready each day at 5 PM your local time. Next: {next5pm().toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</p>
      <div className="chips tabs">
        {slots.map((d, n) => (
          <button key={n} className={n === i ? 'on' : ''} onClick={() => setI(n)}>{fmt(d)}</button>
        ))}
      </div>
      {s === undefined && <p className="muted">Loading…</p>}
      {s === null && <p className="muted">No summary for this day yet. If 5 PM just passed, check back in a few minutes.</p>}
      {s && (
        <>
          <p className="muted">Written at {new Date(s.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
          <h3>Overview</h3>
          {s.overall.split('\n\n').map((p, n) => <p key={n}>{p}</p>)}
          <h3>By conflict</h3>
          {s.conflicts.map((c) => (
            <div key={c.name} className="card">
              <b>{c.name}</b>
              <p>{c.text}</p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
