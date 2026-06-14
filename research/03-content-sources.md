# Content Sources & APIs for an AI-Curated Feed (2026)

> Raw research thread 3 of 4. Sources cited inline.

## Executive Summary

**"RSS + a few APIs gets you 80%"** is true — closer to **90%** for these categories. Nearly every source (news sites, company press pages, YouTube channels, Substack/Medium, podcasts, blogs, conference orgs) publishes a free RSS/Atom feed, and the two highest-value structured APIs — **Hacker News** (free, no key) and **GDELT** (free, global, no key) — cost nothing. Paid news APIs are *supplements* for keyword search + de-duped multi-source coverage, not your backbone. Practical v1: **self-hosted feed engine (Miniflux/FreshRSS) + curated RSS + RSS-Bridge for feedless sites + GDELT for global discovery + HN API for tech** — free or ~$5–10/mo hosting. **2026 gotcha: the Bing News Search API was retired Aug 11, 2025 — don't design around it.**

## 1. General news APIs (for keyword search + dedup across outlets)

| API | Free tier | Commercial on free? | Paid entry | Coverage |
|---|---|---|---|---|
| **NewsAPI.org** | 100 req/day, localhost-only, dev/test only | **No** | **$449/mo** | ~150k sources |
| **GNews.io** | 100 req/day | No | €49.99/mo | ~60k sources |
| **NewsData.io** | ~200 req/day | **Yes (rare!)** | ~$199.99/mo | ~87–97k sources, 206 countries, AI tags/sentiment |
| **Mediastack** | 500 req/month | Limited | **$24.99/mo (cheapest)** | 7,500+ sources |
| **Currents** | **1,000 req/day** | check ToS | $69/mo | 120k+ sources |
| **Bing News** | **RETIRED Aug 11, 2025** | — | — | gone |

Takeaways: NewsAPI.org free tier is localhost-only (prototyping only; real use $449/mo). **NewsData.io** (commercial free tier + AI enrichment) and **Currents** (1,000/day free) are the most usable. Mediastack = cheapest paid on-ramp.

## 2. GDELT (free global news/events) — *high leverage*
The best free firehose. Monitors world news in 100+ languages, updates every 15 min, **free no key**.
- **DOC 2.0 API:** keyword search over rolling 3-month window (data to 2017), returns article lists, timelines, tone, **and can output RSS/JSON/CSV** → wire straight into an RSS pipeline. Searches 65 machine-translated languages from English keywords.
- **Events DB (CAMEO)** + **Global Knowledge Graph** (themes/persons/locations/orgs/sentiment, 2,200+ emotions). Bulk via BigQuery.
- Use as your **broad/global news + company/launch discovery layer**. https://www.gdeltproject.org/ · https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/

## 3. RSS backbone — *the 80% answer*
- **News sites:** section/topic RSS nearly universal.
- **Google News search-as-feed (free):** `https://news.google.com/rss/search?q=QUERY&hl=en-US&gl=US&ceid=US:en` — supports OR/quotes/`site:`/`when:24h`, ~100 items/query. Undocumented but stable for years.
- **Company press pages:** most have RSS (see §4).
- **YouTube channels:** `https://www.youtube.com/feeds/videos.xml?channel_id=UC…` — every public channel, no owner action, no quota. Covers conference + educational channels.
- **Substack:** `https://NAME.substack.com/feed`. **Medium:** `https://medium.com/@USER/feed`. **Podcasts:** RSS is the native format.
- **Tooling:** **Miniflux** (lean Go, REST API, $5–10 VPS), **FreshRSS** (scales to 1M+ articles/50k feeds), **RSS-Bridge / RSSHub** (feeds for 200+ feedless sites incl. X/Reddit), **Full-Text RSS / Mercury Parser** (summary→full text). Miniflux/FreshRSS expose REST APIs → your AI layer reads from your own aggregator.

## 4. Company announcements & product launches (e.g., "Nvidia released a new chip")
- **Official newsroom RSS (free, fastest, authoritative):** NVIDIA `nvidianews.nvidia.com/rss`, OpenAI `openai.com/news`, Anthropic `anthropic.com/news`, most majors. Missing one → RSS-Bridge.
- **Wire services:** PR Newswire RSS channels; **Business Wire** customizable RSS with **250+ keyword filters**; enterprise REST APIs (paid, distribution-oriented). RTPR (rtpr.io) aggregates all wires real-time (paid, for traders).
- **Product-launch specific:** Releasebot (releasebot.io) timelines of release notes/changelogs; **GitHub Releases per-repo Atom** (`github.com/OWNER/REPO/releases.atom`); GDELT/Google-News company queries as safety net.
- **Recommendation:** ~50–100 hand-picked newsroom + changelog feeds + Business Wire keyword feeds + GDELT queries. Skip paid wire APIs unless you need sub-second delivery.

## 5. Tech / startup
- **Hacker News API** — official Firebase, `topstories`/`item/{id}`/etc., **free, no key, no rate limit**, SSE streaming. + **Algolia HN Search** for full-text.
- **Product Hunt API v2 (GraphQL)** — free **non-commercial only**; commercial needs emailing them. Use its RSS cautiously.
- **TechCrunch/The Verge** — free RSS. **GitHub Trending** — no official API; use **mshibanami/GitHubTrendingRSS** (free RSS) to stay in your pipeline.

## 6. Conferences / talks
No clean API — pipeline = **YouTube channel RSS + podcast RSS + a few media feeds**, transcripts pulled separately.
- **Conference YouTube channels** via per-channel RSS (QCon/InfoQ, GTC, Google I/O, etc.).
- **InfoQ** — 500+ talks, many with transcripts, RSS + podcasts.
- **Transcripts (the hard part):** YouTube auto-captions (most scalable); **Podcasting 2.0 `<podcast:transcript>` tag** when present (direct VTT/SRT URL); else your own **Whisper** STT. Apple/Spotify transcripts have **no public export API**.

## 7. Self-help / educational
Almost 100% RSS-addressable, free: Substack feeds, Medium feeds, blog RSS, educational YouTube (per-channel RSS), educational podcasts. Newsletters without RSS → email→RSS (Kill-the-Newsletter, n8n email trigger). Your value-add is the AI curation/summarization + transcription on top.

## 8. Aggregation infrastructure & orchestration
- **OSS frameworks:** Miniflux / FreshRSS (also act as ingestion backends via REST API), RSS-Bridge / RSSHub, Full-Text RSS / Mercury, Tiny Tiny RSS.
- **n8n vs Zapier:** **n8n (self-hosted)** wins for a feed aggregator — free under Sustainable Use License, no task limits, JS/Python code nodes, branching, 400+ nodes, built-in RSS trigger (note a polling quirk; workaround = datastore of seen items, or Schedule trigger + HTTP/Code). Zapier = cloud-only + per-task pricing → poor fit for high-volume polling. Best combo: **Miniflux/FreshRSS do heavy polling/dedup; n8n reads their API + calls GDELT/HN/news APIs + runs AI curation + writes to store.**

## Recommended starting stack
**Phase 1 (~$0 or $5–10/mo hosting, ~80–90% coverage):** Miniflux/FreshRSS (curated RSS across all categories) + RSS-Bridge/RSSHub + Full-Text RSS + **GDELT** + **HN API + Algolia** + **Google News RSS** + **GitHubTrendingRSS** + **n8n** orchestration + **Whisper** for transcripts.
**Phase 2 (paid only on real gaps):** **NewsData.io** (commercial free tier) or Mediastack ($24.99) for keyword discovery; Business Wire keyword RSS / RTPR for real-time corporate wire; contact Product Hunt if PH data becomes core.

**Headline:** curated RSS + GDELT + Hacker News (all free) cover the large majority. Paid news APIs are an optional discovery booster, not a foundation. Biggest 2026 trap: designing around the retired Bing News API.

## Sources
- Best News APIs 2026: https://dataresearchtools.com/best-news-apis-comparison/ · NewsAPI: https://newsapi.org/pricing · GNews: https://gnews.io/pricing · NewsData: https://newsdata.io/blog/news-api-comparison/ · Currents: https://currentsapi.services/en
- Bing retirement: https://www.searchcans.com/blog/bing-search-api-retirement-alternatives-2026/
- GDELT: https://www.gdeltproject.org/ · DOC 2.0: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- Google News RSS params: https://www.newscatcherapi.com/blog-posts/google-news-rss-search-parameters-the-missing-documentaiton
- YouTube RSS: https://www.wprssaggregator.com/youtube-rss-feed/ · Substack RSS: https://support.substack.com/hc/en-us/articles/360038239391
- Miniflux: https://rye.dev/blog/rss-miniflux-2026/ · FreshRSS: https://github.com/FreshRSS/FreshRSS · RSS-Bridge: https://github.com/RSS-Bridge/rss-bridge
- NVIDIA RSS: https://nvidianews.nvidia.com/rss · Business Wire feeds: https://www.businesswire.com/help/feed-options · Press-release feeds: https://rss.feedspot.com/press_release_rss_feeds/
- Hacker News API: https://github.com/HackerNews/API · Product Hunt API: https://api.producthunt.com/v2/docs · GitHubTrendingRSS: https://github.com/mshibanami/GitHubTrendingRSS
- InfoQ: https://www.infoq.com/ · Podcasting 2.0 transcripts: https://podnews.net/update/spotify-transcripts-p20
- n8n vs Zapier: https://hatchworks.com/blog/ai-agents/n8n-vs-zapier/ · n8n RSS fix: https://www.front2backdev.com/n8n-rss-feed-trigger/

**Caveats:** NewsData.io exact paid pricing varies (JS-rendered page); free-tier commercial allowance + coverage well-corroborated. Google News/YouTube/GitHub-trending RSS are unofficial-but-stable — add retries/fallbacks. Re-check commercial-use clauses per free tier; respect robots/ToS for any scraping.
