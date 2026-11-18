// 每日同步：YouTube 片源頻道 → 過濾 → 對應 AniList → public/data。
// 用法：YOUTUBE_API_KEY=金鑰 npm run sync     （金鑰只從環境變數讀，不寫進任何檔案）
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { buildIndex, buildSeasons, buildStandalones, cleanDesc, cleanTitle, dubLabel, groupWorks, match, toTrad } from './lib.mjs';
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
// stop：拿到一頁後判斷要不要停（增量抓取：新的在前面，翻到已知的就停）
async function pages(path, params, stop = () => false) {
  const out = [];
  let t;
  do {
    const j = await yt(path, { ...params, maxResults: 50, ...(t && { pageToken: t }) });
    if (!j) return out;
    out.push(...j.items);
    if (stop(j.items)) break;
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
          id: x.id, title: x.snippet.title, desc: x.snippet.description ?? '', at: x.snippet.publishedAt, live: x.snippet.liveBroadcastContent,
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
// 增量（prev = 上次的快取）：每天只抓變動的部分，上架、下架都要抓得到（docs/adr/0005）——
//   上傳、會員清單：新的在前面，翻到上次見過的影片就停；清單：摘要每次全抓，影片數或 etag 變了才重抓內容；
//   影片細節：新影片一定抓，舊影片每天輪流重查七分之一（私人、刪除、禁止嵌入、台灣不能看都在這時發現）。
//   prev 為 null 時（完整同步：每週日、新頻道、FULL_SYNC=1）全部重抓。
async function fetchChannel(ch, prev) {
  const idPart = ch.id.slice(2), u0 = units;
  const ids = (items) => items.map((i) => i.contentDetails.videoId);
  const newest = async (playlistId, known) => {
    const got = ids(await pages('playlistItems', { part: 'contentDetails', playlistId }, (page) => !!known && ids(page).some((id) => known.has(id))));
    return known ? [...new Set([...got, ...known])] : got;
  };
  // 會員限定：頻道自己的會員清單（UUMO）。YouTube 影片欄位看不出來，只能這樣扣。沒有會員清單會回 404。
  const members = await newest(`UUMO${idPart}`, prev && new Set(prev.members));
  const uploadIds = await newest(`UU${idPart}`, prev && new Set(prev.uploadIds));
  // 不套任何過濾規則：抓取量只取決於頻道內容，改規則不影響配額，也都能用快取重跑
  const old = new Map((prev?.lists ?? []).map((p) => [p.id, p]));
  const lists = (await pages('playlists', { part: 'snippet,contentDetails', channelId: ch.id }))
    .map((p) => ({ id: p.id, etag: p.etag, title: p.snippet.title, desc: p.snippet.description ?? '', n: p.contentDetails.itemCount })) // desc：中文簡介的來源（docs/features.md）
    .filter((p) => p.n > 0);
  let changed = 0;
  for (const p of lists) {
    const o = old.get(p.id);
    if (o && o.n === p.n && o.etag === p.etag) { p.videoIds = o.videoIds; continue; }
    p.videoIds = ids(await pages('playlistItems', { part: 'contentDetails', playlistId: p.id }));
    changed++;
  }
  const memberSet = new Set(members);
  const need = [...new Set([...uploadIds, ...lists.flatMap((p) => p.videoIds)])].filter((id) => !memberSet.has(id));
  // gone：上次查不到的影片（刪除、私人；清單裡常留著佔位），跟舊影片一樣輪到那天才重查，不必每天查
  const known = new Map((prev?.videos ?? []).map((v) => [v.id, v])), wasGone = new Set(prev?.gone ?? []);
  const today = Math.floor(Date.now() / 864e5) % 7;
  const fetchIds = new Set(need.filter((id) => (!known.has(id) && !wasGone.has(id)) || rotation(id) === today));
  const fresh = await details([...fetchIds]);
  // 這次有查的：查不到就是刪除或設為私人，不留；沒輪到的沿用上次
  const videos = need.map((id) => (fetchIds.has(id) ? fresh.get(id) : known.get(id))).filter(Boolean);
  const have = new Set(videos.map((v) => v.id)), gone = need.filter((id) => !have.has(id));
  console.log(`${ch.name}${prev ? '（增量）' : '（完整）'}: 上傳 ${uploadIds.length}、會員限定 ${members.length}、清單 ${lists.length}（重抓 ${changed}）、影片細節 ${videos.length}（查 ${fetchIds.size}）、${units - u0} 單位`);
  return { members, uploadIds, lists, videos, gone };
}
// 影片輪到哪一天重查（0～6）：用 ID 算，固定且平均分散
const rotation = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 7;

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
  description(asHtml:false) bannerImage coverImage{large} tags{name rank isMediaSpoiler}
  relations{edges{relationType node{id}}}}}}`;
async function anilist(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    let r;
    for (let k = 0; k < 4; k++) { // 429 限流：等一分鐘再試，不要讓整次同步失敗
      r = await fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ANILIST, variables: { ids: ids.slice(i, i + 50), page: 1 } }),
      });
      if (r.status !== 429) break;
      await sleep(60000);
    }
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
  // 週日（台灣時間）或 FULL_SYNC=1 做完整同步，其餘日子增量；沒有快取的頻道一律完整
  const prev = existsSync(rawCache) ? JSON.parse(readFileSync(rawCache, 'utf8')) : {};
  const full = !!process.env.FULL_SYNC || new Date(Date.now() + 8 * 3600e3).getUTCDay() === 0;
  fetched = {};
  for (const ch of cfg.channels) fetched[ch.key] = await fetchChannel(ch, full ? null : prev[ch.key] ?? null);
  mkdirSync('sync/cache', { recursive: true });
  writeFileSync(rawCache, JSON.stringify(fetched));
}
// 快取裡還沒有的頻道（剛加進 sources.json、還沒完整同步過）先略過，下次完整同步就會有
const channels = cfg.channels.filter((ch) => fetched[ch.key] || console.warn(`快取裡沒有頻道 ${ch.name}，先略過；不加 USE_RAW_CACHE 完整跑一次就會有`));
const raw = channels.flatMap((ch) => buildChannel(ch, fetched[ch.key]));

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
const SEASON_IDX = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };
const airTime = (a, e) => { const y = a?.seasonYear ?? e?.animeSeason?.year; return y ? y * 10 + (SEASON_IDX[a?.season ?? e?.animeSeason?.season] ?? 0) : null; };
const videoDesc = new Map(channels.flatMap((ch) => fetched[ch.key].videos.map((v) => [v.id, v.desc ?? ''])));
const items = [];
raw.forEach((s, order) => {
  const a = s.link ? meta.get(s.link.anilistId) : null;
  if (a?.genres.some((g) => BLOCKED_GENRES.includes(g))) { report.dropped.push({ id: s.playlistId, title: s.rawTitle, why: 'adult' }); return; }
  const name = cleanTitle(s.rawTitle), lang = dubLabel(s.rawTitle) ?? ORIGINAL[s.channel.origin];
  items.push({
    id: s.playlistId, name: s.channel.origin === 'CN' ? toTrad(name) : name, rawTitle: s.rawTitle, single: !!s.single, order,
    channel: s.channel, lang, original: lang === ORIGINAL[s.channel.origin], members: s.members ?? 0, aid: s.link?.anilistId ?? null,
    when: airTime(a, s.link?.entry),
    episodes: s.episodes, a, entry: s.link?.entry, link: s.link, desc: s.desc ?? '', epDesc: videoDesc.get(s.episodes[0]?.id) ?? '',
  });
  if (!s.link) report.unmatched.push({ id: s.playlistId, title: s.rawTitle, eps: s.episodes.length });
  else if (['first', 'season', 'split', 'noseason'].includes(s.link.how)) report.guessed.push({ id: s.playlistId, title: s.rawTitle, anilistId: s.link.anilistId, how: s.link.how });
});

// 作品：卡片顯示最新一季的資料、年份用首季；篩選與搜尋用所有季的聯集（docs/adr/0003）
// AniList 續集／前傳：名稱差很多的續作（「續」「完」「The Final Season」）靠這個併進同一部作品
const related = {}, apart = {};
const rel = (m, types) => (m.relations?.edges ?? []).filter((e) => types.includes(e.relationType)).map((e) => e.node.id);
for (const [id, m] of meta) {
  related[id] = rel(m, ['SEQUEL', 'PREQUEL']);
  apart[id] = rel(m, ['SPIN_OFF', 'SIDE_STORY', 'ALTERNATIVE', 'PARENT']); // 模糊比對不併：外傳、衍生、平行作品
}

// 片源排序：同一季有好幾個頻道時，站內能播的集數多的排前面（預設播放），其次集數，再其次 sources.json 的頻道順序；
// 同一片源內原聲排第一
const chRank = (d) => cfg.channels.findIndex((c) => c.key === d.channel.key);
function sortDubs(dubs) {
  const score = new Map();
  for (const d of dubs) {
    const s = score.get(d.channel.key) ?? [0, 0];
    score.set(d.channel.key, [Math.max(s[0], d.episodes.filter((e) => !e.ext).length), Math.max(s[1], d.episodes.length)]);
  }
  const key = (d) => score.get(d.channel.key);
  return [...dubs].sort((p, q) => key(q)[0] - key(p)[0] || key(q)[1] - key(p)[1] || chRank(p) - chRank(q) || q.original - p.original);
}

const works = [], workFiles = [];
report.fuzzy = [];
{
  for (const w0 of groupWorks(items, manualWorks, related, apart, report.fuzzy)) {
    const w = { ...w0, seasons: w0.seasons.map((x) => ({ ...x, dubs: sortDubs(x.dubs) })) };
    // 作品歸在 sources.json 最前面的那個頻道（作品 ID 用它算，加新頻道時舊作品的 ID 不變）
    const ch = w.seasons.flatMap((x) => x.dubs).map((d) => d.channel).sort((p, q) => chRank({ channel: p }) - chRank({ channel: q }))[0];
    const pick = (season) => season.dubs[0];
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
    // 簡介：原聲季的頻道播放清單說明（清掉宣傳），沒有就退回 AniList 英文（docs/features.md）
    const zd = [...main.map(pick), ...all].find((d) => cleanDesc(d.desc)), zh = zd && cleanDesc(zd.desc);
    const en = all.map((d) => plain(d.a?.description)).find(Boolean) ?? '';
    const desc = zh ? (zd.channel.origin === 'CN' ? toTrad(zh) : zh) : en.slice(0, 300);
    workFiles.push({
      id, desc, descLang: zh ? 'zh' : 'en', members: main.map(pick).find((d) => d.members > 0)?.id ?? null,
      seasons: w.seasons.map((x) => ({
        name: x.name, kind: x.kind,
        dubs: x.dubs.map((d) => ({
          lang: d.lang, ch: d.channel.key, list: d.single ? null : d.id, episodes: d.episodes.map(({ id: v, n, title, sec, ext }) => ({ id: v, n, title, sec, ext })),
        })),
      })),
    });
  }
}

// 保護：片庫一次縮水超過三成視為異常，不覆蓋（舊格式沒有 works，視為第一次）
// 簡介統計；Ani-One 播放清單幾乎沒寫說明，先抽樣第 1 集影片說明，看過品質再決定要不要用
report.desc = {};
for (const ch of cfg.channels) {
  const mine = workFiles.filter((d) => works.find((w) => w.id === d.id)?.channel === ch.key);
  report.desc[ch.key] = { zh: mine.filter((d) => d.descLang === 'zh').length, en: mine.filter((d) => d.descLang === 'en').length };
}
report.epDescSamples = workFiles.filter((d) => d.descLang === 'en' && works.find((w) => w.id === d.id)?.channel === 'anione')
  .map((d) => ({ title: works.find((w) => w.id === d.id).title, desc: cleanDesc(items.find((it) => it.id === d.seasons.find((x) => x.kind !== 'special')?.dubs[0]?.list)?.epDesc) }))
  .filter((x) => x.desc).slice(0, 20);

const prev = existsSync(`${OUT}/index.json`) ? JSON.parse(readFileSync(`${OUT}/index.json`, 'utf8')).works?.length ?? 0 : 0;
if (prev && works.length < prev * 0.7) throw new Error(`片庫從 ${prev} 部縮到 ${works.length} 部，疑似異常，中止且不更新`);

// 改了分組規則（例如跨頻道合併）時作品 ID 會變：舊 ID → 新 ID 對照，前端用來轉址、搬移本機紀錄。
// 舊作品的任一集出現在哪部新作品，就轉到那部；之前的對照一併保留（指向的作品又被併掉就接著轉）
const oldIndex = existsSync(`${OUT}/index.json`) ? JSON.parse(readFileSync(`${OUT}/index.json`, 'utf8')) : {};
const newIds = new Set(workFiles.map((d) => d.id));
const epOwner = new Map(workFiles.flatMap((d) => d.seasons.flatMap((x) => x.dubs.flatMap((b) => b.episodes.map((e) => [e.id, d.id])))));
const moved = {};
for (const w of oldIndex.works ?? []) {
  if (newIds.has(w.id) || !existsSync(`${OUT}/works/${w.id}.json`)) continue;
  const old = JSON.parse(readFileSync(`${OUT}/works/${w.id}.json`, 'utf8'));
  const to = old.seasons?.flatMap((x) => x.dubs.flatMap((b) => b.episodes)).map((e) => epOwner.get(e.id)).find(Boolean);
  if (to) moved[w.id] = to;
}
for (const [from, to] of Object.entries(oldIndex.moved ?? {})) if (!newIds.has(from) && !moved[from]) moved[from] = newIds.has(to) ? to : moved[to];
for (const k of Object.keys(moved)) if (!moved[k]) delete moved[k];

rmSync(`${OUT}/seasons`, { recursive: true, force: true });
rmSync(`${OUT}/works`, { recursive: true, force: true });
mkdirSync(`${OUT}/works`, { recursive: true });
for (const d of workFiles) writeFileSync(`${OUT}/works/${d.id}.json`, JSON.stringify(d));
const generatedAt = new Date().toISOString();
writeFileSync(`${OUT}/index.json`, JSON.stringify({ generatedAt, channels: cfg.channels.map(({ key, name, label }) => ({ key, name, label })), works, moved }));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ generatedAt, units, ...report, counts: { works: works.length, seasons: items.length, unmatched: report.unmatched.length, guessed: report.guessed.length, fuzzy: report.fuzzy.length, moved: Object.keys(moved).length } }, null, 1));
console.log(`完成：${works.length} 部作品（${items.length} 個清單），未對應 ${report.unmatched.length}，需覆核 ${report.guessed.length}，用 ${units} 單位，${Math.round((Date.now() - t0) / 1000)} 秒`);
