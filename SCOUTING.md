# Productive Doomscrolling — Scouting Report

**Status:** ✅ complete
**Workspace:** `D:\ERP\side quest`
**Date:** 2026-06-07
**Raw research + sources:** see [`/research`](research/) (4 deep-dive files with citations)

---

## The idea (one line)
An AI-curated "productive feed" — pull content from many sources (YouTube, TikTok, Instagram,
FB, news, self-help, conferences, company announcements like "Nvidia released a new chip"),
then summarize / dedupe / rank it into a fast, scrollable feed. The *pull* of doomscrolling,
but the content is genuinely useful and consumed efficiently.

---

## TL;DR — the verdict

**The idea is good, the market gap is real, and the productive half is cheap to build. But you have to split your own idea in two:**

| Half of your idea | Reality | Verdict |
|---|---|---|
| **"Productive" content** — news, company/product announcements (Nvidia, OpenAI…), tech, conference talks, self-help, *educational YouTube* | Mostly free via **RSS + a couple of free APIs**. Legal. Buildable in **days**, runs for **<$30/mo**. | ✅ **Build this now** |
| **"Doomscroll the socials"** — TikTok / Instagram / Facebook feeds | The official APIs **forbid third-party aggregation**. Your only route is grey-area scrapers (ToS-violating, ~$0.50–2.50 / 1k items, breakage + legal risk). | ⚠️ **Risky, do later (or never)** |

So: **build the RSS-backed "productive feed" engine first** — it already covers Nvidia chips, news, conferences, self-help, and educational YouTube. Treat TikTok/IG/FB as a *risky optional add-on*, not the foundation. If you build the foundation on the social platforms, you're building on sand — the same sand Artifact (the Instagram founders' app) died on.

---

## 1. The make-or-break finding: platform access

This is the part most people get wrong, so it goes first. **There is no platform where a commercial, multi-source aggregator can cheaply, legally, and easily read other people's public content.** Tier list for a *commercial* product:

| Platform | Tier | Why |
|---|---|---|
| **Threads** | 🟡→🟢 | Official API, **free**, *can* read public posts/search. Needs Meta App Review. Your best *native social* surface. |
| **YouTube** | 🟡 (single-creator) / 🔴 (aggregator) | Free API, but Developer Policy **bans aggregating across channels** (§III.E.2.a) + **30-day storage cap**. Fine for *your own / whitelisted* channels. Public transcripts **not** available via official API. **BUT** every channel has a free **RSS feed** for new-video discovery (no quota) — that's the legal way in. |
| **X / Twitter** | 🟡 | Legal but **pay-per-use ($0.005/read, hard 2M/mo cap)**; broad ingestion gets expensive. OK for low volume. |
| **TikTok** | 🔴 | Read API (Research API) is **non-profit academics only**. Commercial use **categorically barred**. |
| **Instagram** | 🔴 | Basic Display API **dead (Dec 2024)**. Graph API only reads accounts *you own*. No aggregation path. |
| **Facebook** | 🔴 | Public-page reading gated behind hard-to-get approval. Effectively closed. |
| **Reddit** | 🔴 (commercial) | Free tier is **non-commercial only**; commercial access is sales-gated, ~$12k/mo-class. |
| **LinkedIn** | 🔴 | Partner-gated, no public reading, $10–50k/yr, litigates scrapers. |

**Implication for your vision:** the TikTok/IG/FB "doomscroll feel" is exactly the part that's blocked. The good news — you don't need them. The productive value (Nvidia launches, conference talks, self-help, tech news, educational video) is fully reachable through legal, free channels (below). *Detail + every citation in [research/02-platform-access.md](research/02-platform-access.md).*

---

## 2. Is it worth building? (the graveyard + the gap)

**The graveyard is instructive.** Artifact (built by Instagram's founders, well-funded, great team) shut down in 2024. SmartNews (a unicorn) collapsed in the US. **Same structural cause:** "aggregate all the news, summarize + rank it with AI" is a *feature, not a product* — it recreates the firehose, AI summaries are now commoditized (every incumbent does them free), and news alone is a small, fatigued, low-willingness-to-pay market. Systrom's own verdict: *"the market opportunity isn't big enough."*

**What survives and makes money** is either **narrow + opinionated** (Ground News = bias lens; News Minimalist = "the 1% most significant") or **repackaged audio/newsletter** (Meco, Huxe, Morning Brew $70M+).

**The unbuilt gap (your opening):** every "feed" competitor is **text-news-only** (Particle, News Minimalist) or **single-medium** (Huxe = audio; video-summary tools = one-off utilities). **Nobody has fused multi-source — news + announcements + conferences + educational video + self-help — into one ranked, AI-summarized, TikTok-style card scroll with positive/useful affect.** The video-summarization tech is commoditized; the *feed wrapper around it* is the thing nobody has shipped well.

**The three rules the dead ones broke — your guardrails:**
1. **Do one opinionated thing.** Position = *"doomscrolling that makes you smarter / keeps you ahead,"* not "all the news." Artifact died of feature creep.
2. **Don't compete on summaries** (commoditized). Compete on **personalization + compounding personal value** (save → recall → "what did I learn this week"). That's the Readwise-style moat.
3. **Pick a viable money model:** freemium prosumer at the proven **$3–5/mo** consumer ceiling, and/or **native sponsored cards** (a feed places these far better than email). Avoid pure programmatic ads (killed SmartNews).

*Full competitor table + lessons in [research/01-competitive-landscape.md](research/01-competitive-landscape.md).*

---

## 3. Where the content actually comes from (the cheap, legal 80–90%)

**"RSS + a few free APIs" genuinely covers the large majority of your categories** — for ~$0:

| Your category | Source | Cost |
|---|---|---|
| **Company announcements** (Nvidia chip!) | Official newsroom RSS — `nvidianews.nvidia.com/rss`, OpenAI/Anthropic newsrooms, GitHub `releases.atom` per repo; Business Wire keyword RSS as safety net | Free |
| **News** | Curated site RSS + **GDELT** (free global firehose, no key) + **Google News RSS search** (`news.google.com/rss/search?q=…`) | Free |
| **Tech / startup** | **Hacker News API** (free, no key) + TechCrunch/Verge RSS + GitHub Trending RSS | Free |
| **Conferences / talks** | Conference **YouTube channel RSS** + **InfoQ** (500+ talks, many transcribed) + podcast RSS | Free |
| **Self-help / educational** | **Substack** (`name.substack.com/feed`), Medium, blogs, educational YouTube channels, podcasts | Free |
| **Transcripts** (for video/audio summaries) | YouTube captions / `youtube-transcript-api`; fallback `yt-dlp` → **Whisper** STT | ~free / cheap |

Backbone tools: **Miniflux or FreshRSS** (self-hosted feed engine, REST API) + **RSS-Bridge/RSSHub** (makes feeds for feedless sites) + **n8n** to orchestrate. ⚠️ One 2026 gotcha: the **Bing News API was retired Aug 2025** — don't design around it. Optional paid booster later: **NewsData.io** (has a commercially-usable free tier). *Full source list in [research/03-content-sources.md](research/03-content-sources.md).*

> Note: you already run **n8n** (it's wired into this environment) — that's exactly the right orchestration tool for the ingestion layer, so you're not starting from zero.

---

## 4. How to build it (the lean stack)

The pattern is well-trodden in 2026 — there are open-source apps you can **fork**, not build from scratch.

**Architecture (one diagram in words):**
```
Sources (RSS, GDELT, HN, YouTube-RSS, newsrooms)
   → n8n / cron pulls on schedule
   → extract full text + transcripts (Whisper for video/audio)
   → embed + DEDUPE/CLUSTER (pgvector, cosine ≥0.7 + UnionFind)
   → SUMMARIZE per-cluster with a cheap LLM (Batch API)
   → SCORE/RANK (recency + interest-vector + popularity)
   → Postgres (articles, clusters, users, embeddings)
   → Feed app (Expo = iOS+Android+web from one codebase, or Next.js PWA)
```

**Key calls:**
- **Datastore:** **Postgres + pgvector** does everything (content + vectors + search). One DB. Supabase = Postgres + auth + cron + functions in one.
- **AI cost is a rounding error.** Summaries on **Gemini 2.5 Flash-Lite (Batch)** ≈ **$0.0002/item → ~$2 per 10,000 items**. Summarize the *cluster*, not every article (~20× fewer calls). Optimize infra/your time, not tokens.
- **Dedupe:** embeddings + cosine ≥0.7 + UnionFind + temporal guards (the proven "$100/mo cross-lingual" approach).
- **Personalization without an ML team:** build a **user-interest vector** (average of embeddings of items they open/save) → score candidates by cosine similarity + a heuristic blend (freshness, popularity, "already seen"). Cold-start = onboarding topic-picker. Add an LLM re-ranker on the top-50 only if needed.
- **Frontend:** **Expo (React Native + web)** for one codebase across phone + web *with real push notifications* (the re-engagement loop). Or **Next.js PWA** if web-first.

**Fork these (ranked):**
1. **Meridian** — `github.com/iliane5/meridian` — closest blueprint (scrape → embed → cluster → LLM brief). 
2. **Horizon** — `github.com/Thysrael/Horizon` — leanest daily-digest (fetch → dedupe → 0–10 LLM score → summarize → deliver; runs on free GitHub Actions cron).
3. **auto-news** — `github.com/finaldie/auto-news` — great multi-source + YouTube-transcription + noise-filtering patterns.

*Full architecture, model pricing table, and repos in [research/04-architecture.md](research/04-architecture.md).*

---

## 5. Recommended build path

| Phase | What | Time | Cost |
|---|---|---|---|
| **0 — Validate** | Fork **Horizon** or **Meridian**, point it at ~30 RSS feeds across your categories (Nvidia/OpenAI newsrooms, HN, a few news sites, 5 conference/edu YouTube channels via RSS, 5 Substacks). Output a **daily digest** (static page or email). | ~1–3 days | ~$0–10/mo |
| **1 — MVP feed** | Add: Postgres+pgvector, dedupe, per-cluster summaries, a **scrollable card feed** (Next.js PWA), onboarding topic-picker, save/like. | ~1–2 weeks | <$30/mo |
| **2 — Sticky product** | Interest-vector personalization, push notifications (move to **Expo**), "what I learned this week" recall, audio mode, sponsored cards. | weeks | scales cheaply |
| **3 — Risky add-ons** | *Only if validated:* Threads (official, free) → then maybe TikTok/IG via scrapers **with legal review**. | later | scraper $$ + legal |

---

## 6. Risks & how to dodge them

- **Legal/ToS (biggest):** social scraping violates platform ToS and carries IP/copyright risk for re-display. → Build on RSS/official feeds; store **summaries, not full reproductions**; get counsel before any scraping; lean on "transformative summary + link out."
- **"It's just a feature" trap:** → don't be a generic summarizer; win on *positive-affect curation + personal-value compounding*.
- **Feature creep (the Artifact killer):** → one crisp value prop; resist becoming a social-posting playground.
- **Incumbents (Perplexity Discover, Yahoo digest):** → they're news-only add-ons; your multi-source + learning-feedback angle is what they structurally won't do.
- **Source fragility:** Google News RSS / YouTube RSS are unofficial-but-stable → add retries/fallbacks.

---

## 7. Open decisions (what I need from you to go deeper)

1. **Platform vs. content:** Are you OK *dropping* TikTok/IG/FB for v1 and leaning into news/announcements/conferences/educational-YouTube? (Strongly recommended.)
2. **Form factor:** phone-first (Expo native) or web-first (Next.js PWA)?
3. **Personal tool vs. product:** Is this *for you* (then ToS/scale barely matter — you can do almost anything for personal use) or a *public product* (then everything in §1 + §6 binds)?
4. **Build vs. fork:** want me to spin up a Phase-0 prototype by forking Horizon/Meridian against a starter feed list, or design a custom architecture doc first?

Answer those and I can go straight to a concrete build plan or a working prototype.
