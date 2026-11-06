# Frontline

**A free, live map of the world's armed conflicts, with a daily briefing at 5 PM your time.**

Frontline pulls in news from trusted outlets, uses AI to work out *where* each story happened and what kind of event it was, and puts it on a world map next to military aircraft, ships and market moves. It runs entirely on free services (Firebase's free plan and GitHub Actions), so it costs nothing to run.

> **Live app:** https://frontline-world.web.app (sign in with Google)

## What you can do

- **Live conflict map.** Events from the last few days, a heatmap, shaded activity zones, and a tap-through panel for each event with a link to the original story.
- **Tap a country** to see everything reported there. Tap an aircraft or a warship to see its photo and a short Wikipedia description.
- **Military aircraft and vessels** shown live where public tracking data exists.
- **Daily briefing.** A neutral summary of the day's developments, ready at **5 PM in your own time zone**, with the last 7 days to browse.
- **Home feed** of the most active conflicts and the latest headlines.
- **Markets.** Defense stocks, oil, gas, gold and key currencies, plus the words that keep showing up in the news.
- **Translate** any headline or summary with one tap, in the language you pick in Settings.
- **Light and dark themes**, automatic by default.

## How it works

```
GitHub Actions (every 10 min, and hourly)              Your browser (React + MapLibre)
  news RSS + GDELT + trusted accounts on Bluesky  --->   live Firestore listeners
        -> Gemini: is it a conflict event? where?          the map, feeds, daily summary
  ACLED events, AISStream ships, adsb.lol aircraft    ->  Wikipedia for plane / ship / country cards
  Yahoo market quotes
        -> Firestore database (free plan)  <---------  Google sign-in (Firebase Auth)
  hourly Gemini summary + trending words
```

There is no server to run. Scheduled GitHub jobs collect and classify the data and write it to Firestore, and the web app just reads it.

## Where the data comes from

| What | Source |
|---|---|
| Headlines | RSS from BBC, Al Jazeera, The New York Times, The Guardian, DW, France 24, NPR, UN News and Sky News. Only headlines and short summaries are used, and every item links back to the original. |
| Trusted accounts | Public posts from news organisations on [Bluesky](https://bsky.app) (AP, Reuters, Al Jazeera, NYT, Guardian, Washington Post, Bellingcat, NPR, France 24). |
| Global news index | [GDELT](https://www.gdeltproject.org) |
| Conflict event data (optional) | [ACLED](https://acleddata.com). Check their terms of use before running a public copy. |
| Classification, locations, summaries | Google Gemini (free tier) |
| Military aircraft | [adsb.lol](https://adsb.lol) community ADS-B data |
| Ships | [AISStream](https://aisstream.io) |
| Market quotes | Yahoo Finance (unofficial, delayed) |
| Descriptions and photos | Wikipedia (text is CC BY-SA 4.0; each image has its own licence) |
| Base map | CARTO, with map data (c) OpenStreetMap contributors |
| Country borders | Natural Earth (public domain) |

## Please read: limits and accuracy

Frontline is an informational tool, not a source of record, and **not for safety-critical decisions**.

- **Locations and event types are worked out by AI** from headlines and can be wrong. Always open the source link for anything that matters.
- **"Real time" means roughly every 10 minutes.** Scheduled jobs on GitHub can also run late.
- **Aircraft and ships are partial.** Aircraft come from volunteer receivers and only those flagged military appear. Warships often switch their tracking off, so many never show up.
- **Activity zones** are shaded areas where recent reports cluster. They show where news is happening, **not who controls the ground.**
- **ACLED data lags** by about a week, and market quotes are delayed and may occasionally break.
- It is built for a small audience on free quotas, not thousands of simultaneous users.
- Frontline is independent. It is not affiliated with, or endorsed by, any of the outlets, data providers or services listed above.

## Privacy

You sign in with Google through Firebase Authentication. Frontline keeps your theme and translation-language choices in your own browser only. It does not show ads or sell data. The map loads tiles from CARTO, borders from jsDelivr and descriptions from Wikipedia, so those services see your IP address like any website you visit.

## Run your own copy

You need a free Google account, a free GitHub account, and about 20 minutes. Node 22 or newer is required for local work.

**1. Firebase** (console.firebase.google.com, stay on the free Spark plan)
1. Create a project. Build, Authentication: enable the **Google** provider.
2. Build, Firestore Database: create it (production mode).
3. Project settings, Your apps: add a **Web app** and copy its config into `.env.local` (see `.env.example`).
4. Project settings, Service accounts: **Generate new private key**. Keep that file secret and never commit it.
5. Put **your Google email** in `VITE_ADMIN_EMAIL` (in `.env.local`) and in `firestore.rules`. That account gets the Admin panel in Settings.

**2. Free API keys.** Add each as a GitHub secret under Settings, Secrets and variables, Actions.

| Secret | Where to get it | Notes |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | step 4 above | paste the whole JSON |
| `GEMINI_API_KEY` | aistudio.google.com/apikey | free tier |
| `AISSTREAM_KEY` | aisstream.io | optional; without it there are no ships |
| `ACLED_EMAIL`, `ACLED_PASSWORD` | acleddata.com | optional; the account may need API access approved first |

Google retires Gemini model names from time to time. If the jobs report a "model not found" error, add a repository **variable** (not a secret) named `GEMINI_MODEL` set to a current Flash-Lite model from Google AI Studio.

**3. Push to GitHub and seed the data.** Use a public repo (Actions minutes are unlimited). Commit `package-lock.json`, because the jobs use `npm ci`. Then open the Actions tab and run **ingest** and **summarize** once by hand.

**4. Build and deploy**

```bash
npm install
npm test
npm run dev        # local app at http://localhost:5173
npm run build
npx firebase-tools login
npx firebase-tools use <your-project-id>
npx firebase-tools deploy --only hosting,firestore:rules
```

If you use a custom domain, add it under Authentication, Settings, Authorized domains. To make the app readable without signing in, change `allow read: if request.auth != null;` to `if true;` in `firestore.rules`.

### Keeping it healthy

- GitHub pauses scheduled workflows after 60 days without repository activity. Push any commit to wake them.
- Events older than 14 days are deleted automatically, and the app reads only the last 3 days, which keeps it inside Firestore's free quota.
- If Gemini is briefly overloaded, the jobs retry and then simply try again on the next run.

## Project layout

```
src/            React app: map, home feed, daily summary, markets, settings
scripts/        the scheduled jobs (ingest.ts every 10 min, summarize.ts hourly)
test/           unit tests for parsing, zones and time logic (npm test)
.github/        GitHub Actions schedules
firestore.rules who may read and write data
```

## Contributing

Bug reports and ideas are welcome: open an issue. Before sending a change, run `npm test` and `npm run typecheck`.
