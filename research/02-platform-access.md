# Data-Access Feasibility: Aggregating Social/Video Content (2026)

> Raw research thread 2 of 4. **This is the make-or-break constraint.** Sources cited inline.

## Executive Summary

Your core concept — pulling content from multiple platforms and re-presenting it as an aggregated feed — is **explicitly prohibited or effectively blocked by the official APIs of almost every major platform.** The blocker is rarely cost; it's Terms of Service + access gating. YouTube's Developer Policy bans aggregation across content owners. TikTok's only read API is restricted to non-profit academics. Instagram/Facebook only let you read accounts *you own*. LinkedIn is partner-gated. The only platform genuinely open to a commercial aggregator reading public posts is **Threads (free)**, with **YouTube** usable only within narrow per-channel limits.

A compliant version would be built largely on **third-party scrapers** (Apify, Bright Data, RapidAPI), which shifts risk from "API ToS violation" to "platform anti-scraping ToS + IP/copyright exposure," and cost from "free" to ~**$0.30–$2.50 per 1,000 items**. **There are zero unambiguously GREEN platforms** for a commercial multi-platform aggregator. Threads is the closest.

## Per-platform

### YouTube — Data API v3 — 🟡 single-channel / 🔴 aggregator
- Free API, 10,000 quota units/day (search.list = 100 units each → ~100 searches/day). No paid tier to buy more; increases require an audit form (weeks–months).
- **Captions trap:** `captions.download` generally only works for videos you *own*. The API does NOT give arbitrary public-video transcripts.
- **ToS killers:** aggregation banned except across channels under the same content owner (§III.E.2.a); public data storable only **30 days** (§III.E.4); must not replicate core UX without independent value (§III.I.1); monetization constrained (§III.G.1.d); mandatory attribution + official player.
- **Verdict:** fine for single-creator/owned tools; **not viable** as a multi-creator aggregator under the official API. *Legal way in: per-channel RSS (`youtube.com/feeds/videos.xml?channel_id=…`) for discovery, official embed for playback.*
- Policies: https://developers.google.com/youtube/terms/developer-policies · Quota: https://developers.google.com/youtube/v3/determine_quota_cost

### TikTok — 🔴
- **Research API** (only one returning public videos/comments/trends) is restricted to **non-profit academic institutions**; commercial users explicitly ineligible; proposal + ethics review + ~4-week approval.
- **Display API** = only the authenticated user's own content. **Content Posting API** = publishing only.
- **Verdict:** officially closed to commercial use. Any ingestion = third-party scrapers (violates TikTok user ToS).
- https://developers.tiktok.com/products/research-api/

### Instagram — 🔴
- **Basic Display API deprecated Dec 4, 2024** (endpoints error). **Graph API** requires Business/Creator account + only returns data for accounts you own/manage. Public access limited to narrow **Hashtag Search** (heavily rate-limited, your-own-campaign use cases).
- **Verdict:** no official route to aggregate public IG content. Scrapers only.
- https://developers.facebook.com/docs/instagram-platform/overview/

### Facebook — 🔴
- Public Page reading needs **Page Public Content Access** (App Review + Business Verification, granted sparingly). General aggregation unsanctioned. Content Library is researchers-only.
- https://developers.facebook.com/docs/features-reference/page-public-content-access

### X / Twitter — 🟡
- API v2 reads public posts. **Feb 6, 2026:** moved to **pay-per-use**, free tier discontinued. **Read ≈ $0.005/post, hard cap 2M reads/mo** (= $10k/mo at cap). Legacy Basic $200/Pro $5,000/Enterprise ~$42k+ only for existing subscribers.
- ToS permits displaying tweets with display requirements. **Verdict:** legal but read-cost + 2M cap make broad ingestion painful; OK for niche/low volume.
- https://postproxy.dev/blog/x-api-pricing-2026/

### Reddit — 🔴 commercial
- Reads public posts. Free tier = **100 q/min but non-commercial only**; since 2025 all apps need pre-approval. Commercial = sales-gated, reported ~**$12k/mo**-class. Your app is commercial → free tier violates ToS.
- https://octolens.com/blog/reddit-api-pricing

### LinkedIn — 🔴
- Partner-program-gated since 2015; consumer API only basic profile of the authenticated user. No reading arbitrary members' posts. No store/resell. ~$10k–$50k+/yr. Litigates scrapers. Most closed of all.
- https://www.linkedin.com/legal/l/api-terms-of-use

### Threads — 🟡→🟢 (best option)
- **Official API, free**, and uniquely **reads public content** — keyword/search of public posts, profile discovery, reply data; public posts embeddable without a token.
- Needs Meta **App Review** for production; rate limits formula-based; tokens 1h/60-day. Smaller content universe than TikTok/IG.
- **Verdict:** the clear best-case for an aggregator. Start here for native social.
- https://www.socialmediatoday.com/news/meta-updates-threads-api-with-more-third-party-app-integrations/817502/

## Third-party scrapers (the realistic path for RED platforms)

> **Legal caveat:** using these for TikTok/IG/FB still violates *those platforms'* anti-scraping ToS; scraping public data is legally unsettled (post-*hiQ v. LinkedIn* not automatically a CFAA crime, but breach-of-contract + copyright/DMCA risk remain). The provider handles mechanics; **you inherit ToS + IP risk for re-display.** Not legal advice — get counsel.

| Provider | Cost | Notes |
|---|---|---|
| **Apify** | IG ~$0.50–2.50/1k; TikTok ~$0.30–1.70/1k; $5 free credit | Huge actor library, variable quality |
| **Bright Data** | from ~$1/1k records | Highest reliability (~98%), covers IG/TikTok/X/FB/LinkedIn |
| **RapidAPI** | wrappers from ~$10/mo | Cheap for prototyping, fragile |
| **Phyllo** | from ~$199/mo | **Consent-based** (creators connect own accounts) → authenticated metrics, not arbitrary scraping |
| TikAPI/TikHub/Scrapfly | $29–189/mo / PAYG | Unofficial TikTok wrappers, fragile, ToS-violating |

Blended cost for a multi-platform aggregator: ~**$0.50–$2.50 / 1,000 items** + engineering for breakage/proxies/rate limits.

## Final tier list (COMMERCIAL multi-platform aggregator)
- **GREEN:** none unambiguously.
- **YELLOW:** **Threads** (free, official, public reads — closest to green; App Review gate) · **YouTube** (single-creator only; aggregation banned) · **X** (legal but pay-per-use + 2M cap).
- **RED:** TikTok, Instagram, Facebook, Reddit (commercial), LinkedIn.

## Strategic notes
1. Don't architect a multi-platform public-content aggregator around official APIs — most forbid it.
2. **Threads** is the one to build on natively first.
3. For **YouTube**, use a "creators opt in / whitelisted channels" model + RSS for discovery + official embed.
4. TikTok/IG/FB/Reddit/LinkedIn → only via scrapers = ToS violation + IP risk → legal counsel first; budget ~$0.50–2.50/1k.
5. **AI summarization helps the *copyright* argument (transformative use) but does NOT override API/anti-scraping ToS.** Access is the wall, not summarization.
6. Rules change fast (X flipped Feb 2026; Reddit/IG changed 2023–24) — re-verify before committing.

**Load-bearing source:** YouTube Developer Policies (§III.E.2.a aggregation ban, §III.E.4 30-day storage, §III.G.1.d monetization, §III.I.1 no-replicating-UX) — read in full before building on YouTube: https://developers.google.com/youtube/terms/developer-policies
