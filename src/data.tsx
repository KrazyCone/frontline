import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Ev, Quote, Summary, Vessel, Word, Zone } from './types';

type Data = {
  events: Ev[]; vessels: Vessel[]; quotes: Quote[]; words: Word[]; zones: Zone[];
  latest?: Summary; err: string;
};
const Ctx = createContext<Data>(null as never);
export const useData = () => useContext(Ctx);

/** One set of live Firestore listeners shared by every tab. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [d, setD] = useState<Data>({ events: [], vessels: [], quotes: [], words: [], zones: [], err: '' });
  useEffect(() => {
    const set = (p: Partial<Data>) => setD((x) => ({ ...x, ...p }));
    // Name the failing source so a permissions or index problem is easy to pin down.
    const err = (name: string) => (e: Error) => { console.error(`Firestore ${name}:`, e); set({ err: `${name}: ${e.message}` }); };
    const since = Date.now() - 3 * 864e5;
    const offs = [
      onSnapshot(query(collection(db, 'events'), where('ts', '>', since), orderBy('ts', 'desc'), limit(300)),
        (s) => set({ events: s.docs.map((x) => ({ id: x.id, ...x.data() }) as Ev) }), err('events')),
      onSnapshot(doc(db, 'vessels', 'latest'), (s) => set({ vessels: s.data()?.items ?? [] }), err('vessels')),
      onSnapshot(doc(db, 'markets', 'latest'), (s) => set({ quotes: s.data()?.items ?? [] }), err('markets')),
      onSnapshot(doc(db, 'markets', 'keywords'), (s) => set({ words: s.data()?.items ?? [] }), err('keywords')),
      onSnapshot(collection(db, 'zones'), (s) => set({ zones: s.docs.map((x) => ({ id: x.id, ...x.data() }) as Zone) }), err('zones')),
      onSnapshot(query(collection(db, 'summaries'), orderBy('ts', 'desc'), limit(1)),
        (s) => set({ latest: s.docs[0]?.data() as Summary | undefined }), err('summaries')),
    ];
    return () => offs.forEach((f) => f());
  }, []);
  return <Ctx.Provider value={d}>{children}</Ctx.Provider>;
}
