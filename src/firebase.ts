import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
});

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
// The local cache means reopening the app doesn't re-read every event: that keeps us inside the free read quota.
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });
export const ADMIN_EMAIL: string = import.meta.env.VITE_ADMIN_EMAIL ?? '';
