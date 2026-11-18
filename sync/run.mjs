// 每日同步：YouTube 片源頻道 → 過濾 → 對應 AniList → public/data。
// 用法：YOUTUBE_API_KEY=金鑰 npm run sync     （金鑰只從環境變數讀，不寫進任何檔案）
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { buildIndex, buildSeasons, buildStandalones, cleanTitle, dubLabel, groupWorks, match, toTrad } from './lib.mjs';
import { BLOCKED_GENRES, GENRES, TAGS } from './taxonomy.mjs';

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY && !process.env.USE_RAW_CACHE) { console.error('缺少環境變數 YOUTUBE_API_KEY'); process.exit(1); }

const cfg = JSON.parse(readFileSync('sources.json', 'utf8'));
const manual = existsSync('manual-matches.json') ? JSON.parse(readFileSync('manual-matches.json', 'utf8')) : {};
const manualWorks = existsSync('manual-works.json') ? JSON.parse(readFileSync('manual-works.json', 'utf8')) : {};
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
  const seasons = buildSeasons(lists, videos, cfg, ch, members);
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

const report = { unmatched: [], guessed: [], dropped: [] };
const ORIGINAL = { JP: '日語', CN: '國語', KR: '韓語' }; // 沒標配音的清單就是原聲
const genresOf = (a) => (a?.genres ?? []).filter((g) => GENRES[g]).map((g) => GENRES[g]);
const tagsOf = (a) => (a?.tags ?? []).filter((t) => !t.isMediaSpoiler && t.rank >= 60 && TAGS[t.name]).map((t) => TAGS[t.name]);
const items = [];
raw.forEach((s, order) => {
  const a = s.link ? meta.get(s.link.anilistId) : null;
  if (a?.genres.some((g) => BLOCKED_GENRES.includes(g))) { report.dropped.push({ id: s.playlistId, title: s.rawTitle, why: 'adult' }); return; }
  const name = cleanTitle(s.rawTitle);
  items.push({
    id: s.playlistId, name: s.channel.origin === 'CN' ? toTrad(name) : name, rawTitle: s.rawTitle, single: !!s.single, order,
    channel: s.channel, lang: dubLabel(s.rawTitle) ?? ORIGINAL[s.channel.origin], members: s.members ?? 0,
    episodes: s.episodes, a, entry: s.link?.entry, link: s.link,
  });
  if (!s.link) report.unmatched.push({ id: s.playlistId, title: s.rawTitle, eps: s.episodes.length });
  else if (['first', 'season', 'split'].includes(s.link.how)) report.guessed.push({ id: s.playlistId, title: s.rawTitle, anilistId: s.link.anilistId, how: s.link.how });
});

// 作品：卡片顯示最新一季的資料、年份用首季；篩選與搜尋用所有季的聯集（docs/adr/0003）
const works = [], workFiles = [];
for (const ch of cfg.channels) {
  for (const w of groupWorks(items.filter((it) => it.channel.key === ch.key), manualWorks)) {
    const orig = ORIGINAL[ch.origin];
    const pick = (season) => season.dubs.find((d) => d.lang === orig) ?? season.dubs[0];
    const main = w.seasons.filter((x) => x.kind !== 'special');
    const first = pick(main[0] ?? w.seasons[0]), latest = pick(main.at(-1) ?? w.seasons.at(-1));
    const all = w.seasons.flatMap((x) => x.dubs), a = latest.a, e = latest.entry;
    const allEps = all.flatMap((d) => d.episodes);
    const id = createHash('sha1').update(`${ch.key}|${w.key}`).digest('hex').slice(0, 10);
    works.push({
      id, title: w.base, channel: ch.key, origin: a?.countryOfOrigin ?? ch.origin,
      alt: [...new Set(all.flatMap((d) => [d.name, d.entry?.title, ...(d.entry?.synonyms ?? []).slice(0, 8)]))].filter((x) => x && x !== w.base),
      genres: genresOf(a), tags: tagsOf(a), facets: [...new Set(all.flatMap((d) => [...genresOf(d.a), ...tagsOf(d.a)]))],
      year: first.a?.seasonYear ?? first.entry?.animeSeason?.year ?? null, season: first.a?.season ?? first.entry?.animeSeason?.season ?? null,
      status: a?.status ?? e?.status ?? null,
      format: main.length ? (a?.format ?? e?.type ?? 'TV') : (a?.format ?? 'SINGLE'),
      score: a?.averageScore ?? null, popularity: Math.max(0, ...all.map((d) => d.a?.popularity ?? 0)), trending: Math.max(0, ...all.map((d) => d.a?.trending ?? 0)),
      seasons: main.length, eps: w.seasons.reduce((n, x) => n + pick(x).episodes.length, 0),
      totalEps: main.length === 1 ? (a?.episodes ?? e?.episodes ?? null) : null,
      views: allEps.reduce((n, x) => n + x.views, 0), updated: allEps.reduce((m, x) => (x.at > m ? x.at : m), ''),
      thumb: latest.episodes[0].id, cover: a?.coverImage?.large ?? null, banner: a?.bannerImage ?? null,
      anilistId: latest.link?.anilistId ?? null, how: latest.link?.how ?? null,
    });
    const desc = [...all].reverse().map((d) => plain(d.a?.description)).find(Boolean) ?? '';
    workFiles.push({
      id, desc: desc.slice(0, 300), members: main.map(pick).find((d) => d.members > 0)?.id ?? null,
      seasons: w.seasons.map((x) => ({
        name: x.name, kind: x.kind,
        dubs: [...x.dubs].sort((p, q) => (q.lang === orig) - (p.lang === orig)).map((d) => ({
          lang: d.lang, list: d.single ? null : d.id, episodes: d.episodes.map(({ id: v, n, title, sec, ext }) => ({ id: v, n, title, sec, ext })),
        })),
      })),
    });
  }
}

// 保護：片庫一次縮水超過三成視為異常，不覆蓋（舊格式沒有 works，視為第一次）
const prev = existsSync(`${OUT}/index.json`) ? JSON.parse(readFileSync(`${OUT}/index.json`, 'utf8')).works?.length ?? 0 : 0;
if (prev && works.length < prev * 0.7) throw new Error(`片庫從 ${prev} 部縮到 ${works.length} 部，疑似異常，中止且不更新`);

rmSync(`${OUT}/seasons`, { recursive: true, force: true });
rmSync(`${OUT}/works`, { recursive: true, force: true });
mkdirSync(`${OUT}/works`, { recursive: true });
for (const d of workFiles) writeFileSync(`${OUT}/works/${d.id}.json`, JSON.stringify(d));
const generatedAt = new Date().toISOString();
writeFileSync(`${OUT}/index.json`, JSON.stringify({ generatedAt, channels: cfg.channels.map(({ key, name }) => ({ key, name })), works }));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ generatedAt, units, ...report, counts: { works: works.length, seasons: items.length, unmatched: report.unmatched.length, guessed: report.guessed.length } }, null, 1));
console.log(`完成：${works.length} 部作品（${items.length} 個清單），未對應 ${report.unmatched.length}，需覆核 ${report.guessed.length}，用 ${units} 單位，${Math.round((Date.now() - t0) / 1000)} 秒`);
