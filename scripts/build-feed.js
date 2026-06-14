'use strict';
/*
 * Loupe — daily feed builder.
 * Pulls free sources (RSS / Atom / Hacker News / arXiv / GDELT), dedupes, ranks,
 * optionally writes a rich multi-lens digest with the free-tier Gemini API,
 * and emits loupe-site/feed.json in the exact shape the page already renders.
 *
 * Zero npm dependencies — uses Node's built-in global fetch (Node 18+).
 * Runs with no key (snippet fallback) or with GEMINI_API_KEY set (rich cards).
 */
const fs = require('fs');
const path = require('path');

const OUT          = path.join(__dirname, '..', 'loupe-site', 'feed.json');
const GEMINI_KEY   = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []).concat(['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-1.5-flash']);
let CHOSEN_MODEL = null;
let FIRST_LLM_ERROR = null;
const MAX_ITEMS    = parseInt(process.env.MAX_ITEMS || '20', 10); // cards surfaced
const MAX_LLM      = parseInt(process.env.MAX_LLM   || '18', 10); // how many get an LLM digest
const UA           = 'Mozilla/5.0 (compatible; LoupeBot/1.0; +https://github.com/loupe)';

/* ------------------------------ sources ------------------------------ */
const FEEDS = [
  { url: 'https://techcrunch.com/feed/',                                              src: 'news' },
  { url: 'https://www.theverge.com/rss/index.xml',                                    src: 'news' },
  { url: 'https://feeds.arstechnica.com/arstechnica/index',                           src: 'news' },
  { url: 'https://blogs.nvidia.com/feed/',                                            src: 'news' },
  { url: 'https://www.lennysnewsletter.com/feed',                                     src: 'substack' },
  { url: 'https://feed.infoq.com/',                                                   src: 'conference' },
  { url: 'https://changelog.com/podcast/feed',                                        src: 'podcast' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA', src: 'youtube' }, // Fireship
];

/* ------------------------------ helpers ------------------------------ */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warn  = (where, e) => console.warn('  ! source failed:', where, '—', e.message);

async function getText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}
async function getJson(url) {
  return JSON.parse(await getText(url));
}

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------ feed parsing (RSS + Atom) ------------------------------ */
function blocksOf(xml, name) {
  const re = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[0]);
  return out;
}
function tag(block, name) {
  const m = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return m ? m[1] : '';
}
function titleOf(block) {
  return decode(tag(block, 'title')).slice(0, 200);
}
function linkOf(block) {
  let m = block.match(/<link>\s*([^<]+?)\s*<\/link>/i);
  if (m && /^https?:/i.test(m[1])) return m[1].trim();
  m = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (m) return m[1];
  m = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  if (m) return m[1];
  m = block.match(/<guid[^>]*>\s*([^<]+?)\s*<\/guid>/i);
  if (m && /^https?:/i.test(m[1])) return m[1].trim();
  return '';
}
function dateOf(block) {
  for (const t of ['pubDate', 'published', 'updated', 'dc:date']) {
    const v = tag(block, t);
    if (v) {
      const d = new Date(decode(v));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}
function descOf(block) {
  for (const t of ['description', 'summary', 'content:encoded', 'content', 'media:description']) {
    const v = tag(block, t);
    if (v) return decode(v).slice(0, 600);
  }
  return '';
}
function parseFeed(xml, src) {
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  return blocksOf(xml, isAtom ? 'entry' : 'item')
    .map((b) => ({ title: titleOf(b), link: linkOf(b), src, date: dateOf(b), summary: descOf(b), points: 0 }))
    .filter((x) => x.title && x.link);
}

/* ------------------------------ special sources ------------------------------ */
async function fetchHN() {
  const d = await getJson('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30');
  return (d.hits || [])
    .filter((h) => h.title)
    .map((h) => ({
      title: h.title,
      link: h.url || 'https://news.ycombinator.com/item?id=' + h.objectID,
      src: 'hn',
      date: h.created_at ? new Date(h.created_at) : null,
      summary: '',
      points: h.points || 0,
    }));
}
async function fetchArxiv() {
  const url =
    'https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=20';
  const xml = await getText(url);
  return blocksOf(xml, 'entry')
    .map((b) => ({ title: titleOf(b), link: linkOf(b), src: 'paper', date: dateOf(b), summary: descOf(b), points: 0 }))
    .filter((x) => x.title && x.link);
}
function parseGdeltDate(s) {
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}
async function fetchGDELT() {
  const q = encodeURIComponent('(artificial intelligence OR semiconductor OR procurement OR construction technology) sourcelang:english');
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + q + '&mode=ArtList&maxrecords=25&format=json&sort=DateDesc';
  const d = await getJson(url);
  return (d.articles || [])
    .map((a) => ({ title: a.title, link: a.url, src: 'news', date: a.seendate ? parseGdeltDate(a.seendate) : null, summary: '', points: 0 }))
    .filter((x) => x.title && x.link);
}

async function gather() {
  const tasks = FEEDS.map((f) => getText(f.url).then((xml) => parseFeed(xml, f.src)).catch((e) => (warn(f.url, e), [])));
  tasks.push(fetchHN().catch((e) => (warn('Hacker News', e), [])));
  tasks.push(fetchArxiv().catch((e) => (warn('arXiv', e), [])));
  tasks.push(fetchGDELT().catch((e) => (warn('GDELT', e), [])));
  return (await Promise.all(tasks)).flat();
}

/* ------------------------------ dedupe + recency ------------------------------ */
const now = Date.now();
const ageHours = (it) => (it.date ? (now - it.date.getTime()) / 3600000 : 72);
const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function dedupe(items) {
  const seenT = new Set(), seenL = new Set(), out = [];
  for (const it of items) {
    const kt = normTitle(it.title).slice(0, 80);
    let kl;
    try { const u = new URL(it.link); kl = u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, ''); }
    catch { kl = it.link; }
    if (!kt || seenT.has(kt) || seenL.has(kl)) continue;
    seenT.add(kt); seenL.add(kl);
    out.push(it);
  }
  return out;
}

/* ------------------------------ topics + scoring ------------------------------ */
const TOPIC_KW = {
  ai: ['\\bai\\b', 'artificial intelligence', 'machine learning', '\\bllm', 'gpt', 'neural', 'openai', 'anthropic', 'gemini', 'inference', 'transformer'],
  hardware: ['gpu', 'chip', 'silicon', 'semiconductor', 'nvidia', 'processor', 'hardware', 'data ?center'],
  tech: ['software', 'platform', 'technology', 'cloud', '\\bapi\\b', 'startup'],
  dev: ['developer', 'programming', '\\bcode', 'coding', 'open.?source', 'github', 'typescript', 'python', 'rust', 'compiler', 'database'],
  tools: ['\\btool', 'library', '\\bsdk\\b', 'plugin', 'framework'],
  frameworks: ['framework', 'mental model', 'first principles', 'principle'],
  thinking: ['thinking', 'reasoning', 'decision', 'cognition', 'mindset'],
  strategy: ['strategy', 'strategic', 'positioning', 'moat', 'competitive'],
  business: ['business', 'revenue', 'profit', 'margin', 'enterprise', 'b2b', 'saas'],
  growth: ['growth', 'scale', 'scaling', 'acquisition', 'retention'],
  execution: ['execution', 'ship', 'shipping', 'operate'],
  sales: ['sales', 'selling', 'pricing', 'outbound', 'pipeline', '\\bdeal'],
  marketing: ['marketing', 'brand', 'audience', '\\bseo\\b', 'campaign'],
  leadership: ['leadership', 'manager', 'management', 'culture', 'hiring'],
  market: ['market', 'industry', 'economy', 'inflation', 'funding', 'raise', 'valuation', '\\bvc\\b'],
  procurement: ['procurement', 'tender', '\\brfp\\b', '\\brfq\\b', 'public works'],
  construction: ['construction', 'building', 'facade', 'infrastructure', 'civil engineering'],
  germany: ['germany', 'german', 'european union', '\\beu\\b', 'berlin', 'europe'],
  regulation: ['regulation', 'compliance', 'policy', 'gdpr', 'antitrust', 'lawsuit'],
  ops: ['operations', 'workflow', 'async', 'remote work', 'process'],
  design: ['design', '\\bux\\b', '\\bui\\b', 'interface', 'typography'],
  creativity: ['creativity', 'creative', '\\bart\\b'],
  story: ['story', 'narrative', 'storytelling', 'hook'],
  'self-help': ['self.?help', 'habit', 'discipline', 'motivation', 'wellbeing'],
  productivity: ['productivity', 'focus', 'deep work', 'time management'],
  architecture: ['architecture', 'system design', 'parametric'],
  innovation: ['innovation', 'breakthrough', 'novel', 'research'],
  automation: ['automation', '\\bagent', 'zapier', 'n8n'],
};
const ALLOWED = Object.keys(TOPIC_KW);
const SRC_TOPICS = {
  paper: [['ai', 1], ['dev', 0.7], ['frameworks', 0.5]],
  hn: [['dev', 1], ['tools', 0.8], ['tech', 0.7]],
  youtube: [['ai', 1], ['dev', 0.7], ['tools', 0.6]],
  conference: [['business', 1], ['execution', 0.7], ['strategy', 0.6]],
  podcast: [['leadership', 1], ['ops', 0.7], ['business', 0.6]],
  substack: [['frameworks', 1], ['thinking', 0.8], ['strategy', 0.7]],
  news: [['market', 1], ['business', 0.7], ['tech', 0.6]],
};
function topicsFor(it) {
  const text = (it.title + ' ' + it.summary).toLowerCase();
  const scores = [];
  for (const [topic, kws] of Object.entries(TOPIC_KW)) {
    let s = 0;
    for (const kw of kws) if (new RegExp(kw).test(text)) s++;
    if (s > 0) scores.push([topic, s]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  let entries = scores.slice(0, 5);
  if (!entries.length) entries = SRC_TOPICS[it.src] || [['tech', 1]];
  const obj = {};
  entries.forEach(([t], i) => (obj[t] = i === 0 ? 1 : +(0.9 - i * 0.12).toFixed(2)));
  return obj;
}

const SRC_PROD = { paper: 86, conference: 82, hn: 80, substack: 80, youtube: 78, podcast: 75, news: 70 };
const SRC_MINS = { paper: 9, conference: 20, hn: 6, substack: 7, youtube: 12, podcast: 18, news: 4 };
function isClickbait(t) {
  return /(you won'?t believe|shocking|this one (trick|weird)|will blow your mind|gone wrong|top \d+ (hacks|tricks)|secret to|\bsxsw clickbait\b|🤯|😱)/i.test(t);
}
function heuristicProd(it) {
  let p = SRC_PROD[it.src] ?? 70;
  if (isClickbait(it.title)) p -= 28;
  if ((it.summary || '').length > 300) p += 4;
  if (/\b(framework|study|research|how to|guide|analysis|breakdown|lessons|playbook|deep dive)\b/i.test(it.title + ' ' + it.summary)) p += 5;
  return clamp(Math.round(p), 35, 96);
}
function heuristicMarket(it) {
  let m = 50;
  const h = ageHours(it);
  m += h < 6 ? 20 : h < 12 ? 14 : h < 24 ? 8 : h < 48 ? 2 : -6;
  if (it.points) m += Math.min(28, Math.round(it.points / 12));
  if (it.src === 'news') m += 8;
  if (it.src === 'hn') m += 6;
  return clamp(Math.round(m), 20, 98);
}
function ageStr(it) {
  const h = ageHours(it);
  if (h < 1) return Math.max(1, Math.round(h * 60)) + 'm';
  if (h < 24) return Math.round(h) + 'h';
  return Math.round(h / 24) + 'd';
}
function idFor(it) {
  let h = 0;
  const s = it.link || it.title;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return it.src.slice(0, 2) + (h % 100000).toString(36);
}
function fallbackDigest(it) {
  const s = (it.summary || '').trim();
  if (s) return { new: s.slice(0, 400) };
  if (it.src === 'hn') return { new: 'On the Hacker News front page' + (it.points ? ' with ' + it.points + ' points' : '') + '. Open the source to read the discussion and decide if it earns your time.' };
  return { new: it.title };
}
function fallbackGist(it) {
  const s = (it.summary || '').trim();
  if (s) return s.split(/(?<=[.!?])\s/)[0].slice(0, 150);
  if (it.src === 'hn') return (it.points ? it.points + ' points' : 'Trending') + ' on Hacker News — tap the source for the discussion.';
  if (it.src === 'paper') return 'New paper on arXiv — open it for the abstract and findings.';
  return 'Tap “source” to read the original.';
}
function baseItem(it) {
  return {
    id: idFor(it),
    src: it.src,
    title: it.title.slice(0, 160),
    url: it.link,
    prod: heuristicProd(it),
    market: heuristicMarket(it),
    mins: SRC_MINS[it.src] ?? 5,
    age: ageStr(it),
    topics: topicsFor(it),
    gist: fallbackGist(it),
    digest: fallbackDigest(it),
    _clickbait: isClickbait(it.title),
    _summary: it.summary || '',
    _points: it.points || 0,
  };
}

/* ------------------------------ Gemini digest (optional) ------------------------------ */
const DIGEST_PROPS = { new: { type: 'STRING' }, affect: { type: 'STRING' }, profit: { type: 'STRING' }, shift: { type: 'STRING' }, move: { type: 'STRING' } };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    prod: { type: 'INTEGER' },
    market: { type: 'INTEGER' },
    mins: { type: 'INTEGER' },
    gist: { type: 'STRING' },
    digest: { type: 'OBJECT', properties: DIGEST_PROPS, required: ['new', 'affect', 'profit', 'shift', 'move'] },
    topics: { type: 'ARRAY', items: { type: 'OBJECT', properties: { topic: { type: 'STRING' }, weight: { type: 'NUMBER' } }, required: ['topic', 'weight'] } },
    kha: { type: 'OBJECT', properties: { gist: { type: 'STRING' }, digest: { type: 'OBJECT', properties: DIGEST_PROPS, required: ['new', 'affect', 'profit', 'shift', 'move'] } }, required: ['gist', 'digest'] },
  },
  required: ['prod', 'market', 'mins', 'gist', 'digest', 'topics'],
};
function prompt(item) {
  return [
    'You are the editorial engine for "Loupe", a productive-feed app for ambitious founders/operators.',
    'Given ONE source item, write a punchy, genuinely useful card. Be concrete and specific; no fluff, no hedging.',
    '',
    'Source type: ' + item.src,
    'Title: ' + item.title,
    'Summary: ' + (item._summary || '(none provided — infer from the title, do not invent facts)'),
    'URL: ' + item.url,
    '',
    'Return JSON only. Allowed topics: ' + ALLOWED.join(', ') + '.',
    '- prod: 0-100, how useful / high-signal this is for an ambitious operator (this is the quality gate).',
    '- market: 0-100, how hard the world is currently pushing this (momentum / popularity).',
    '- mins: estimated minutes to read or watch.',
    '- gist: ONE punchy sentence, max 140 chars.',
    '- digest.new: what is actually new (1-2 sentences).',
    '- digest.affect: how it hits the reader / why they should care.',
    '- digest.profit: the money or leverage angle.',
    '- digest.shift: the one-line mind-shift.',
    '- digest.move: a concrete action to take this week.',
    '- topics: 2-5 entries from the allowed list with weights 0-1 (strongest = 1).',
    '- kha: the same gist + digest but in a playful Gen-Z voice (keep the substance 100% real; add light slang and an emoji or two).',
  ].join('\n');
}
async function callGemini(model, text) {
  const body = { contents: [{ parts: [{ text }] }], generationConfig: { temperature: 0.6, responseMimeType: 'application/json' } };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + GEMINI_KEY;
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) { const e = new Error('HTTP ' + r.status + ': ' + t.slice(0, 180).replace(/\s+/g, ' ')); e.status = r.status; throw e; }
  const data = JSON.parse(t);
  const out = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || []).map((p) => p.text).join('');
  return JSON.parse(out);
}
async function chooseModel() {
  for (const m of GEMINI_MODELS) {
    try { await callGemini(m, 'Return exactly this JSON and nothing else: {"ok":true}'); console.log('  Gemini model OK:', m); return m; }
    catch (e) { if (!FIRST_LLM_ERROR) FIRST_LLM_ERROR = m + ' → ' + e.message; console.warn('  ! model failed:', m, '-', e.message); if (e.status === 400 && /api key not valid|invalid/i.test(e.message)) break; }
  }
  return null;
}
async function geminiDigest(item) { return callGemini(CHOSEN_MODEL, prompt(item)); }
function cleanDigest(d) {
  const out = {};
  for (const k of ['new', 'affect', 'profit', 'shift', 'move']) if (d && d[k]) out[k] = String(d[k]).trim();
  return out;
}
function applyLLM(item, r) {
  if (typeof r.prod === 'number') item.prod = clamp(Math.round(r.prod), 35, 99);
  if (typeof r.market === 'number') item.market = clamp(Math.round(r.market), 15, 99);
  if (typeof r.mins === 'number' && r.mins > 0) item.mins = Math.min(120, Math.round(r.mins));
  if (r.gist) item.gist = String(r.gist).slice(0, 180);
  const d = cleanDigest(r.digest);
  if (d.new) item.digest = d;
  if (Array.isArray(r.topics) && r.topics.length) {
    const obj = {};
    r.topics.filter((t) => t && t.topic).slice(0, 5).forEach((t) => {
      const key = String(t.topic).toLowerCase().trim();
      if (TOPIC_KW[key]) obj[key] = +clamp(+t.weight || 0.5, 0.1, 1).toFixed(2);
    });
    if (Object.keys(obj).length) item.topics = obj;
  }
  if (r.kha && r.kha.gist && r.kha.digest) {
    const kd = cleanDigest(r.kha.digest);
    if (kd.new) item.kha = { gist: String(r.kha.gist).slice(0, 200), digest: kd };
  }
}
async function withRetry(fn, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (e.status && e.status !== 429 && e.status < 500) break; await sleep(1500 * (i + 1)); }
  }
  throw last;
}
async function pool(items, n, worker) {
  let idx = 0;
  const runners = [];
  for (let k = 0; k < n; k++) runners.push((async () => { while (idx < items.length) { const i = idx++; await worker(items[i], i); } })());
  await Promise.all(runners);
}

/* ------------------------------ main ------------------------------ */
(async function main() {
  console.log('Loupe build-feed —', GEMINI_KEY ? 'LLM digests ON (' + GEMINI_MODEL + ')' : 'no key, snippet fallback');
  let raw = await gather();
  console.log('fetched', raw.length, 'raw items');
  raw = dedupe(raw.filter((x) => x.title && x.link)).filter((it) => ageHours(it) <= 96);
  console.log('after dedupe + recency:', raw.length);

  let items = raw.map(baseItem);

  // route obvious clickbait straight to the noise drawer
  const junk = [];
  items = items.filter((it) => {
    if (it._clickbait) { junk.push({ x: it.prod, t: it.title.slice(0, 90), r: 'Clickbait pattern · low decision value' }); return false; }
    return true;
  });

  items.sort((a, b) => b.prod * 0.5 + b.market * 0.5 - (a.prod * 0.5 + a.market * 0.5));
  const surfaced = items.slice(0, MAX_ITEMS);
  const belowCut = items.slice(MAX_ITEMS, MAX_ITEMS + 12);

  let llmOk = 0, llmFail = 0;
  if (GEMINI_KEY) {
    CHOSEN_MODEL = await chooseModel();
    if (CHOSEN_MODEL) {
      const toLLM = surfaced.slice(0, MAX_LLM);
      await pool(toLLM, 2, async (item) => {
        try { applyLLM(item, await withRetry(() => geminiDigest(item))); llmOk++; }
        catch (e) { llmFail++; if (!FIRST_LLM_ERROR) FIRST_LLM_ERROR = item.id + ' → ' + e.message; console.warn('  ! LLM fail', item.id, '-', e.message); }
      });
      console.log('LLM digested', llmOk, '/ failed', llmFail);
      surfaced.sort((a, b) => b.prod * 0.5 + b.market * 0.5 - (a.prod * 0.5 + a.market * 0.5));
    } else {
      console.warn('No working Gemini model — snippet fallback. First error:', FIRST_LLM_ERROR);
    }
  }

  const noise = [
    ...junk,
    ...belowCut.map((it) => ({ x: it.prod, t: it.title.slice(0, 90), r: 'Lower signal · ranked below today’s cut' })),
  ].slice(0, 16);

  const clean = surfaced.map(({ _summary, _points, _clickbait, ...rest }) => rest);
  const out = {
    generatedAt: new Date().toISOString(),
    source: llmOk > 0 ? 'live+llm' : 'live',
    counts: { fetched: raw.length, surfaced: clean.length, noise: noise.length },
    debug: GEMINI_KEY ? { keyPresent: true, model: CHOSEN_MODEL, llmOk, llmFail, firstError: FIRST_LLM_ERROR } : { keyPresent: false },
    items: clean,
    noise,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('wrote', path.relative(process.cwd(), OUT), '—', clean.length, 'items,', noise.length, 'noise');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
