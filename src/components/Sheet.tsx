import { useEffect, useState, type ReactNode } from 'react';
import { CONFLICTS, conflictFor, conflictStats, levelOf } from '../lib/conflicts';
import { sameCountry } from '../lib/countries';
import { EVENT_LABEL, VESSEL_LABEL, eventKind, vesselKindOf } from '../lib/kinds';
import { FUEL, accessColor, type Power } from '../lib/power';
import { ago } from '../lib/time';
import { wikiLookup, type Wiki } from '../lib/wiki';
import type { Ev, Plane, Plant, Vessel } from '../types';
import Translate from './Translate';

export type Sel =
  | { kind: 'country'; title: string; iso: string; names: string[] }
  | { kind: 'conflict'; id: string; other?: string }
  | { kind: 'event'; e: Ev }
  | { kind: 'plane'; p: Plane }
  | { kind: 'vessel'; v: Vessel }
  | { kind: 'plant'; p: Plant }
  | { kind: 'zone'; props: Record<string, unknown> };

type Props = {
  sel: Sel;
  events: Ev[];
  power: Power | null;
  close: () => void;
  pick: (s: Sel, fly?: { lon: number; lat: number; zoom: number }) => void;
};

function WikiCard({ q }: { q: string }) {
  const [w, setW] = useState<Wiki | null | undefined>();
  useEffect(() => { setW(undefined); wikiLookup(q).then(setW); }, [q]);
  if (w === undefined) return <p className="muted">Loading…</p>;
  if (!w) return <p className="muted">No Wikipedia entry found.</p>;
  return (
    <div className="wiki">
      {w.img && <img src={w.img} alt={w.title} />}
      <h4>{w.title}</h4>
      <p>{w.extract}</p>
      <a href={w.url} target="_blank" rel="noreferrer">Wikipedia ↗</a>
    </div>
  );
}

function Tabs({ names, children }: { names: string[]; children: (tab: string) => ReactNode }) {
  const [picked, setTab] = useState(names[0]);
  const tab = names.includes(picked) ? picked : names[0]; // a different sheet may not have the tab that was open
  return (
    <>
      <div className="stabs">
        {names.map((n) => <button key={n} className={n === tab ? 'on' : ''} onClick={() => setTab(n)}>{n}</button>)}
      </div>
      {children(tab)}
    </>
  );
}

function EventList({ list, pick }: { list: Ev[]; pick: Props['pick'] }) {
  if (!list.length) return <p className="muted">No events in the last 3 days.</p>;
  return (
    <>
      {list.slice(0, 60).map((e) => (
        <article key={e.id} className="row click" onClick={() => pick({ kind: 'event', e }, { lon: e.lon, lat: e.lat, zoom: 7 })}>
          <b>{e.title}</b>
          <small className="muted">{EVENT_LABEL[eventKind(e.type, e.power)]} · {e.source} · {ago(e.ts)}</small>
        </article>
      ))}
    </>
  );
}

const Bar = ({ pct, color }: { pct: number; color: string }) => (
  <div className="bar"><i style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }} /></div>
);
const yr = (y?: number) => (y ? <small className="muted">data from {y}</small> : null);
const mw = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} GW` : `${n} MW`);

function PowerTab({ s, power, events, pick }: { s: Extract<Sel, { kind: 'country' }>; power: Power | null; events: Ev[]; pick: Props['pick'] }) {
  const outages = events.filter((e) => e.power && s.names.some((n) => sameCountry(n, e.country)));
  const st = power?.stats[s.iso];
  const plants = (power?.plants ?? []).filter((p) => p.c === s.iso).sort((a, b) => b.m - a.m).slice(0, 8);
  const mix = Object.entries(st?.mix ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <>
      {outages.length > 0 && (
        <>
          <h4>Outage and grid reports</h4>
          <EventList list={outages} pick={pick} />
        </>
      )}
      {!power && <p className="muted">Loading power data… If this never loads, run the "power" workflow once on GitHub.</p>}
      {power && !st && <p className="muted">No electricity data for this country.</p>}
      {st && (
        <>
          {st.access !== undefined && (
            <div className="stat">
              <span>People with electricity access</span><b>{st.access}%</b>
              <Bar pct={st.access} color={accessColor(st.access)} />{yr(st.yr?.access)}
            </div>
          )}
          {st.kwh !== undefined && <div className="stat"><span>Electricity use per person</span><b>{Math.round(st.kwh).toLocaleString()} kWh/yr</b>{yr(st.yr?.kwh)}</div>}
          {st.loss !== undefined && <div className="stat"><span>Lost in the grid</span><b>{st.loss}%</b>{yr(st.yr?.loss)}</div>}
          {st.mw !== undefined && <div className="stat"><span>Installed capacity (plants in the database)</span><b>{mw(st.mw)}</b></div>}
          {mix.length > 0 && (
            <>
              <h4>Capacity by fuel</h4>
              {mix.map(([f, m]) => (
                <div key={f} className="stat">
                  <span>{FUEL[f]?.[0] ?? f}</span><b>{mw(m)}</b>
                  <Bar pct={(m / (st.mw || 1)) * 100} color={FUEL[f]?.[1] ?? '#adb5bd'} />
                </div>
              ))}
            </>
          )}
        </>
      )}
      {plants.length > 0 && (
        <>
          <h4>Largest plants</h4>
          {plants.map((p) => (
            <article key={p.n + p.x} className="row click" onClick={() => pick({ kind: 'plant', p }, { lon: p.x, lat: p.y, zoom: 8 })}>
              <b><span style={{ color: FUEL[p.f]?.[1] }}>●</span> {p.n}</b>
              <small className="muted">{FUEL[p.f]?.[0] ?? p.f} · {mw(p.m)}</small>
            </article>
          ))}
        </>
      )}
    </>
  );
}

export default function Sheet({ sel, events, power, close, pick }: Props) {
  let body: ReactNode;

  if (sel.kind === 'country') {
    const list = events.filter((e) => sel.names.some((n) => sameCountry(n, e.country)));
    body = (
      <>
        <h3>{sel.title}</h3>
        <Tabs names={['Events', 'Power', 'About']}>
          {(t) => t === 'Events' ? <EventList list={list} pick={pick} /> : t === 'Power' ? <PowerTab s={sel} power={power} events={events} pick={pick} /> : <WikiCard q={sel.title} />}
        </Tabs>
      </>
    );
  } else if (sel.kind === 'conflict') {
    const c = CONFLICTS.find((x) => x.id === sel.id);
    const list = events.filter((e) => (sel.other ? e.conflict === sel.other : conflictFor(e)?.id === sel.id));
    const { byId, other } = conflictStats(list);
    const st = sel.other ? other.get(sel.other) : byId.get(sel.id);
    const lvl = levelOf(st?.day ?? 0);
    body = (
      <>
        <h3>{c?.name ?? sel.other} <span className={`badge ${lvl}`}>{lvl === 'high' ? 'High activity' : lvl === 'active' ? 'Active' : 'Quiet'}</span></h3>
        <p className="muted">{st?.day ?? 0} reports in 24h · {st?.total ?? 0} in 3 days · {st?.major ?? 0} major{c?.region ? ` · ${c.region}` : ''}</p>
        <Tabs names={c ? ['Events', 'About'] : ['Events']}>
          {(t) => t === 'Events' ? <EventList list={list} pick={pick} /> : <WikiCard q={c!.wiki} />}
        </Tabs>
      </>
    );
  } else if (sel.kind === 'event') {
    const e = sel.e;
    const c = conflictFor(e);
    body = (
      <>
        <h3>{e.title} <Translate text={`${e.title}. ${e.summary ?? ''}`} /></h3>
        <p className="muted">{EVENT_LABEL[eventKind(e.type, e.power)]} · {e.country} · {e.source} · {ago(e.ts)} ago</p>
        {e.summary && <p>{e.summary}</p>}
        {c && <button onClick={() => pick({ kind: 'conflict', id: c.id }, { lon: c.lon, lat: c.lat, zoom: c.zoom })}>More on {c.name}</button>}{' '}
        {e.url && <a href={e.url} target="_blank" rel="noreferrer">Source ↗</a>}
      </>
    );
  } else if (sel.kind === 'plane') {
    const p = sel.p;
    const kind = p.desc || p.t;
    body = (
      <>
        <h3>✈ {p.flight || p.hex}</h3>
        <p className="muted">{kind ?? 'Unidentified type'}{p.alt ? ` · ${p.alt.toLocaleString()} ft` : ''}{p.trk ? ` · heading ${p.trk}°` : ''}</p>
        {kind && <WikiCard q={`${kind} aircraft`} />}
      </>
    );
  } else if (sel.kind === 'vessel') {
    const v = sel.v;
    const k = vesselKindOf(v);
    body = (
      <>
        <h3>{v.name || `MMSI ${v.mmsi}`}</h3>
        <p className="muted">{VESSEL_LABEL[k]} · MMSI {v.mmsi}</p>
        {k === 'navy' && v.name && <WikiCard q={v.name} />}
      </>
    );
  } else if (sel.kind === 'plant') {
    const p = sel.p;
    body = (
      <>
        <h3><span style={{ color: FUEL[p.f]?.[1] }}>●</span> {p.n}</h3>
        <p className="muted">{FUEL[p.f]?.[0] ?? p.f} power plant · {mw(p.m)} · {p.c}</p>
        <WikiCard q={`${p.n} power station`} />
      </>
    );
  } else {
    const z = sel.props;
    const hidden = new Set(['name', 'description', 'color', 'count', 'admin', 'approx', 'key']);
    const extra = Object.entries(z).filter(([k, v]) => !hidden.has(k) && v !== '' && v !== null);
    const list = z.admin ? [] : events.filter((e) => (conflictFor(e)?.id ?? e.conflict) === z.key);
    body = (
      <>
        <h3><span style={{ color: String(z.color) }}>■</span> {String(z.name)}</h3>
        {z.admin ? (
          <p className="muted">Control / territory zone</p>
        ) : (
          <p className="muted">Area of reported activity: {String(z.count)} reports in the last 72 hours. Shows where events are happening, not who controls the ground.</p>
        )}
        {!!z.description && <p>{String(z.description)}</p>}
        {extra.map(([k, v]) => <div key={k} className="stat"><span>{k.replace(/[_-]/g, ' ')}</span><b>{String(v)}</b></div>)}
        {list.length > 0 && <EventList list={list} pick={pick} />}
      </>
    );
  }

  return (
    <div className="sheet">
      <button className="x" onClick={close} aria-label="Close">×</button>
      {body}
    </div>
  );
}
