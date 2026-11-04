import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Pref = 'auto' | 'dark' | 'light';
type P = { pref: Pref; setPref: (p: Pref) => void; theme: 'dark' | 'light'; lang: string; setLang: (l: string) => void };

const read = (k: string, d: string) => {
  try { return localStorage.getItem(k) || d; } catch { return d; }
};
const write = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* private mode: preference just won't persist */ }
};

const Ctx = createContext<P>(null as never);
export const usePrefs = () => useContext(Ctx);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [pref, setP] = useState<Pref>(() => read('theme', 'auto') as Pref);
  const [lang, setL] = useState(() => read('lang', 'es'));
  const [sysDark, setSys] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)');
    const f = () => setSys(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  const theme = pref === 'auto' ? (sysDark ? 'dark' : 'light') : pref;
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return (
    <Ctx.Provider value={{ pref, theme, lang, setPref: (p) => { setP(p); write('theme', p); }, setLang: (l) => { setL(l); write('lang', l); } }}>
      {children}
    </Ctx.Provider>
  );
}
