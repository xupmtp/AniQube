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
  const m = /《(.+?)》\s*(第[一二三四五六七八九十\d]+季|Season\s*\d+|\d+(?:st|nd|rd|th)\s*Season)?/i.exec(s.replace(/[｜|].*$/, ''));
  if (m) s = m[2] ? `${m[1]} ${m[2]}` : m[1];
  // 「總集篇EP01-04｜《斗破苍穹》…」：「｜」前沒有作品名、「｜」後緊接著《作品名》，就把作品名接在前面（不然單篇歸不進所屬作品）
  const after = !m && /^[^｜|]*(總集篇|总集篇|特別篇|特别篇|劇場版|剧场版|OVA|OAD)[^｜|]*[｜|]\s*《(.+?)》/.exec(s);
  s = s.replace(/[｜|].*$/, '');
  if (after) s = `${after[2]} ${s}`;
  s = s.replace(/【(Ani-One[^】]*|限時免費公開|國語|日語|粵語[^】]*)】/g, '');
  s = s.replace(/\([^)]*(字幕|配音|全部集數|全集數?|TV版|全)\)/g, '');
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
  let m = /第\s*([一二三四五六七八九十]|\d+)\s*季/.exec(raw) || /\bS(\d+)/i.exec(raw) || /Season\s*(\d+)/i.exec(raw) || /(\d+)(?:st|nd|rd|th)\s*Season/i.exec(raw);
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

/** 回傳 { anilistId, entry, how } 或 null。how 方便事後檢視可信度：manual／single／year／movie 可信，season／first／split／noseason 是推測。 */
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
    // 標題寫第 2 季以後，卻只靠去掉季數的名稱對到唯一一筆：多半是資料集還沒有續季、對到了前作，列為待覆核
    if (how === 'single' && hints.season > 1 && c !== cands[0]) how = 'noseason';
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
    out.push({ playlistId: p.id, rawTitle: p.title, desc: p.desc ?? '', episodes: sortEpisodes(eps), members: p.videoIds.filter((id) => members.has(id)).length });
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

// ── 合集：一支影片看好幾集（「EP1-EP20合集」「第1~12話 合集」「全集馬拉松」），docs/adr/0006 ──
// 一般的集限 3 小時（超過的多半是直播存檔、連播）；合集另外放一區，只收能補上缺集的（pickBundles）
const BUNDLE = /合集|全集|一口[氣气]|馬拉松|[連连]播|無拼接|无拼接|Full Version|EP\s*\d+\s*[-~～]+\s*(?:EP)?\s*\d+|第\s*\d+\s*[~～-]\s*\d+\s*[話话集]|S\d+\s*[-~～]\s*S?\d+/i;

/** 合集涵蓋的集數範圍與季：{ a, b, season }；a、b 解析不到為 null，跨好幾季（S1-S3）的 season 為 null */
export function bundleRange(title) {
  const m = /EP\s*0*(\d+)\s*[-~～]+\s*(?:EP)?\s*0*(\d+)/i.exec(title) || /第\s*0*(\d+)\s*[~～-]\s*0*(\d+)\s*[話话集]/.exec(title);
  const multi = /S\d+\s*[-~～]\s*S?\d+|第\s*\d+\s*[+＋]\s*\d+\s*季/i.test(title);
  return { a: m ? Number(m[1]) : null, b: m ? Number(m[2]) : null, season: multi ? null : parseHints(title).season };
}

/**
 * 合集影片的作品名候選，依可能性排序（groupWorks 依序找片庫裡的作品，對不到才用第一個自成一部）。
 * 作品名通常在《》裡（「ENG SUB《仙逆》EP101-115合集」）；《》裡是篇名時前面的優先（「膽大黨《高速婆婆篇》」），
 * 是宣傳字時用後面的（「《期間限定-全集馬拉松》青春豬頭少年…」）；《》在「｜」後面時，「｜」前若只是宣傳字
 * （「4K無刪減 | S1-S5一口氣 |《狐妖小紅娘》」）或篇名，就用《》裡的
 */
export function bundleNames(title) {
  const tidy = (x) => x.replace(/第\s*\d+\s*[-~～]\s*\d+\s*[話话集].*$/, '').replace(/\bEP\s*\d+.*$/i, '').replace(/[(（][^)）]*[)）]/g, '')
    .replace(/\d+\s*分鐘/g, '').replace(/^[^！!]*(週年|周年|限定|首播)[^！!]*[！!]\s*/, '')
    .replace(/ENG SUB|MULTI ?SUB|NEW ANIME|合集版|合集|全集馬拉松|全集|無刪減|无删减|4K|高清|完整版|完整|最全|最新|Full|正[體体]字幕|年番\d*|新番|丨|一口[氣气]\S*|(?<![A-Za-z])S\d+(\s*[-~～]\s*S?\d+)?(?!\d)/gi, '')
    .trim().replace(/^[-\s　|，,]+|[-\s　|，,]+$/g, '');
  const t = title.replace(/[\p{Extended_Pictographic}\u{FE0F}\u200D]/gu, '').replace(/【[^】]*】/g, '');
  const head = t.replace(/[｜|].*$/, ''), m = /^(.*?)《(.+?)》(.*)$/.exec(head), late = /《(.+?)》/.exec(t);
  let names;
  if (m) {
    const [, before, inside, after] = m;
    names = /篇$/.test(inside) ? [before, inside] : /馬拉松|全集|合集|期間限定/.test(inside) ? [after] : [inside, before];
  } else names = late && (/篇$/.test(tidy(head)) || [...tidy(head)].length < 2) ? [late[1], head] : [head, late?.[1] ?? ''];
  return [...new Set(names.map(tidy))].filter((x) => [...x].length >= 2);
}
export const bundleName = (title) => bundleNames(title)[0] ?? '';

/** 不在任何季、也不是單篇的長片裡，標題像合集的 */
export function buildBundles(videos, usedIds, cfg, ch, members) {
  const deny = re(cfg.bundleDeny), marks = earlyMarks(cfg, ch), early = marks ? re(marks) : null;
  const out = [];
  for (const v of videos) {
    if (usedIds.has(v.id) || v.live !== 'none' || members.has(v.id) || v.twBlocked) continue;
    if (v.sec < cfg.bundleMinSec || v.sec > cfg.bundleMaxSec || !BUNDLE.test(v.title) || deny.test(v.title) || early?.test(v.title)) continue;
    const names = bundleNames(v.title);
    if (!names.length) continue;
    out.push({
      playlistId: `b-${v.id}`, rawTitle: v.title, single: true, bundle: { name: names[0], names, ...bundleRange(v.title) },
      episodes: [{ id: v.id, n: 1, title: v.title, sec: v.sec, views: v.views, at: v.at, ext: !v.embeddable || v.age }],
    });
  }
  return out;
}

/**
 * 合集只留能補上缺集的：範圍裡有作品沒有的集數（會員限定、沒單獨上傳），或整季不在片庫／含會員限定集；
 * 範圍重疊的，每次挑補得最多的那支，直到再也補不到新的集。seasons 是一部作品的季（含 bundle 單篇）
 */
export function pickBundles(seasons) {
  const main = seasons.filter((s) => s.kind !== 'special');
  const bySeason = new Map();
  for (const s of main) bySeason.set(s.no ?? 1, new Set([...(bySeason.get(s.no ?? 1) ?? []), ...s.dubs.flatMap((d) => d.episodes.map((e) => e.n))]));
  const all = new Set([...bySeason.values()].flatMap((x) => [...x]));
  const members = (no) => main.some((s) => (s.no ?? 1) === no && s.dubs.some((d) => d.members > 0));
  const gapOf = ({ a, b, season }) => {
    // 整部的全集：作品沒有單集、或有會員限定集時才補得到；有其他合集時不留（見下）
    if (a == null && season == null) return !main.length || main.some((s) => s.dubs.some((d) => d.members > 0)) ? ['ALL'] : [];
    if (a == null) return !bySeason.has(season) || members(season) ? [`S${season}`] : [];
    const have = season ? bySeason.get(season) ?? new Set() : all, out = [];
    // 合集用全系列的總集數（SPY 第 2 季「第30-35話」）、片庫的季每季從 1 起算：那季沒有會員集、合集又整段在它的最後一集之後，就當作編號不同
    if (season && have.size && a > Math.max(...have) && !members(season)) return [];
    for (let n = a; n <= Math.min(b, a + 2000); n++) if (!have.has(n)) out.push(`${season ?? 0}:${n}`);
    return out;
  };
  const cand = seasons.filter((s) => s.bundle).map((s) => ({ s, gap: gapOf(s.bundle) }));
  const keep = new Set(), covered = new Set();
  for (;;) {
    let best = null, gain = 0;
    for (const c of cand) {
      const g = keep.has(c.s) ? 0 : c.gap.filter((x) => !covered.has(x)).length;
      if (g > gain) { best = c; gain = g; }
    }
    if (!best) break;
    keep.add(best.s);
    best.gap.forEach((x) => covered.add(x));
  }
  if ([...keep].some((s) => s.bundle.a != null || s.bundle.season != null)) for (const s of keep) if (s.bundle.a == null && s.bundle.season == null) keep.delete(s);
  return seasons.filter((s) => !s.bundle || keep.has(s));
}

// ── 作品：同一片源頻道內，標題去掉季數與配音標記後相同的季合成一部（docs/adr/0003）──

// 季數寫法：第二季、S2、Season 2、2nd Season，以及接在中文後面的羅馬數字（「約會大作戰Ⅴ」「約會大作戰III」）
const SEASON_NO = /第\s*([一二三四五六七八九十\d]+)\s*季|(?<![A-Za-z])S(\d+)(?!\d)|Season\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*Season|(?<=[^\x00-\x7F]|\s)(II|III|IV|V|VI|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)$/i;
const ROMAN = { II: 2, III: 3, IV: 4, V: 5, VI: 6, Ⅱ: 2, Ⅲ: 3, Ⅳ: 4, Ⅴ: 5, Ⅵ: 6 };
const COLLECTION = /全集|全部集數|[(（]全[)）]|系列|S\d+\s*[-~+＋]\s*S?\d+|第\s*\d+\s*[+＋]\s*\d+\s*季/i;

/** 季名 → 季數（沒寫回 null）；「S1-S3」這種範圍取第一個數字 */
export function seasonNo(name) {
  const m = SEASON_NO.exec(name);
  if (!m) return null;
  if (m[5]) return ROMAN[m[5].toUpperCase()];
  const v = m[1] ?? m[2] ?? m[3] ?? m[4];
  return CJK_NUM[v] ?? Number(v);
}

/** 季名 → 作品名：去掉季數、範圍、「系列」等尾巴 */
export function workBase(name) {
  return name
    .replace(/\s*[(（]?第\s*[一二三四五六七八九十\d]+(?:\s*[+＋]\s*\d+)?\s*季.*$/, '')
    .replace(/\s*(?<![A-Za-z])(?:S\d+(?:\s*[-~+＋]\s*S?\d+)?|Season\s*\d+|\d+(?:st|nd|rd|th)\s*Season|Part\s*\d+)(?!\d).*$/i, '')
    .replace(/(?<=[^\x00-\x7F]|\s)(?:II|III|IV|V|VI|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)$/, '')
    .replace(/系列$/, '')
    .replace(/[\s:：\-—～~]+$/, '')
    .trim() || name;
}

/** 名稱的相鄰兩字集合（正規化後），算 Dice 相似度用 */
export function bigrams(s) {
  const t = norm(s), out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
/** Dice 相似度：兩邊共有的相鄰兩字 ×2 ÷ 兩邊總數，0～1 */
export const dice = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return (2 * n) / (a.size + b.size || 1); };
const FUZZY = 0.8;

/** 清單標題看得出是多季合輯 */
export const isCollection = (raw) => COLLECTION.test(raw);

/**
 * 季的順序：標題有季數就照季數；沒寫季數的（「續」「完」「The Final Season」）依首播時間（when）插到
 * 最後一個不晚於它的有號季後面；兩者都沒有的當第一季。同位置再依頻道清單順序。
 */
export function orderSeasons(list) {
  const byNo = (a, b) => (a.no ?? 1) - (b.no ?? 1) || a.order - b.order;
  const out = list.filter((x) => x.no != null || x.when === Infinity).sort(byNo);
  for (const f of list.filter((x) => x.no == null && x.when !== Infinity).sort((a, b) => a.when - b.when || a.order - b.order)) {
    let at = 0;
    out.forEach((x, i) => { if (x.when <= f.when) at = i + 1; });
    out.splice(at, 0, f);
  }
  return out.map(({ when, ...x }) => ({ ...x, no: x.no ?? 1 }));
}

/**
 * 把一個頻道的季（播放清單）與單篇分組成作品（docs/adr/0003）。
 * items: [{ id, name, rawTitle, lang, original, single, order, aid, when, episodes:[{id}] }]
 *   order = 頻道清單順序；aid = 對應到的 AniList 編號；when = 首播（年*10+季度，未知為 null）；original = 這份是原聲
 * override: { 清單ID: 作品名 }（人工作品對應表；指定的作品不參與自動合併）
 * related: { AniList編號: [續集／前傳的編號] }
 * apart: { AniList編號: [外傳、衍生、平行作品的編號] }（模糊比對不併這些）
 * log: 只靠模糊比對併起來的作品名配對會推進來，列進 report 供覆核
 * 所有頻道一起分組：同一部動畫不分片源頻道是同一部作品；同一季在不同頻道的清單是那一季的不同片源（item.channel）
 * 回傳 [{ key, base, seasons:[{ name, kind, no, dubs:[item] }] }]，季已排序；kind = season | collection | special
 */
export function groupWorks(items, override = {}, related = {}, apart = {}, log = []) {
  // 1. 標題：作品名相同的歸一部；季名相同、配音不同的是同一季的配音版；同季同配音只留集數最多的（重複上傳）
  const works = new Map();
  const workOf = (base) => {
    const key = norm(base);
    if (!works.has(key)) works.set(key, { key, base, groups: new Map(), pinned: false });
    return works.get(key);
  };
  const addTo = (w, it, special) => {
    const gk = it.bundle ? `bd:${it.id}` : (special ? 'sp:' : '') + norm(it.name); // 合集一支一份，不合併
    const g = w.groups.get(gk) ?? { name: it.name, special, bundle: it.bundle, coll: !special && isCollection(it.rawTitle), dubs: new Map(), order: it.order };
    const dk = `${it.channel?.key ?? ''}|${it.lang}`; // 片源＋配音
    const cur = g.dubs.get(dk);
    if (!cur || it.episodes.length > cur.episodes.length) g.dubs.set(dk, it);
    g.order = Math.min(g.order, it.order);
    w.groups.set(gk, g);
    if (it.id in override) w.pinned = true;
  };
  for (const it of items.filter((x) => !x.single)) addTo(workOf(override[it.id] ?? workBase(it.name)), it, false);
  // 單篇：標題含某作品名（取最長的）就歸入該作品，否則自成一部
  const keys = [...works.keys()].filter((k) => k.length >= 3).sort((a, b) => b.length - a.length);
  for (const it of items.filter((x) => x.single)) {
    const forced = override[it.id];
    // 合集的名稱常是簡稱（「聖者無雙」對「聖者無雙～上班族的異世界生存之道」），也接受作品名以它開頭的
    const find = (name) => keys.find((key) => norm(name).includes(key)) ?? (it.bundle && norm(name).length >= 3 ? keys.find((key) => key.startsWith(norm(name))) : undefined);
    const k = forced ? norm(forced) : it.bundle ? it.bundle.names.map(find).find(Boolean) : find(it.name);
    addTo(k && works.has(k) ? works.get(k) : workOf(forced ?? (it.bundle ? workBase(it.name) : it.name)), it, true);
  }

  // 2. 合併：共用影片過半、同一個 AniList 編號、AniList 續集／前傳；人工指定的作品不動
  const list = [...works.values()];
  const dubsOf = (w) => [...w.groups.values()].flatMap((g) => [...g.dubs.values()]);
  const eps = list.map((w) => new Set(dubsOf(w).flatMap((d) => d.episodes.map((e) => e.id))));
  const up = list.map((_, i) => i);
  const find = (x) => (up[x] === x ? x : (up[x] = find(up[x])));
  const join = (a, b) => { if (!list[a].pinned && !list[b].pinned) up[find(a)] = find(b); };
  const owners = new Map();
  eps.forEach((set, i) => set.forEach((e) => owners.set(e, [...(owners.get(e) ?? []), i])));
  const shared = new Map();
  for (const os of owners.values()) for (const a of os) for (const b of os) if (a < b) shared.set(`${a},${b}`, (shared.get(`${a},${b}`) ?? 0) + 1);
  for (const [k, n] of shared) { // 過半才算：「精選」「教學」這類混合清單只共用幾支，不該把不相干的作品串起來
    const [a, b] = k.split(',').map(Number);
    if (n * 2 >= Math.min(eps[a].size, eps[b].size)) join(a, b);
  }
  const byAid = new Map();
  list.forEach((w, i) => dubsOf(w).forEach((d) => { if (d.aid) { if (byAid.has(d.aid)) join(i, byAid.get(d.aid)); else byAid.set(d.aid, i); } }));
  list.forEach((w, i) => dubsOf(w).forEach((d) => (related[d.aid] ?? []).forEach((b) => { if (byAid.has(b)) join(i, byAid.get(b)); })));
  // 模糊：作品名相似度 Dice ≥ 0.8（實測 18 萬組不同作品只有 2 組超過，都是同系列的外傳），AniList 標明是外傳、衍生、平行作品的不併
  const aids = list.map((w) => new Set(dubsOf(w).map((d) => d.aid).filter(Boolean)));
  const grams = list.map((w) => bigrams(w.base));
  const isApart = (a, b) => [...aids[a]].some((x) => [...aids[b]].some((y) => apart[x]?.includes(y) || apart[y]?.includes(x)));
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      if (find(a) === find(b) || grams[a].size < 2 || grams[b].size < 2 || dice(grams[a], grams[b]) < FUZZY || isApart(a, b)) continue;
      join(a, b);
      if (find(a) === find(b)) log.push([list[a].base, list[b].base]);
    }
  }

  const merged = new Map();
  list.forEach((w, i) => { const r = find(i); merged.set(r, [...(merged.get(r) ?? []), w]); });
  const out = [];
  for (const members of merged.values()) {
    // 作品名：有原聲首季的那份，同樣是首季就取名稱最短的（「我的英雄學院」而非「我的英雄學院 : I am a hero too」）
    const rank = (w) => Math.min(...[...w.groups.values()].filter((g) => !g.special && [...g.dubs.values()].some((d) => d.original)).map((g) => seasonNo(g.name) ?? 1));
    const head = [...members].sort((a, b) => rank(a) - rank(b) || a.base.length - b.base.length)[0];
    const groups = new Map();
    for (const w of members) {
      for (const [gk, g] of w.groups) {
        const cur = groups.get(gk);
        if (!cur) { groups.set(gk, { ...g, dubs: new Map(g.dubs) }); continue; }
        for (const [lang, d] of g.dubs) if (!cur.dubs.has(lang) || d.episodes.length > cur.dubs.get(lang).episodes.length) cur.dubs.set(lang, d);
        cur.order = Math.min(cur.order, g.order);
      }
    }
    out.push({ key: head.key, base: head.base, groups });
  }

  // 3. 合輯與配音版：合輯幾乎被其他清單涵蓋就不列；名稱不同但對到同一個 AniList 編號、語言互補的季是同一季的配音版
  const ids = (g) => new Set([...g.dubs.values()].flatMap((d) => d.episodes.map((e) => e.id)));
  return out.map(({ key, base, groups }) => {
    let gs = [...groups.values()].filter((g) => !g.special).map((g) => ({ ...g, ids: ids(g) }));
    for (const g of gs) if (!g.coll) g.coll = gs.some((o) => o !== g && o.ids.size < g.ids.size && [...o.ids].every((x) => g.ids.has(x)));
    // 合輯開頭那段單季都沒有的集，通常是頻道沒另外開清單的第一季（無職、進擊的巨人）：拆成一季，跟其他季一樣能選
    const inSeasons = new Set(gs.filter((g) => !g.coll).flatMap((g) => [...g.ids]));
    const lead = (d) => { const i = d.episodes.findIndex((e) => inSeasons.has(e.id)); return i < 0 ? d.episodes.length : i; };
    // 開頭就是別季的集、或整份都沒有別季的集不拆；有好幾份合輯時取開頭那段最長的（有的合輯缺集，只拆得出半季）
    const cut = gs.filter((g) => g.coll).map((g) => {
      const orig = [...g.dubs.values()].find((d) => d.original) ?? [...g.dubs.values()][0];
      return { g, k: lead(orig), len: orig.episodes.length };
    }).filter((c) => c.k > 0 && c.k < c.len).sort((a, b) => b.k - a.k || b.g.dubs.size - a.g.dubs.size)[0];
    if (cut) {
      const { g, k } = cut, dubs = new Map();
      // 其他配音版也取開頭那段；整份都沒有別季的集、又比原聲那段長很多的（國語版全集）留在合輯
      for (const [l, d] of g.dubs) { const n = lead(d); if (n && (n < d.episodes.length || n <= k + 2)) dubs.set(l, { ...d, episodes: d.episodes.slice(0, n) }); }
      const no = seasonNo(g.name) ?? 1;
      gs.push({ name: no === 1 ? base : `${base} 第${no}季`, special: false, coll: false, dubs, order: g.order - 0.5, ids: ids({ dubs }) }); // 排在原合輯前面
    }
    const kept = new Set(gs);
    for (const g of gs.filter((x) => x.coll).sort((x, y) => x.ids.size - y.ids.size)) {
      const others = new Set([...kept].filter((o) => o !== g).flatMap((o) => [...o.ids]));
      // 九成以上的集在別的清單都有（重複上傳的合輯常差一兩支）就不列
      if (kept.size > 1 && [...g.ids].filter((x) => others.has(x)).length >= g.ids.size * 0.9) kept.delete(g);
    }
    gs = [...kept];
    const aidOf = (g) => { const a = new Set([...g.dubs.values()].map((d) => d.aid)); return a.size === 1 ? [...a][0] : null; };
    for (const g of [...gs]) {
      if (g.coll || !kept.has(g) || !aidOf(g)) continue;
      for (const o of gs) {
        if (o === g || o.coll || !kept.has(o) || aidOf(o) !== aidOf(g) || (seasonNo(o.name) ?? 1) !== (seasonNo(g.name) ?? 1)) continue;
        if ([...o.dubs.keys()].some((l) => g.dubs.has(l))) continue;
        const [main, extra] = [...o.dubs.values()].some((d) => d.original) ? [o, g] : [g, o];
        for (const [l, d] of extra.dubs) main.dubs.set(l, d);
        main.order = Math.min(main.order, extra.order);
        kept.delete(extra);
      }
    }
    const seasons = orderSeasons([...kept].map((g) => ({
      name: g.name, kind: g.coll ? 'collection' : 'season', no: seasonNo(g.name), order: g.order, dubs: [...g.dubs.values()],
      when: Math.min(...[...g.dubs.values()].map((d) => d.when ?? Infinity)),
    })));
    const specials = [...groups.values()].filter((g) => g.special).sort((a, b) => a.order - b.order)
      .map((g) => ({ name: g.name, kind: 'special', no: Infinity, order: g.order, dubs: [...g.dubs.values()], ...(g.bundle && { bundle: g.bundle }) }));
    return { key, base, seasons: [...seasons, ...specials] };
  });
}

// ── 中文簡介：頻道播放清單的說明，清掉宣傳雜訊（docs/features.md）──
const DESC_JUNK = /https?:\/\/|www\.|@|#|訂閱|订阅|會員|会员|Member|下載|下载|APP|App|更新時間|更新时间|每周|每週|上映|播出|官網|官网|粉絲|粉丝|Facebook|Instagram|IG|Twitter|LINE|原作[／/:：]|導演[／/:：]|监督|監督[／/:：]|製作[／/:：]|動畫製作|声優|聲優[／/:：]|CAST|STAFF|Hottest|Subscribe|热播|熱播/i;
const DESC_LEAD = /^\s*(☞|▶|►|👉|🔥|🗓|📅|\d{1,2}:\d{2})/u;

/** 清理頻道寫的說明：騰訊有「简介」標題就只取其後，Muse 有【劇情簡介】就只取那一段；
 *  刪 Ani-One 的「《作品》登陸Ani-One！」開頭、短的宣傳行、網址、表情符號；太短（<30 字）回空字串 */
export function cleanDesc(raw) {
  let lines = String(raw ?? '').split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*[简簡]介\s*[:：]?\s*$/.test(l));
  if (at >= 0) lines = lines.slice(at + 1);
  const story = lines.findIndex((l) => /【\s*(劇情|故事|作品)簡介\s*】/.test(l));
  if (story >= 0) {
    lines = lines.slice(story + 1);
    const end = lines.findIndex((l) => /^\s*【/.test(l));
    if (end > 0) lines = lines.slice(0, end);
  }
  lines = lines.map((l) => l.replace(/^[^\n]{0,40}》[^《》\n]{0,10}登陸Ani-One[^！!]*[！!]\s*/, ''));
  // 關鍵字只刪短的宣傳行；長段落是劇情簡介（可能剛好提到「LINE WEBTOON」「播出」），只去掉網址
  const kept = lines
    .filter((l) => !DESC_LEAD.test(l) && !(DESC_JUNK.test(l) && [...l].length < 80))
    .map((l) => l.replace(/https?:\/\/\S+/g, '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u200D]/gu, '').trim());
  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return [...text].length >= 30 ? text : '';
}
