# Frontline

Free, real-time global conflict tracker: a live world map (events, heatmap, activity zones, military aircraft, vessels), a Home feed, a daily summary at 5 PM *your* local time, and Markets. Built on Firebase's free Spark plan plus free GitHub Actions.

```
GitHub Actions (every 10 min / hourly)          Browser (React + MapLibre)
  news RSS + GDELT -> Gemini (geocode/classify)    live Firestore listeners
  ACLED events, AISStream ships, Yahoo markets  -> Firestore <- Google sign-in
  hourly Gemini summary + trending words           military aircraft: adsb.lol via the job
                                                   Wikipedia: plane / ship cards
```

## 1. One-time setup (about 20 minutes)

**Firebase** (console.firebase.google.com, stay on the free Spark plan)
1. Create a project. Build -> Authentication -> enable the **Google** provider.
2. Build -> Firestore Database -> create (production mode).
3. Project settings -> Your apps -> add a **Web app**; copy its config into `.env.local` (see `.env.example`).
4. Project settings -> Service accounts -> **Generate new private key**. Keep that JSON secret.
5. Put **your Google email** in two places: `VITE_ADMIN_EMAIL` in `.env.local`, and `CHANGE_ME@gmail.com` in `firestore.rules`.

**Free API keys** (add each as a GitHub repo secret: Settings -> Secrets and variables -> Actions)

| Secret | Where to get it | Notes |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | step 4 above | paste the whole JSON |
| `GEMINI_API_KEY` | aistudio.google.com/apikey | free tier. If the default model `gemini-2.5-flash-lite` is ever retired, set a repo *variable* (not secret) named `GEMINI_MODEL` |
| `AISSTREAM_KEY` | aisstream.io | optional; no key = no vessels |
| `ACLED_EMAIL`, `ACLED_PASSWORD` | acleddata.com (register a myACLED account) | optional; the account may need API access approved by ACLED |

No key needed: BBC/Al Jazeera/NYT/Guardian RSS, GDELT, adsb.lol aircraft, Wikipedia, Yahoo market quotes.

**GitHub**: push this folder to a **public** repo (unlimited free Actions minutes). Commit `package-lock.json` (created by `npm install`), because the workflows use `npm ci`. Then Actions -> run **ingest** and **summarize** once manually to seed data.

## 2. Run and deploy

```bash
npm install
npm test                       # unit tests for the parsing / zone / time logic
npm run dev                    # local app on http://localhost:5173
npm run build
npx firebase-tools login
npx firebase-tools use <your-project-id>
npx firebase-tools deploy --only hosting,firestore:rules
```
Add your site's domain (`<project>.web.app` is already allowed) under Authentication -> Settings -> Authorized domains if you use a custom one.

## 3. How the pieces map to what you asked for

- **Bottom bar**: Home - Daily - **Map** (centre, opens by default) - Markets - Settings.
- **Map**: tap an event, aircraft or vessel for details; tap a **country** to see its events. Known aircraft types and naval vessels show a Wikipedia photo and description. Layer toggles top-right.
- **Territory shading**: auto-generated *activity zones* (clusters of recent events, labelled approximate). Settings -> Admin lets you add real control-area polygons (GeoJSON) or delete zones.
- **Daily summary**: generated hourly; each user sees the one nearest **their own** 5 PM, with the last 7 days browsable.
- **Translate**: the globe button opens Google Translate in the language chosen in Settings.
- **Theme**: automatic by default, with Dark/Light override in Settings.
- **Access**: Google sign-in required. To make it public, change `allow read: if request.auth != null;` to `if true;` in `firestore.rules`.

## 4. Known limits (read these)

- **Real-time is ~10 minutes** for news/vessels (GitHub cron minimum + queue delay). Aircraft positions refresh on the same schedule, because adsb.lol blocks requests from web pages, so the job fetches them. GitHub pauses scheduled workflows after 60 days with no repo activity; push any commit to wake them.
- **Free-quota guards**: Firestore reads are capped by a 3-day / 300-event listener and local caching; events older than 14 days are deleted hourly. Fine for a handful of users, not for thousands.
- **Warships often turn AIS off**, so naval coverage is partial. Aircraft coverage depends on volunteer ADS-B receivers and shows only aircraft flagged military.
- **ACLED data is delayed** (updated weekly) and is pulled 4x/day.
- **Yahoo quotes are an unofficial endpoint**: delayed, and may break without notice.
- **AI-geocoded news** can be wrong; every item links to its source.
- **Install icon is SVG only**; if your browser doesn't offer "Install app", add 192/512 px PNG icons to `public/manifest.webmanifest`. No offline mode.
- **Country click** loads Natural Earth boundaries from jsDelivr at runtime (`COUNTRIES` in `src/tabs/MapTab.tsx`); download the file into `public/` and point there to self-host.
