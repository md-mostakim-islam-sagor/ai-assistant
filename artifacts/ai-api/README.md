# AI 2.0

Full-stack chat + AI image generation app. Node.js/Express backend keeps your
Gemini API key server-side; frontend is plain HTML/CSS/JS.

## Project structure

```
project/
├── index.js              # Express server + /api/chat + /api/image routes
├── config.js              # Loads secrets from environment variables
├── package.json
├── vercel.json             # Vercel deployment config
├── .env.example
└── src/
    └── public/
        ├── index.html
        ├── style.css
        ├── app.js
        └── mostakim_favicon.png
```

## 1. Local setup

```bash
npm install
cp .env.example .env
# edit .env and paste your real GEMINI_API_KEY
npm start
```

App runs at http://localhost:3000

## 2. Get a Gemini API key

https://aistudio.google.com/app/apikey → Create API key → copy it.

## 3. Deploy to Vercel

### Option A — Vercel CLI
```bash
npm i -g vercel
vercel login
vercel
```
When prompted, set the environment variable:
```bash
vercel env add GEMINI_API_KEY
```
Paste your key, choose all environments (Production/Preview/Development), then:
```bash
vercel --prod
```

### Option B — Vercel Dashboard (no CLI)
1. Push this project to a GitHub repo.
2. Go to https://vercel.com/new and import the repo.
3. Framework preset: **Other**.
4. Before deploying, open **Environment Variables** and add:
   - `GEMINI_API_KEY` = your key
   - `SITE_NAME` = AI 2.0 (optional)
5. Click **Deploy**.

Vercel will read `vercel.json`, build `index.js` as a serverless function,
and serve everything through it — static files, `/api/chat`, and `/api/image`
all work automatically at your `*.vercel.app` domain.

## 4. Admin Panel

Open **`yourdomain.com/?admin`**.

- Default login: **admin / admin123** — change this immediately from the
  panel's "Change Admin Login" section.
- Shows: total API calls, chat calls, image calls, unique users, recent
  activity log.
- Lets you update the **Gemini API key** live, without redeploying —
  it takes priority over `.env` and `config.js`.
- Lets you change the admin username/password (requires current password).
- All admin panel code lives in `src/dashboard/` (`login.html`, `login.js`,
  `admin.html`, `admin.js`, `dashboard.css`).

### ⚠️ Persistence note (important for Vercel)

Settings/stats are stored in a JSON file (`lib/store.js`). On a normal
server (VPS, Render, Railway, your own machine) this file persists on disk
permanently. On **Vercel**, the filesystem is read-only except for `/tmp`,
and `/tmp` is wiped on cold starts — so admin-panel changes (API key,
password, stats) **may reset** after Vercel spins up a fresh instance.

For guaranteed persistence on Vercel, replace `lib/store.js`'s `load()`/
`save()` with a real database (Vercel KV, Supabase, MongoDB Atlas, etc).
For quick testing/personal use, the current setup works fine.

## 5. Message "Swap" (Edit & Regenerate)

Hover over any message bubble in the chat:

- **Your messages** → pencil icon → edit the text and resend. Everything
  after that point in the conversation is replaced with the new reply.
- **AI replies** → repeat icon → regenerate a fresh answer for that turn.
- **Generated images** → repeat icon → generate a new variation of the
  same prompt.

## Notes

- The favicon is served from `src/public/mostakim_favicon.png` and linked
  in `index.html` as `/mostakim_favicon.png`.
- The Gemini API key never reaches the browser — all calls go through
  `/api/chat` on the server.
- If Tailwind/Lucide/marked CDN scripts fail to load on a slow connection,
  the app degrades gracefully instead of crashing (icons just won't render).
