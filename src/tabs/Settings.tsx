import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import { signOut, type User } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { useData } from '../data';
import { ADMIN_EMAIL, auth, db } from '../firebase';
import { usePrefs } from '../lib/prefs';

export default function Settings({ user }: { user: User }) {
  const { pref, setPref } = usePrefs();
  return (
    <>
      <h2>Settings</h2>
      <label className="field">Theme
        <select value={pref} onChange={(e) => setPref(e.target.value as never)}>
          <option value="auto">Automatic (match device)</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <p className="muted">Signed in as {user.email}</p>
      <button onClick={() => signOut(auth)}>Sign out</button>
      {ADMIN_EMAIL && user.email === ADMIN_EMAIL && <Admin />}
    </>
  );
}

const num = (s: FormDataEntryValue | null) => Number(s);

function Admin() {
  const { zones } = useData();
  const [msg, setMsg] = useState('');

  const addEvent = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const lat = num(f.get('lat')), lon = num(f.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return setMsg('Latitude/longitude look wrong.');
    try {
      await addDoc(collection(db, 'events'), {
        title: f.get('title'), summary: f.get('summary'), country: f.get('country'), conflict: f.get('conflict'),
        lat, lon, severity: num(f.get('severity')), type: 'manual', source: 'manual', ts: Date.now(),
      });
      e.currentTarget.reset();
      setMsg('Event posted.');
    } catch (err) { setMsg(String(err)); }
  };

  const addZone = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      JSON.parse(String(f.get('geojson')));
      await addDoc(collection(db, 'zones'), { name: f.get('name'), color: f.get('color'), description: f.get('description') ?? '', geojson: f.get('geojson') });
      e.currentTarget.reset();
      setMsg('Zone added.');
    } catch (err) { setMsg(`Zone not saved: ${err}`); }
  };

  return (
    <section className="admin">
      <h3>Admin</h3>
      {msg && <p className="accent">{msg}</p>}
      <form onSubmit={addEvent}>
        <h4>Post an event</h4>
        <input name="title" placeholder="Headline" required />
        <input name="summary" placeholder="One-line summary" />
        <input name="country" placeholder="Country (e.g. Ukraine)" required />
        <input name="conflict" placeholder="Conflict (e.g. Russia-Ukraine war)" required />
        <div className="two"><input name="lat" placeholder="Latitude" required /><input name="lon" placeholder="Longitude" required /></div>
        <select name="severity" defaultValue="2"><option value="1">Minor</option><option value="2">Notable</option><option value="3">Major</option></select>
        <button>Post</button>
      </form>
      <form onSubmit={addZone}>
        <h4>Add / override a territory zone</h4>
        <input name="name" placeholder="Zone name" required />
        <input name="description" placeholder="Description (optional; shown when the zone is tapped)" />
        <input name="color" type="color" defaultValue="#ff3b30" />
        <textarea name="geojson" rows={4} placeholder='GeoJSON Polygon, e.g. {"type":"Polygon","coordinates":[[[30,48],[31,48],[31,49],[30,48]]]}' required />
        <button>Add zone</button>
      </form>
      {zones.map((z) => (
        <div key={z.id} className="row quote">
          <span style={{ color: z.color }}>■ {z.name}</span>
          <button onClick={() => deleteDoc(doc(db, 'zones', z.id))}>Delete</button>
        </div>
      ))}
    </section>
  );
}
