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

/** 集數：EP12、#12、第12集；「第01-04話」這種合併集取第一個數字；解析不到回 null */
export function episodeNumber(title) {
  const m = /\bEP\.?\s*(\d{1,4})\b/i.exec(title) || /#\s*(\d{1,4})\b/.exec(title) || /第\s*(\d{1,4})(?:\s*[-~～]\s*\d{1,4})?\s*[集话話]/.exec(title);
  return m ? Number(m[1]) : null;
}

/** 依集數排序；全部解析得到才用集數，否則維持清單順序 */
export function sortEpisodes(all) {
  // 「第07-11話」合併版：涵蓋的每一集都另有單獨上傳，就是重複內容，拿掉
  const single = new Set(all.map((e) => /第\s*(\d{1,4})\s*[集话話]/.exec(e.title)?.[1]).filter(Boolean).map(Number));
  const eps = all.filter((e) => {
    const r = /第\s*(\d{1,4})\s*[-~～]\s*(\d{1,4})\s*[集话話]/.exec(e.title);
    if (!r) return true;
    for (let n = Number(r[1]); n <= Number(r[2]); n++) if (!single.has(n)) return true;
    return false;
  });
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
    // members：清單裡被當成會員限定扣掉的集數，作品頁用來提示「其餘為會員限定」
    out.push({ playlistId: p.id, rawTitle: p.title, episodes: sortEpisodes(eps), members: p.videoIds.filter((id) => members.has(id)).length });
  }
  return out;
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

// ── 作品：同一片源頻道內，標題去掉季數與配音標記後相同的季合成一部（docs/adr/0003）──

const SEASON_NO = /第\s*([一二三四五六七八九十\d]+)\s*季|(?<![A-Za-z])S(\d+)(?!\d)|Season\s*(\d+)/i;
const COLLECTION = /全部集數|全集數|[(（]全[)）]|系列|S\d+\s*[-~+＋]\s*S?\d+|第\s*\d+\s*[+＋]\s*\d+\s*季/i;

/** 季名 → 季數（沒寫回 null）；「S1-S3」這種範圍取第一個數字 */
export function seasonNo(name) {
  const m = SEASON_NO.exec(name);
  if (!m) return null;
  const v = m[1] ?? m[2] ?? m[3];
  return CJK_NUM[v] ?? Number(v);
}

/** 季名 → 作品名：去掉季數、範圍、「系列」等尾巴 */
export function workBase(name) {
  return name
    .replace(/\s*[(（]?第\s*[一二三四五六七八九十\d]+(?:\s*[+＋]\s*\d+)?\s*季.*$/, '')
    .replace(/\s*(?<![A-Za-z])(?:S\d+(?:\s*[-~+＋]\s*S?\d+)?|Season\s*\d+|Part\s*\d+)(?!\d).*$/i, '')
    .replace(/系列$/, '')
    .replace(/[\s:：\-—～~]+$/, '')
    .trim() || name;
}

/** 清單標題看得出是多季合輯 */
export const isCollection = (raw) => COLLECTION.test(raw);

/**
 * 把一個頻道的季（播放清單）與單篇分組成作品。
 * items: [{ id, name, rawTitle, lang, single, order, episodes:[{id}] }]，order = 頻道清單順序
 * override: { 清單ID: 作品名 }（人工作品對應表）
 * 回傳 [{ key, base, seasons:[{ name, kind, no, dubs:[item] }] }]，季已排序；kind = season | collection | special
 */
export function groupWorks(items, override = {}) {
  const works = new Map();
  const workOf = (base) => {
    const key = norm(base);
    if (!works.has(key)) works.set(key, { key, base, groups: new Map() });
    return works.get(key);
  };
  const ids = (it) => new Set(it.episodes.map((e) => e.id));

  // 1. 季：作品名相同的歸一部；季名相同、配音不同的是同一季的配音版；同季同配音只留集數最多的（重複上傳）
  for (const it of items.filter((x) => !x.single)) {
    const w = workOf(override[it.id] ?? workBase(it.name));
    const gk = norm(it.name);
    const g = w.groups.get(gk) ?? { name: it.name, coll: isCollection(it.rawTitle), dubs: new Map(), order: it.order };
    const cur = g.dubs.get(it.lang);
    if (!cur || it.episodes.length > cur.episodes.length) g.dubs.set(it.lang, it);
    g.order = Math.min(g.order, it.order);
    w.groups.set(gk, g);
  }

  // 2. 合輯：標題看得出來，或集數完整包含同作品另一季；被其他單季完整涵蓋的合輯不列
  for (const w of works.values()) {
    const gs = [...w.groups.values()].map((g) => ({ ...g, ids: new Set([...g.dubs.values()].flatMap((d) => [...ids(d)])) }));
    for (const g of gs) {
      if (!g.coll) g.coll = gs.some((o) => o !== g && o.ids.size < g.ids.size && [...o.ids].every((x) => g.ids.has(x)));
    }
    // 從小的合輯開始：能被作品裡其他清單（單季或別的合輯）完整取代就不列
    const kept = new Set(gs);
    for (const g of gs.filter((x) => x.coll).sort((x, y) => x.ids.size - y.ids.size)) {
      const others = new Set([...kept].filter((o) => o !== g).flatMap((o) => [...o.ids]));
      if (kept.size > 1 && [...g.ids].every((x) => others.has(x))) kept.delete(g);
    }
    w.seasons = [...kept]
      .map((g) => ({ name: g.name, kind: g.coll ? 'collection' : 'season', no: seasonNo(g.name) ?? 1, order: g.order, dubs: [...g.dubs.values()] }))
      .sort((a, b) => a.no - b.no || a.order - b.order);
  }

  // 3. 單篇：標題含某作品名（取最長的）就歸入該作品，否則自成一部；同名不同配音的併成配音版
  const keys = [...works.keys()].filter((k) => k.length >= 3).sort((a, b) => b.length - a.length);
  for (const it of items.filter((x) => x.single)) {
    const forced = override[it.id];
    const k = forced ? norm(forced) : keys.find((key) => norm(it.name).includes(key));
    const w = k && works.has(k) ? works.get(k) : workOf(forced ?? it.name);
    w.seasons ??= [];
    const same = w.seasons.find((x) => x.kind === 'special' && norm(x.name) === norm(it.name));
    if (!same) w.seasons.push({ name: it.name, kind: 'special', no: Infinity, order: it.order, dubs: [it] });
    else if (!same.dubs.some((d) => d.lang === it.lang)) same.dubs.push(it);
  }

  return [...works.values()].filter((w) => w.seasons?.length).map(({ key, base, seasons }) => ({ key, base, seasons }));
}
