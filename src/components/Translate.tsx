import { usePrefs } from '../lib/prefs';

/** Free translation: opens Google Translate with the text pre-filled in the language chosen in Settings (no API key, no cost). */
export default function Translate({ text }: { text: string }) {
  const { lang } = usePrefs();
  return (
    <a className="tr" title="Translate" target="_blank" rel="noreferrer"
      href={`https://translate.google.com/?sl=auto&tl=${lang}&op=translate&text=${encodeURIComponent(text.slice(0, 4000))}`}>
      🌐
    </a>
  );
}
