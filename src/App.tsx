import { onAuthStateChanged, signInWithPopup, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { DataProvider, useData } from './data';
import { auth, provider } from './firebase';
import { PrefsProvider } from './lib/prefs';
import Home from './tabs/Home';
import MapTab from './tabs/MapTab';
import Markets from './tabs/Markets';
import Settings from './tabs/Settings';
import SummaryTab from './tabs/Summary';

const TABS = [
  ['home', 'Home', '⌂'],
  ['summary', 'Daily', '☰'],
  ['map', 'Map', '◎'],
  ['markets', 'Markets', '▲'],
  ['settings', 'Settings', '⚙'],
] as const;

export default function App() {
  return (
    <PrefsProvider>
      <Gate />
    </PrefsProvider>
  );
}

function Gate() {
  const [user, setUser] = useState<User | null | undefined>();
  const [err, setErr] = useState('');
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <div className="center">Loading…</div>;
  if (!user)
    return (
      <div className="center">
        <img src="/icon.svg" width={72} height={72} alt="" />
        <h1>Frontline</h1>
        <p className="muted">Live global conflict tracking and daily briefings.</p>
        <button className="primary" onClick={() => signInWithPopup(auth, provider).catch((e) => setErr(e.message))}>Sign in with Google</button>
        {err && <p className="accent">{err}</p>}
      </div>
    );
  return (
    <DataProvider>
      <Shell user={user} />
    </DataProvider>
  );
}

function Shell({ user }: { user: User }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('map');
  const { err } = useData();
  return (
    <>
      {err && <div className="banner">Data error: {err}</div>}
      <main>
        <section className="tab" hidden={tab !== 'home'}><Home go={(t) => setTab(t as never)} /></section>
        <section className="tab" hidden={tab !== 'summary'}><SummaryTab /></section>
        <section className="tab map" hidden={tab !== 'map'}><ErrorBoundary label="map"><MapTab active={tab === 'map'} /></ErrorBoundary></section>
        <section className="tab" hidden={tab !== 'markets'}><Markets /></section>
        <section className="tab" hidden={tab !== 'settings'}><Settings user={user} /></section>
      </main>
      <nav>
        {TABS.map(([id, label, icon]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>
    </>
  );
}
