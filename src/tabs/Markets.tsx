import { useData } from '../data';

export default function Markets() {
  const { quotes, words } = useData();
  const groups = [...new Set(quotes.map((q) => q.group))];
  const max = Math.max(1, ...words.map((w) => w.count));
  return (
    <>
      <h2>Markets</h2>
      {quotes.length === 0 && <p className="muted">No quotes yet. The fetcher fills these in.</p>}
      {groups.map((g) => (
        <section key={g}>
          <h3>{g}</h3>
          {quotes.filter((q) => q.group === g).map((q) => (
            <div key={q.sym} className="row quote">
              <span>{q.label}</span>
              <span>{q.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
              <span className={q.pct >= 0 ? 'up' : 'down'}>{q.pct >= 0 ? '+' : ''}{q.pct.toFixed(2)}%</span>
            </div>
          ))}
        </section>
      ))}
      <small className="muted">Prices are delayed and unofficial. Not financial advice.</small>

      <h3>Trending words (last 24h)</h3>
      <div className="cloud">
        {words.map((w) => (
          <span key={w.word} style={{ fontSize: `${0.85 + (w.count / max) * 0.9}rem` }}>{w.word}</span>
        ))}
        {words.length === 0 && <p className="muted">Appears after the first hourly run.</p>}
      </div>
    </>
  );
}
