# AI-Curated "Productive Feed" — Technical Architecture (2026)

> Raw research thread 4 of 4. Sources cited inline.

## Executive Summary

A productive-feed product (multi-source ingest → dedupe → summarize → rank → scrollable cards) is a **well-trodden path** with open-source reference implementations to fork. Dominant 2026 pattern that ships fastest: **Postgres + pgvector as the single datastore**, a **cheap small LLM** (Gemini 2.5 Flash-Lite, GPT-mini class, or Claude Haiku 4.5) via **Batch API (−50%)** for summarization, **embedding clustering** (cosine ≥0.7 + UnionFind, or HDBSCAN) for dedupe, **heuristic + embedding-similarity scoring** for personalization (skip the ML system), and **Expo (RN + web)** or a **PWA** for one-codebase delivery. AI summarization is ~free at this scale (**$0.0001–0.001/item**) — cost lives in infra + your time. Reference blueprint: **Meridian** (`github.com/iliane5/meridian`). A dev runs cross-lingual news dedup for **~$100/mo** with pgvector + UnionFind (HN thread 47245815).

## 1. Ingestion & orchestration
- **Custom workers** (Node/Python cron) = most control, for v2 core IP.
- **Self-hosted n8n** = fastest to wire 20+ sources (400+ integrations, RSS/YouTube/HTTP/LLM nodes); awkward for heavy per-item LLM loops at scale; runs on $5–10 VPS (real ops maybe $200–500/mo at scale via Queue Mode + Redis).
- **Serverless (cron+queue)** = cheapest at low volume, scales to zero.
- What similar projects use: **Meridian** → Cloudflare Workers/Workflows/Pages (2000+ articles/day → 100+ clusters); **auto-news** → Airflow; **Horizon** → GitHub Actions cron (free).
- **Recommendation:** MVP = Supabase pg_cron + Edge Functions **or** self-hosted n8n. v2 = custom workers behind a queue (BullMQ/Redis, Cloudflare Queues, SQS), n8n for long-tail sources. Use YouTube per-channel RSS for new-video discovery (no quota); respect ETag/Last-Modified.

## 2. AI summarization at scale — *nearly free*
Article ≈ 1.5–4k input tokens; card summary ≈ 100–250 output.

| Model | Input $/1M | Output $/1M | Batch (−50%) |
|---|---|---|---|
| **Gemini 2.5 Flash-Lite** | $0.10 | $0.40 | $0.05 / $0.20 |
| Gemini 2.5 Flash | $0.30 | $2.50 | $0.15 / $1.25 |
| **Claude Haiku 4.5** | $1.00 | $5.00 | $0.50 / $2.50 |
| GPT-4o/4.1-mini class | ~$0.40 | ~$1.60 | −50% batch |

**Cost per item:** 3,000 in + 200 out on Flash-Lite Batch ≈ **$0.0002/item → ~$2 / 10,000 items**. Haiku batch ≈ $0.002/item → ~$20/10k.
**Cost-cutting (priority order):** (1) Batch API −50%; (2) prompt caching −90% on input; (3) **summarize the cluster, not every article** (~20× fewer calls); (4) truncate to first ~1,500 tokens; (5) tiered models (Flash-Lite bulk, Haiku for top-ranked).
**YouTube→summary:** `youtube-transcript-api` for captions → fallback `yt-dlp` + **faster-whisper** → (chunk if needed) → summarize. Keep timestamped chunks for later "jump to moment"/RAG. n8n template exists.

## 3. Deduplication & clustering
- **Tier A (recommended start):** embeddings + **cosine ≥0.7** + **UnionFind**; temporal guards (merge only if ≤18h apart; stop after 36h). Prefer missing a merge over a false merge. Embeddings: `text-embedding-3-small`, open `multilingual-e5-small`, or Qwen3 (cross-lingual). This is the $100/mo approach.
- **Tier B (Meridian):** embed → **UMAP** → **HDBSCAN** (no K, handles noise). Better quality, more moving parts.
- **Storage:** **pgvector + HNSW** matches dedicated vector DBs at ≤1–5M vectors; keep a rolling 7–30 day window so counts stay small. MVP shortcut: title/URL hashing + TF-IDF on titles first, embeddings only on survivors.

## 4. Personalization / ranking (no ML team)
1. **Start recency-based** (ship first; minimal eng, no feedback-loop bias).
2. **Embedding interest-matching (sweet spot):** user-interest vector = recency-weighted avg of embeddings of opened/saved items → score candidates by cosine similarity (single pgvector query; no cold-start for new items since they have text embeddings on ingest).
3. **Heuristic blend:** `score = w1·interest_sim + w2·freshness + w3·source_quality + w4·cluster_size − w5·already_seen`; hand-tune weights.
4. **LLM reranker (optional):** reorder top ~50 only.
**Cold-start:** new user → onboarding topic-picker → seed interest vector from topic-label embeddings + popularity fallback. New item → fine (content-based). LightFM later if you want collaborative signal.

## 5. Storage & search
- **Postgres + pgvector** does everything (content, clusters, users, embeddings); ~75% cheaper than Pinecone, fine to 5–10M vectors. Supabase = Postgres + auth + cron + functions.
- **Full-text:** MVP = native `tsvector` + GIN. v2 = **BM25 via ParadeDB `pg_search`** / `pg_textsearch`; **hybrid (BM25 + vector)** is the gold standard. (Note: `pg_search` unavailable for new Neon projects since Mar 2026.)
- **Leave Postgres** only past ~5–50M vectors → **Qdrant self-hosted** (best price/perf + filtering; ~$120–180/mo for 10M vs ~$700–900 Pinecone).

## 6. Frontend / delivery
- **PWA (Next.js/Vite + service worker):** native web, instant deploy, no store; **iOS push still limited**. Best web-first.
- **Expo (React Native + RN-Web):** real native iOS/Android (proper push) + web from **one codebase**; "cuts time-to-market 40–50%." A scrollable card feed is the ideal RN use case (`FlashList` virtualized infinite scroll).
- **Recommendation:** **Expo** for fastest usable product on both phone + web with working push (the re-engagement loop). Next.js PWA if web is clearly primary. Keep feed = virtualized cards with optimistic save/like feeding personalization.

## 7. Open-source to fork (ranked)
1. **Meridian** — `github.com/iliane5/meridian` — closest blueprint: scrape → embed → UMAP+HDBSCAN → Gemini → daily briefs. Cloudflare + Postgres/Drizzle + e5-small + Nuxt/Vue/Tailwind.
2. **auto-news** — `github.com/finaldie/auto-news` (~880★) — multi-source incl. YouTube transcription + Tweets + Reddit, LangChain (OpenAI/Gemini/Ollama), Airflow, filters 80%+ noise, Notion UI.
3. **Horizon** — `github.com/Thysrael/Horizon` — lean daily-digest: fetch → dedupe → 0–10 LLM score → summarize → deliver; runs on free GitHub Actions cron; pluggable LLMs.
4. **Precis** — `github.com/leozqin/precis` — self-hosted AI RSS reader (summaries + notifications).
5. **news-aggregator** — `github.com/tony-stark-eth/news-aggregator` — Symfony+Postgres, OpenRouter free models + rule-based fallback, FTS.
6. **awesome-ai-news** — `github.com/taielab/awesome-ai-news` — curated list.

## 8. MVP shortcut (days, daily-digest first)
- **Option A — fork & ship (~1–3 days):** fork **Horizon**/**Meridian**, point at your RSS/YouTube sources, plug an LLM key, schedule via GitHub Actions cron, output static page + email.
- **Option B — build lean (~3–7 days):** Supabase pg_cron+Edge Functions *or* n8n on $5 VPS → summarize via OpenRouter or Gemini Flash-Lite Batch (~$2/10k) → dedupe (e5-small + pgvector cosine ≥0.7 + UnionFind) → Supabase Postgres+pgvector → recency+topic-pref ranking → Next.js PWA on Vercel (or email/Notion day one).
- **MVP cost:** ~$5–25/mo infra + a few $ tokens = **under $30/mo**.

## Recommended stacks
**Lean MVP:** Supabase pg_cron / n8n / GH-Actions cron · Gemini Flash-Lite Batch or OpenRouter · `text-embedding-3-small`/e5-small · pgvector cosine 0.7 + UnionFind · Supabase Postgres + tsvector · recency + interest vector · Next.js PWA · youtube-transcript-api → yt-dlp + faster-whisper.
**Scalable v2:** custom workers + queue (n8n for long tail) · tiered LLMs + Batch + caching + per-cluster summaries · Qwen3/Gemini embeddings · UMAP+HDBSCAN · Postgres+pgvector (rolling) → Qdrant past 5–10M · BM25/hybrid search · interest-matching + heuristic + optional LLM rerank · **Expo** native+web.

## Caveats
- Pricing moves fast (verified June 2026 from Anthropic/Google docs) — but summarization cost is rounding-error at feed scale; optimize infra/dev-time.
- Dedupe threshold = quality/recall tradeoff; 0.7 + temporal guards is a proven start; bias toward missing merges.
- Content licensing/ToS: store **summaries, not full reproductions**; prefer official RSS/APIs.
- iOS PWA push still limited → favor Expo if re-engagement notifications matter.

## Primary sources
- HN cross-lingual dedup $100/mo: https://news.ycombinator.com/item?id=47245815
- Meridian: https://github.com/iliane5/meridian · auto-news: https://github.com/finaldie/auto-news · Horizon: https://github.com/Thysrael/Horizon
- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing · Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- pgvector vs Pinecone vs Qdrant: https://vecstore.app/blog/vector-database-performance-compared
- "7 best ways to build a For You feed": https://www.shaped.ai/blog/the-7-best-ways-to-build-a-for-you-feed-in-2025
- ParadeDB BM25: https://www.paradedb.com/blog/introducing-search
- Expo vs PWA: https://www.appik-studio.ch/en/blog/pwa-vs-native-app-expo-best-choice/
- YouTube summarization: https://www.cantoni.org/2025/01/21/summarizing-youtube-videos-with-llms/
- Supabase Cron: https://supabase.com/blog/supabase-cron
