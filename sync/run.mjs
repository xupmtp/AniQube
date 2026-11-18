// 每日同步：YouTube 片源頻道 → 過濾 → 對應 AniList → public/data。
// 用法：YOUTUBE_API_KEY=金鑰 npm run sync     （金鑰只從環境變數讀，不寫進任何檔案）
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { buildIndex, buildSeasons, buildStandalones, cleanTitle, dropCovered, match, toTrad } from './lib.mjs';
import { BLOCKED_GENRES, GENRES, TAGS } from './taxonomy.mjs';

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY && !process.env.USE_RAW_CACHE) { console.error('缺少環境變數 YOUTUBE_API_KEY'); process.exit(1); }

const cfg = JSON.parse(readFileSync('sources.json', 'utf8'));
const manual = existsSync('manual-matches.json') ? JSON.parse(readFileSync('manual-matches.json', 'utf8')) : {};
const OUT = 'public/data';
const QUOTA = 9000; // 每日額度 10,000，留一點餘裕
let units = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function yt(path, params) {
  if (++units > QUOTA) throw new Error(`額度用盡（>${QUOTA} 單位），中止且不更新片庫`);
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, val] of Object.entries({ ...params, key: KEY })) u.searchParams.set(k, val);
  for (let i = 0; ; i++) {
    const r = await fetch(u);
    if (r.ok) return r.json();
    if (r.status === 404) return null;
    if (i < 3 && r.status >= 500) { await sleep(1000 * (i + 1)); continue; }
    const j = await r.json().catch(() => ({}));
    throw new Error(`YouTube ${path} ${r.status}: ${j.error?.message ?? ''}`);
  }
}
async function pages(path, params) {
  const out = [];
  let t;
  do {
    const j = await yt(path, { ...params, maxResults: 50, ...(t && { pageToken: t }) });
    if (!j) return out;
    out.push(...j.items);
    t = j.nextPageToken;
  } while (t);
  return out;
}

const dur = (iso) => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso) ?? []; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); };
async function details(ids) {
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  for (let i = 0; i < chunks.length; i += 5) {
    await Promise.all(chunks.slice(i, i + 5).map(async (c) => {
      const j = await yt('videos', { part: 'snippet,status,contentDetails,statistics', id: c.join(',') });
      for (const x of j?.items ?? []) {
        const rr = x.contentDetails.regionRestriction;
        out.set(x.id, {
          id: x.id, title: x.snippet.title, at: x.snippet.publishedAt, live: x.snippet.liveBroadcastContent,
          sec: dur(x.contentDetails.duration), views: Number(x.statistics?.viewCount ?? 0),
          embeddable: x.status.embeddable, age: x.contentDetails.contentRating?.ytRating === 'ytAgeRestricted',
          twBlocked: !!rr && ((rr.blocked ?? []).includes('TW') || (rr.allowed && !rr.allowed.includes('TW'))),
        });
      }
    }));
  }
  return out;
}

// 只負責抓（花配額）。結果原樣存進快取，過濾與分季全在 buildChannel，改規則不必重抓。
async function fetchChannel(ch) {
  const idPart = ch.id.slice(2);
  // 會員限定：頻道自己的會員清單（UUMO）。YouTube 影片欄位看不出來，只能這樣扣。沒有會員清單會回 404。
  const members = (await pages('playlistItems', { part: 'contentDetails', playlistId: `UUMO${idPart}` })).map((i) => i.contentDetails.videoId);
  const uploadIds = (await pages('playlistItems', { part: 'contentDetails', playlistId: `UU${idPart}` })).map((i) => i.contentDetails.videoId);
  // 不套任何過濾規則：抓取量只取決於頻道內容，改規則不影響配額，也都能用快取重跑
  const lists = (await pages('playlists', { part: 'snippet,contentDetails', channelId: ch.id }))
    .map((p) => ({ id: p.id, title: p.snippet.title, n: p.contentDetails.itemCount }))
    .filter((p) => p.n > 0);
  for (const p of lists) p.videoIds = (await pages('playlistItems', { part: 'contentDetails', playlistId: p.id })).map((i) => i.contentDetails.videoId);
  const need = new Set([...uploadIds, ...lists.flatMap((p) => p.videoIds)].filter((id) => !members.includes(id)));
  const videos = [...(await details([...need])).values()];
  console.log(`${ch.name}: 上傳 ${uploadIds.length}、會員限定 ${members.length}、清單 ${lists.length}、影片細節 ${videos.length}（已用 ${units} 單位）`);
  return { members, uploadIds, lists, videos };
}

function buildChannel(ch, { members: m, uploadIds, lists, videos: v }) {
  const members = new Set(m), videos = new Map(v.map((x) => [x.id, x]));
  const seasons = dropCovered(buildSeasons(lists, videos, cfg, ch, members));
  const used = new Set(seasons.flatMap((s) => s.episodes.map((e) => e.id)));
  const uploads = uploadIds.map((id) => videos.get(id)).filter(Boolean);
  return [...seasons, ...buildStandalones(uploads, used, cfg, ch, members)].map((s) => ({ ...s, channel: ch }));
}

async function loadDataset() {
  const cache = 'sync/cache/aod.json';
  if (existsSync(cache) && Date.now() - statSync(cache).mtimeMs < 864e5) return JSON.parse(readFileSync(cache, 'utf8'));
  const r = await fetch('https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json.zst');
  if (!r.ok) throw new Error(`下載離線資料集失敗 ${r.status}`);
  const data = JSON.parse(zstdDecompressSync(Buffer.from(await r.arrayBuffer())).toString('utf8')).data;
  mkdirSync('sync/cache', { recursive: true });
  writeFileSync(cache, JSON.stringify(data));
  return data;
}

const ANILIST = `query($ids:[Int],$page:Int){Page(page:$page,perPage:50){media(id_in:$ids,type:ANIME){
  id countryOfOrigin format status episodes season seasonYear averageScore popularity trending genres
  description(asHtml:false) bannerImage coverImage{large} tags{name rank isMediaSpoiler}}}}`;
async function anilist(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const r = await fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ANILIST, variables: { ids: ids.slice(i, i + 50), page: 1 } }),
    });
    if (!r.ok) throw new Error(`AniList ${r.status}`);
    for (const m of (await r.json()).data.Page.media) out.set(m.id, m);
    await sleep(800); // 上限每分鐘 90 次
  }
  return out;
}

const plain = (s) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const t0 = Date.now();
const index = buildIndex(await loadDataset());
// USE_RAW_CACHE=1（npm run rebuild）：重用上次抓下來的 YouTube 資料，不花配額、不需金鑰。改任何規則都用這個
const rawCache = 'sync/cache/raw.json';
let fetched;
if (process.env.USE_RAW_CACHE) {
  if (!existsSync(rawCache)) throw new Error('還沒有原始資料快取，請先帶金鑰完整跑一次 npm run sync');
  fetched = JSON.parse(readFileSync(rawCache, 'utf8'));
}
else {
  fetched = {};
  for (const ch of cfg.channels) fetched[ch.key] = await fetchChannel(ch);
  mkdirSync('sync/cache', { recursive: true });
  writeFileSync(rawCache, JSON.stringify(fetched));
}
const raw = cfg.channels.flatMap((ch) => {
  if (!fetched[ch.key]) throw new Error(`快取裡沒有頻道 ${ch.name}，請不加 USE_RAW_CACHE 完整跑一次`);
  return buildChannel(ch, fetched[ch.key]);
});

// 對應：人工對應表優先（null = 刻意不對應），其次自動
for (const s of raw) {
  const k = s.playlistId;
  if (k in manual) s.link = manual[k] == null ? null : { anilistId: manual[k], how: 'manual' };
  else s.link = match(s.rawTitle, index);
}
const meta = await anilist([...new Set(raw.map((s) => s.link?.anilistId).filter(Boolean))]);

const seasons = [];
const report = { unmatched: [], guessed: [], dropped: [] };
for (const s of raw) {
  const a = s.link ? meta.get(s.link.anilistId) : null;
  if (a?.genres.some((g) => BLOCKED_GENRES.includes(g))) { report.dropped.push({ id: s.playlistId, title: s.rawTitle, why: 'adult' }); continue; }
  const name = cleanTitle(s.rawTitle);
  const title = s.channel.origin === 'CN' ? toTrad(name) : name;
  const tags = (a?.tags ?? []).filter((t) => !t.isMediaSpoiler && t.rank >= 60 && TAGS[t.name]).map((t) => TAGS[t.name]);
  const entry = s.link?.entry;
  seasons.push({
    id: s.playlistId, title, channel: s.channel.key, origin: a?.countryOfOrigin ?? s.channel.origin,
    alt: [...new Set([entry?.title, ...(entry?.synonyms ?? []).slice(0, 8)].filter(Boolean))],
    genres: (a?.genres ?? []).filter((g) => GENRES[g]).map((g) => GENRES[g]), tags,
    year: a?.seasonYear ?? entry?.animeSeason?.year ?? null, season: a?.season ?? entry?.animeSeason?.season ?? null,
    status: a?.status ?? entry?.status ?? null, format: s.single ? 'SINGLE' : (a?.format ?? entry?.type ?? null),
    score: a?.averageScore ?? null, popularity: a?.popularity ?? 0, trending: a?.trending ?? 0,
    eps: s.episodes.length, totalEps: a?.episodes ?? entry?.episodes ?? null,
    views: s.episodes.reduce((n, e) => n + e.views, 0), updated: s.episodes.reduce((m, e) => (e.at > m ? e.at : m), ''),
    thumb: s.episodes[0].id, cover: a?.coverImage?.large ?? null, banner: a?.bannerImage ?? null,
    anilistId: s.link?.anilistId ?? null, how: s.link?.how ?? null,
    _desc: plain(a?.description).slice(0, 300), _eps: s.episodes,
  });
  if (!s.link) report.unmatched.push({ id: s.playlistId, title: s.rawTitle, eps: s.episodes.length });
  else if (['first', 'season', 'split'].includes(s.link.how)) report.guessed.push({ id: s.playlistId, title: s.rawTitle, anilistId: s.link.anilistId, how: s.link.how });
}

// 保護：片庫一次縮水超過三成視為異常，不覆蓋
const prev = existsSync(`${OUT}/index.json`) ? JSON.parse(readFileSync(`${OUT}/index.json`, 'utf8')).seasons.length : 0;
if (prev && seasons.length < prev * 0.7) throw new Error(`片庫從 ${prev} 季縮到 ${seasons.length} 季，疑似異常，中止且不更新`);

rmSync(`${OUT}/seasons`, { recursive: true, force: true });
mkdirSync(`${OUT}/seasons`, { recursive: true });
for (const s of seasons) {
  writeFileSync(`${OUT}/seasons/${s.id}.json`, JSON.stringify({ id: s.id, desc: s._desc, episodes: s._eps.map(({ id, n, title, sec, ext }) => ({ id, n, title, sec, ext })) }));
  delete s._desc; delete s._eps;
}
const generatedAt = new Date().toISOString();
writeFileSync(`${OUT}/index.json`, JSON.stringify({ generatedAt, channels: cfg.channels.map(({ key, name }) => ({ key, name })), seasons }));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ generatedAt, units, ...report, counts: { seasons: seasons.length, unmatched: report.unmatched.length, guessed: report.guessed.length } }, null, 1));
console.log(`完成：${seasons.length} 季，未對應 ${report.unmatched.length}，需覆核 ${report.guessed.length}，用 ${units} 單位，${Math.round((Date.now() - t0) / 1000)} 秒`);
