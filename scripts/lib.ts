import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var ${k}`);
  return v;
};

initializeApp({ credential: cert(JSON.parse(need('FIREBASE_SERVICE_ACCOUNT'))) });
export const db = getFirestore();

/** One Gemini call that must return JSON. Model is overridable because free-tier model names change. */
export async function gemini(prompt: string): Promise<any> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': need('GEMINI_API_KEY') },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j: any = await r.json();
  return JSON.parse(j.candidates[0].content.parts[0].text);
}
