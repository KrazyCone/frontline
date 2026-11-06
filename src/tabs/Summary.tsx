import { doc, getDoc } from 'firebase/firestore';
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
    getDoc(doc(db, 'summaries', id)).then((s) => setDocs((d) => ({ ...d, [id]: s.exists() ? (s.data() as Summary) : null })));
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
