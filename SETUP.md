# Loupe — going live (free + auto)

This turns the static demo into a **free, self-updating website**. A GitHub Action
pulls fresh news every day, writes `loupe-site/feed.json`, and redeploys the page to
GitHub Pages. No server to keep alive, $0/month.

```
  GitHub Actions cron (daily, free)
     → node scripts/build-feed.js   (RSS · Hacker News · arXiv · GDELT — all free)
     → loupe-site/feed.json
     → GitHub Pages serves loupe-site/  (free static hosting)
     → index.html fetches feed.json     (instead of the old hardcoded list)
```

## One-time setup (~10 min)

### 1. Put it on GitHub
Create a **public** repo (public = free Actions + free Pages), then from this folder:

```bash
git init
git add .
git commit -m "Loupe: live auto-feed"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### 2. Turn on Pages
Repo → **Settings → Pages → Build and deployment → Source = GitHub Actions**.

### 3. (Optional but recommended) Add the free Gemini key for rich cards
Without a key the site still works — each card shows the real headline + the source's
own summary. **With** a key you get the full multi-lens digest (what's new / how it hits
you / profit angle / mind-shift / your move) **and** Kha's Gen-Z voice, generated for free.

1. Get a free key at **https://aistudio.google.com/apikey**
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**
3. Name: `GEMINI_API_KEY`  ·  Value: your key

### 4. Run it
Repo → **Actions → "Build & deploy Loupe feed" → Run workflow**.
When it finishes, your site is live at the URL shown in the run
(`https://<you>.github.io/<repo>/`). After that it rebuilds itself **every day at 06:00 UTC**.

## Knobs (optional)
Set these as repo secrets/variables or env vars to tune the build:

| Var | Default | Meaning |
|---|---|---|
| `GEMINI_API_KEY` | _(unset)_ | Free Gemini key. Unset = snippet-only cards. |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Which free model to use. |
| `MAX_ITEMS` | `20` | How many cards to surface. |
| `MAX_LLM` | `18` | How many of those get an AI digest (caps free-tier usage). |

To add/remove sources, edit the `FEEDS` list at the top of
[`scripts/build-feed.js`](scripts/build-feed.js) (each entry is `{ url, src }`).

## Test it locally
```bash
node scripts/build-feed.js          # writes loupe-site/feed.json (uses GEMINI_API_KEY if exported)
npx serve loupe-site                # or any static server, then open the printed URL
```
Opening `index.html` directly via `file://` won't fetch `feed.json` (browser blocks it) —
the page falls back to the built-in sample, which is expected. Serve the folder to see live data.

## Cost
- GitHub Actions + Pages on a public repo: **free**.
- Gemini free tier: **free** (well within limits for ~18 items/day).
- Sources (RSS, Hacker News, arXiv, GDELT): **free, no keys**.
