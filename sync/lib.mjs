// 純邏輯：不碰網路，全部有測試。網路層在 run.mjs。
import * as OpenCC from 'opencc-js';

const toSimp = OpenCC.Converter({ from: 'tw', to: 'cn' });
export const toTrad = OpenCC.Converter({ from: 'cn', to: 'tw' });

export const norm = (s) =>
  toSimp(s.normalize('NFKC').toLowerCase()).replace(/[^\p{L}\p{N}]+/gu, '');

const CJK_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** 播放清單標題 → 作品名（去掉表情、宣傳字、頻道標記） */
export function cleanTitle(raw) {
  let s = raw.replace(/[\p{Extended_Pictographic}‍️#]/gu, '').replace(/《(期間限定|72小時快閃)》/g, '');
  // 《作品》後緊接的季數要留著，不然各季清單會變成同名卡片
  // 只在「｜」之前找《》：之後常是宣傳尾巴（「｜《劇場版 某》上映」）
  const m = /《(.+?)》\s*(第[一二三四五六七八九十\d]+季|Season\s*\d+)?/i.exec(s.replace(/[｜|].*$/, ''));
  if (m) s = m[2] ? `${m[1]} ${m[2]}` : m[1];
  s = s.replace(/[｜|].*$/, '');
  s = s.replace(/【(Ani-One[^】]*|限時免費公開|國語|日語|粵語[^】]*)】/g, '');
  s = s.replace(/\([^)]*(字幕|配音|全部集數|全集|TV版|全)\)/g, '');
  s = s.replace(/（[^）]*）/g, '');
  return s.trim().replace(/^[-\s　]+|[-\s　]+$/g, '');
}

/** 清單標題標明的配音語言（國語、粵語⋯），用來區分同作品的不同配音版；沒標就回 null */
export function dubLabel(raw) {
  const m = /【(國語|日語|粵語|台語)】|[(（]\s*(粵語|國語)配音|【(中文|日文)配音】/.exec(raw);
  if (!m) return null;
  return m[1] ?? m[2] ?? (m[3] === '中文' ? '國語' : '日語');
}

/** 從標題抓季數與年份提示，用來在同名多筆條目中挑一筆 */
export function parseHints(raw) {
  const hints = { season: null, year: null, movie: /劇場版|剧场版|電影|电影|映畫/.test(raw) };
  let m = /第\s*([一二三四五六七八九十]|\d+)\s*季/.exec(raw) || /\bS(\d+)/i.exec(raw) || /Season\s*(\d+)/i.exec(raw);
  if (m) hints.season = CJK_NUM[m[1]] ?? Number(m[1]);
  m = /(20\d\d)年\d+月新番/.exec(raw);
  if (m) hints.year = Number(m[1]);
  return hints;
}

/** 比對用的候選名：完整名，以及去掉季數與副標的名字 */
export function candidates(raw) {
  const base = cleanTitle(raw);
  const out = [base];
  const noSeason = base
    .replace(/\s*\((第?[一二三四五六七八九十\d]+季|S\d+)\)$/i, '')
    .replace(/\s*(S\d+(-S?\d+)?|第[一二三四五六七八九十\d]+季.*|Season\s*\d+)\s*$/i, '')
    .trim();
  if (noSeason && noSeason !== base) out.push(noSeason);
  const noMovie = base.replace(/\s*(劇場版|剧场版|電影版?|电影版?).*$/, '').trim();
  if (noMovie && !out.includes(noMovie)) out.push(noMovie);
  const head = base.split(/[：:]/)[0].trim();
  if (head && !out.includes(head)) out.push(head);
  return out;
}

const SEASON_ORDER = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };
const anilistId = (e) => {
  const s = e.sources.find((u) => u.includes('anilist.co/anime/'));
  return s ? Number(s.split('/').pop()) : null;
};

/** 離線資料集 → 名稱索引（只留有 AniList 條目的） */
export function buildIndex(entries) {
  const idx = new Map();
  for (const e of entries) {
    if (anilistId(e) == null) continue;
    for (const t of [e.title, ...(e.synonyms ?? [])]) {
      const k = norm(t);
      if (!k) continue;
      const a = idx.get(k);
      if (a) { if (!a.includes(e)) a.push(e); } else idx.set(k, [e]);
    }
  }
  return idx;
}

/** 中英黏在一起的名稱（「CODE GEASS叛逆的魯魯修」）拆成兩段各自試。命中只算猜的，要人工抽查 */
export function splitName(c) {
  const lat = "[A-Za-z][A-Za-z0-9 .!?:'&\\-]{3,}", cjk = '[\\u3400-\\u9fff\\u3040-\\u30ff]';
  const m = new RegExp(`^(${lat}?)\\s*(${cjk}.*)$`).exec(c) || new RegExp(`^(${cjk}[^A-Za-z]*?)\\s*(${lat})$`).exec(c);
  return m ? [m[1].trim(), m[2].trim()].filter((x) => x.length >= 2) : [];
}

const when = (e) => (e.animeSeason?.year ?? 9999) * 10 + (SEASON_ORDER[e.animeSeason?.season] ?? 0);

/** 回傳 { anilistId, entry, how } 或 null。how 方便事後檢視可信度。 */
export function match(raw, index) {
  const hints = parseHints(raw);
  const cands = candidates(raw);
  for (const [c, split] of [...cands.map((c) => [c, false]), ...cands.flatMap(splitName).map((c) => [c, true])]) {
    const list = index.get(norm(c));
    if (!list) continue;
    const sorted = [...list].sort((a, b) => when(a) - when(b));
    let pick, how = 'single';
    if (sorted.length > 1) {
      const tv = sorted.filter((e) => e.type === 'TV' || e.type === 'ONA');
      const movies = sorted.filter((e) => e.type === 'MOVIE');
      if (hints.year && sorted.some((e) => e.animeSeason?.year === hints.year)) {
        pick = sorted.find((e) => e.animeSeason?.year === hints.year); how = 'year';
      } else if (hints.movie && movies.length) {
        pick = movies[0]; how = 'movie';
      } else if (hints.season && tv[hints.season - 1]) {
        pick = tv[hints.season - 1]; how = 'season';
      } else {
        pick = tv[0] ?? sorted[0]; how = 'first';
      }
    } else pick = sorted[0];
    return { anilistId: anilistId(pick), entry: pick, how: split ? 'split' : how };
  }
  return null;
}

const re = (src) => new RegExp(src, 'iu');
// 頻道可覆寫「搶先看」標記；空字串 = 不用標題判斷（騰訊的「会员抢先看」是騰訊視頻 App 會員先看，YouTube 上是公開影片，2026-11 實測）
const earlyMarks = (cfg, ch) => ch.memberMarkers ?? cfg.memberMarkers;

/** 單支影片能不能進片庫。回傳 { ok, reason, ext }；ext=站外集（只能去 YouTube 看） */
export function classifyVideo(v, cfg, ch, members, { standalone = false } = {}) {
  const min = standalone ? cfg.standaloneMinSec : ch.minSec;
  if (v.live !== 'none') return { ok: false, reason: 'live' };
  if (members.has(v.id)) return { ok: false, reason: 'members' };
  if (v.twBlocked) return { ok: false, reason: 'region' };
  if (v.sec < min || v.sec > cfg.maxSec) return { ok: false, reason: 'length' };
  const marks = earlyMarks(cfg, ch);
  if (marks && re(marks).test(v.title)) return { ok: false, reason: 'early' };
  if (re(cfg.titleDeny).test(v.title)) return { ok: false, reason: 'denied' };
  return { ok: true, ext: !v.embeddable || v.age };
}

/** 集數：EP12、#12、第12集；解析不到回 null */
export function episodeNumber(title) {
  const m = /\bEP\.?\s*(\d{1,4})\b/i.exec(title) || /#\s*(\d{1,4})\b/.exec(title) || /第\s*(\d{1,4})\s*[集话話]/.exec(title);
  return m ? Number(m[1]) : null;
}

/** 依集數排序；全部解析得到才用集數，否則維持清單順序 */
export function sortEpisodes(eps) {
  const nums = eps.map((e) => episodeNumber(e.title));
  if (nums.every((n) => n != null) && new Set(nums).size === nums.length) {
    return eps.map((e, i) => ({ ...e, n: nums[i] })).sort((a, b) => a.n - b.n);
  }
  return eps.map((e, i) => ({ ...e, n: i + 1 }));
}

/**
 * 播放清單 → 季。排除：標題命中 titleDeny / 混了多部作品 / 過濾後沒有任何可播集。
 * playlists: [{id,title,videoIds[]}]；videos: Map(id → 影片)
 */
export function buildSeasons(playlists, videos, cfg, ch, members) {
  const out = [];
  const deny = re(cfg.titleDeny);
  const marks = earlyMarks(cfg, ch), early = marks ? re(marks) : null;
  for (const p of playlists) {
    if (deny.test(p.title) || early?.test(p.title) || cfg.excludeSeasons.includes(p.id)) continue;
    const eps = [];
    for (const id of p.videoIds) {
      const v = videos.get(id);
      if (!v) continue;
      const c = classifyVideo(v, cfg, ch, members);
      if (c.ok) eps.push({ id, title: v.title, sec: v.sec, views: v.views, at: v.at, ext: c.ext });
    }
    if (!eps.length) continue;
    const works = new Set(eps.map((e) => /《(.+?)》/.exec(e.title)?.[1]).filter(Boolean));
    if (works.size > 2) continue; // 混合清單（多部作品的精選）
    out.push({ playlistId: p.id, rawTitle: p.title, episodes: sortEpisodes(eps) });
  }
  return out;
}

/** 同片源內，集數完全被另一季涵蓋的季是重複清單（精選、字幕版、舊版）→ 丟掉較小的；完全相同則留先出現的 */
export function dropCovered(seasons) {
  const ids = seasons.map((s) => new Set(s.episodes.map((e) => e.id)));
  return seasons.filter((_, i) => !seasons.some((_, j) => j !== i && ids[i].size <= ids[j].size
    && (ids[i].size < ids[j].size || j < i) && [...ids[i]].every((x) => ids[j].has(x))));
}

/** 同片源、同標題（含配音標記）的季是重複上傳或殘缺清單 → 只留集數最多的；單篇不併，常是上下集 */
export function dropSameTitle(seasons) {
  const best = new Map();
  for (const s of seasons) {
    if (s.format === 'SINGLE') continue;
    const k = `${s.channel}|${s.title}`, b = best.get(k);
    if (!b || s.eps > b.eps) best.set(k, s);
  }
  return seasons.filter((s) => s.format === 'SINGLE' || best.get(`${s.channel}|${s.title}`) === s);
}

/** 不在任何季裡的長片，且標題像劇場版/特別篇 → 單篇。單集上傳、談話節目、開箱都不收 */
export function buildStandalones(uploads, usedIds, cfg, ch, members) {
  const out = [];
  for (const v of uploads) {
    if (usedIds.has(v.id)) continue;
    const c = classifyVideo(v, cfg, ch, members, { standalone: true });
    const head = v.title.replace(/\s*[｜|].*$/, ''); // 「｜」後常是宣傳尾巴（「｜《劇場版 某》上映！」），不能拿來判斷
    if (!c.ok || !re(cfg.standaloneAllow).test(head) || re(cfg.standaloneDeny).test(v.title)) continue;
    out.push({
      playlistId: `v-${v.id}`, rawTitle: v.title, single: true,
      episodes: [{ id: v.id, n: 1, title: v.title, sec: v.sec, views: v.views, at: v.at, ext: c.ext }],
    });
  }
  return out;
}
