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
  let m = /第\s*([一二三四五六七八九十]|\d+)\s*季/.exec(raw) || /\bS(\d+)/i.exec(raw) || /Season\s*(\d+)/i.exec(raw) || /(\d+)(?:st|nd|rd|th)\s*Season/i.exec(raw) || /(?<![\p{L}\d])([一二三四五六七八九十]|\d+)\s*期(?!間|限)/u.exec(raw);
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
  idx.byId = new Map(); // AniList 編號 → 條目（混合清單偵測走相關作品用）
  for (const e of entries) {
    if (anilistId(e) == null) continue;
    idx.byId.set(anilistId(e), e);
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
      // 同名的 TV/ONA 裡，1、2 集的多半是試播或特別篇（《失憶投捕》2020 年的 1 集 ONA），有正式的就不挑它們
      const series = sorted.filter((e) => e.type === 'TV' || e.type === 'ONA');
      const tv = series.some((e) => e.episodes >= 3) ? series.filter((e) => !(e.episodes > 0 && e.episodes < 3)) : series;
      const movies = sorted.filter((e) => e.type === 'MOVIE');
      if (hints.year && sorted.some((e) => e.animeSeason?.year === hints.year)) {
        pick = sorted.find((e) => e.animeSeason?.year === hints.year); how = 'year';
      } else if (hints.movie && movies.length) {
        pick = movies[0]; how = 'movie';
      } else if (hints.season && c !== cands[0] && tv[hints.season - 1]) { // 名稱本身已寫季數（「斗破苍穹 第二季」）就不再用季數挑
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

/** 單支影片能不能進片庫。回傳 { ok, reason, ext }；ext=站外集（只能去 YouTube 看） */
export function classifyVideo(v, cfg, ch, members, { standalone = false } = {}) {
  const min = standalone ? cfg.standaloneMinSec : cfg.minSec;
  if (v.live !== 'none') return { ok: false, reason: 'live' };
  if (members.has(v.id)) return { ok: false, reason: 'members' };
  if (v.twBlocked) return { ok: false, reason: 'region' };
  if (v.sec < min || v.sec > cfg.maxSec) return { ok: false, reason: 'length' };
  if (re(cfg.titleDeny).test(v.title)) return { ok: false, reason: 'denied' };
  return { ok: true, ext: !v.embeddable || v.age };
}

/** 集數：EP12、#12、第12集；「第01-04話」這種合併集取第一個數字；解析不到回 null */
const CJK_EP = (s) => { const m = /^([一二三四五六七八九])?(十)?([一二三四五六七八九])?$/.exec(s); if (!m || !s) return null; return (m[2] ? (m[1] ? CJK_NUM[m[1]] : 1) * 10 : 0) + (m[3] ? CJK_NUM[m[3]] : m[2] ? 0 : CJK_NUM[m[1]] ?? 0); };
export function episodeNumber(title) {
  const c = /第\s*([一二三四五六七八九十]{1,3})\s*[集话話]/.exec(title);
  if (c && CJK_EP(c[1])) return CJK_EP(c[1]);
  const m = /\bEP\.?\s*(\d{1,4})\b/i.exec(title) || /#\s*(\d{1,4})\b/.exec(title) || /第\s*(\d{1,4})(?:\s*[-~～]\s*\d{1,4})?\s*[集话話回]/.exec(title);
  return m ? Number(m[1]) : null;
}

/** 季清單裡沒有集數、標題像劇場版／OVA／特別篇／總集篇的影片：移出季，改當單篇（CONTEXT.md「劇場版與特別篇」） */
export const isExtra = (title) => episodeNumber(title) == null && /劇場版|剧场版|電影|电影|\bOVA\b|\bOAD\b|特別篇|特别篇|總集篇|总集篇|特別上映|特别上映|\bSP\b/i.test(title);

/**
 * 季裡的集依集數排：有集數的照集數；沒有集數的照上架時間接在後面（整份都沒有集數時，「新的在前」的清單也會排對）。
 * 「第07-11話」合併版：涵蓋的每一集都另有單獨上傳，就是重複內容，拿掉
 */
export function sortEpisodes(all) {
  const single = new Set(all.map((e) => /第\s*(\d{1,4})\s*[集话話]/.exec(e.title)?.[1]).filter(Boolean).map(Number));
  const eps = all.filter((e) => {
    const r = /第\s*(\d{1,4})\s*[-~～]\s*(\d{1,4})\s*[集话話]/.exec(e.title);
    if (!r) return true;
    for (let n = Number(r[1]); n <= Number(r[2]); n++) if (!single.has(n)) return true;
    return false;
  });
  const withN = eps.map((e, i) => ({ ...e, n: episodeNumber(e.title), i }));
  const numbered = withN.filter((e) => e.n != null).sort((a, b) => a.n - b.n || a.i - b.i);
  const rest = withN.filter((e) => e.n == null).sort((a, b) => (a.at && b.at ? a.at.localeCompare(b.at) : 0) || a.i - b.i);
  let last = numbered.at(-1)?.n ?? 0;
  return [...numbered, ...rest.map((e) => ({ ...e, n: ++last }))].map(({ i, ...e }) => e);
}

/**
 * 播放清單 → 季。排除：標題命中 titleDeny / 混了多部作品 / 過濾後沒有任何可播集。
 * playlists: [{id,title,videoIds[]}]；videos: Map(id → 影片)
 */
export function buildSeasons(playlists, videos, cfg, ch, members) {
  const out = [];
  const deny = re(cfg.titleDeny);
  const extras = [], seen = new Set();
  for (const p of playlists) {
    if (deny.test(p.title)) continue;
    const eps = [];
    for (const id of p.videoIds) {
      const v = videos.get(id);
      if (!v) continue;
      const c = classifyVideo(v, cfg, ch, members);
      if (!c.ok) continue;
      eps.push({ id, title: v.title, sec: v.sec, views: v.views, at: v.at, ext: c.ext });
    }
    if (!eps.length) continue;
    // 混合判斷要看拆出單篇前的全部標題（「木棉花電影院」拆走劇場版後只剩一部作品，會誤判成一季）
    const allTitles = eps.map((e) => e.title);
    const works = new Set(allTitles.map((t) => /《(.+?)》/.exec(t)?.[1]).filter(Boolean));
    if (works.size > 2) continue; // 混合清單（多部作品的精選）
    // 季清單裡混了劇場版、OVA（有正片集數的才算混；整份都是短篇 OVA 的本身就是一季）→ 移出來當單篇；
    // 一小時以上的劇場版一律各自是單篇（「蠟筆小新 劇場版」清單是 20 部電影，不是一季）
    const out1 = (e) => isExtra(e.title) && (e.sec >= 3600 || eps.some((x) => !isExtra(x.title)));
    if (eps.some(out1)) {
      for (const e of eps.filter(out1)) {
        if (!seen.has(e.id)) extras.push({ playlistId: `v-${e.id}`, rawTitle: e.title, single: true, episodes: [{ ...e, n: 1 }] });
        seen.add(e.id);
      }
      eps.splice(0, eps.length, ...eps.filter((x) => !out1(x)));
      if (!eps.length) continue;
    }
    // members：清單裡被當成會員限定扣掉的集數，作品頁用來提示「其餘為會員限定」
    out.push({ playlistId: p.id, rawTitle: p.title, desc: p.desc ?? '', episodes: sortEpisodes(eps), allTitles, members: p.videoIds.filter((id) => members.has(id)).length });
  }
  return [...out, ...extras]; // 季清單裡的劇場版、OVA 當單篇，跟著作品名歸到所屬作品
}

/**
 * 混合清單：好幾部不相干的作品放在同一份清單（「木棉花電影院 劇場版動畫」）。集數對到 3 個以上條目、
 * 而且它們在資料集的相關作品裡連不起來，就是混合清單，不當成一季（裡面的影片仍可當單篇收）。
 * 同一部長篇在資料集分成好幾個條目的（BLEACH 各篇章）彼此相關，不會被誤判
 */
export function isMixed(titles, index) {
  const ids = [...new Set(titles.map((t) => match(t, index)?.anilistId).filter(Boolean))];
  if (ids.length < 3) return false;
  const seen = new Set([ids[0]]);
  let front = [ids[0]];
  for (let d = 0; d < 12 && front.length; d++) { // 長篇從第一季走到完結篇要好幾層（進擊的巨人 6 層以上）
    front = front.flatMap((id) => (index.byId.get(id)?.relatedAnime ?? []).map((u) => Number(/anilist\.co\/anime\/(\d+)/.exec(u)?.[1])).filter((n) => n && !seen.has(n) && seen.add(n)));
  }
  return !ids.every((id) => seen.has(id));
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
  const deny = re(cfg.bundleDeny);
  const out = [];
  for (const v of videos) {
    if (usedIds.has(v.id) || v.live !== 'none' || members.has(v.id) || v.twBlocked) continue;
    if (v.sec < cfg.bundleMinSec || v.sec > cfg.bundleMaxSec || !BUNDLE.test(v.title) || deny.test(v.title)) continue;
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
const SEASON_NO = /第\s*([一二三四五六七八九十\d]+)\s*季|(?<![A-Za-z])S(\d+)(?!\d)|Season\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*Season|(?<=[^\x00-\x7F]|\s)(II|III|IV|V|VI|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)$|(?<![\p{L}\d])([一二三四五六七八九十]|\d+)\s*期(?!間|限)/iu;
const ROMAN = { II: 2, III: 3, IV: 4, V: 5, VI: 6, Ⅱ: 2, Ⅲ: 3, Ⅳ: 4, Ⅴ: 5, Ⅵ: 6 };
const COLLECTION = /全集|全部集數|[(（]全[)）]|系列|S\d+\s*[-~+＋]\s*S?\d+|第\s*\d+\s*[+＋]\s*\d+\s*季/i;

/** 同一集：同一支影片，或集數相同（沒有集數的只看影片） */
const sameEp = (h, e) => h.id === e.id || (h.n != null && h.n === e.n);

/** 季名 → 季數（沒寫回 null）；「S1-S3」這種範圍取第一個數字 */
export function seasonNo(name) {
  const m = SEASON_NO.exec(name);
  if (!m) return null;
  if (m[5]) return ROMAN[m[5].toUpperCase()];
  const v = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[6];
  return CJK_NUM[v] ?? Number(v);
}

/** 季名 → 作品名：去掉季數、範圍、「系列」等尾巴 */
export function workBase(name) {
  return name
    .replace(/\s*[(（]\s*(?:S\d+|第\s*[一二三四五六七八九十\d]+\s*季)\s*[)）]\s*$/i, '')
    .replace(/\s*[(（]?第\s*[一二三四五六七八九十\d]+(?:\s*[+＋]\s*\d+)?\s*季.*$/, '')
    .replace(/\s*(?<![A-Za-z])(?:S\d+(?:\s*[-~+＋]\s*S?\d+)?|Season\s*\d+|\d+(?:st|nd|rd|th)\s*Season|Part\s*\d+)(?!\d).*$/i, '')
    .replace(/(?<=[^\x00-\x7F]|\s)(?:II|III|IV|V|VI|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)$/, '')
    .replace(/\s*(?<![\p{L}\d])(?:[一二三四五六七八九十]|\d+)\s*期$/u, '')
    .replace(/系列$/, '')
    .replace(/\s*[(（]?TV\s*版[)）]?$/i, '') // 「蠟筆小新TV版」：版本標示不是作品名的一部分，劇場版才能歸進來
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

/**
 * 季名的「第 N 季」與副標（CONTEXT.md「季」）：季數從名稱的季數標記來；副標是名稱扣掉作品名與季數標記後剩下的，
 * 剩下的跟作品名差不多（譯名寫法不同、Dice ≥ 0.8）就當作沒有副標。沒有季數也沒有副標的就是第 1 季
 */
export function seasonLabel(name, base) {
  let no = seasonNo(name);
  let sub = name.replace(/【([^】]*)】/g, (m, x) => (TAG.test(x) ? ' ' : m)).replace(/(?<![A-Za-z])S\d+\s*[-~～+＋]\s*S?\d+|第\s*\d+\s*[+＋]\s*\d+\s*季|全部集數|全集數?|所有集數|系列$/gi, ' ').replace(SEASON_NO, ' ').replace(/[(（]\s*[)）]|[(（]\s*S\d+\s*[)）]/gi, ' ');
  const wb = workBase(name), similar = bigrams(wb).size >= 2 && dice(bigrams(wb), bigrams(base)) >= FUZZY; // 譯名寫法不同（「SPY x FAMILY」）
  // 作品名整段、譯名寫法不同的（「SPY x FAMILY」）、以及作品名被括號符號隔開的各段（「魔導少年-最終章(妖精的尾巴)」）都去掉
  const pieces = base.split(/[()（）\-—\s:：・·|｜]+/).filter((p) => p.length >= 2 && p !== base);
  for (const v of [base, toSimp(base), toTrad(base), similar && wb, ...pieces]) if (v && v.length >= 2) sub = sub.split(v).join(' ');
  sub = sub.replace(/[(（]\s*(?:OVA|OAD|TV版?)\s*[)）]/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s\-—:：~～・·•|｜(（]+|[\s\-—:：~～・·•|｜)）]+$/g, '').trim();
  if (sub.split(/[(（]/).length !== sub.split(/[)）]/).length) sub = sub.replace(/[(（)）]/g, '').trim();
  const lead = no == null && /^(?:(\d{1,2})|(II|III|IV|V|VI|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)|(\d)(?:st|nd|rd|th))(?=$|[\s\-—:：~～])/i.exec(sub);
  if (lead) { no = lead[1] ? Number(lead[1]) : lead[2] ? ROMAN[lead[2].toUpperCase()] : Number(lead[3]); sub = lead[3] ? sub : sub.slice(lead[0].length).replace(/^[\s\-—:：~～]+/, '').trim(); }
  if (!norm(sub) || /^(全|全集|全部|合集|合輯)$/.test(sub) || (bigrams(sub).size >= 2 && dice(bigrams(sub), bigrams(base)) >= FUZZY)) sub = '';
  if (no == null && !sub) no = 1;
  return { no, sub };
}

/** 一集標題寫的季數（「進擊的巨人S2 第01話」「(S2) 第26話」「第二季」「二期」）；沒寫回 null */
export const episodeSeason = (title) => seasonNo(String(title ?? "").replace(/[｜|].*$/, ''));

/** 清單標題看得出是多季合輯 */
export const isCollection = (raw) => COLLECTION.test(raw);

/**
 * 季的順序：標題有季數就照季數；沒寫季數的（「續」「完」「The Final Season」）依首播時間（when）插到
 * 最後一個不晚於它的有號季後面；兩者都沒有的當第一季。同位置再依頻道清單順序。
 */
export function orderSeasons(list) {
  const byNo = (a, b) => a.no - b.no || a.order - b.order;
  const out = list.filter((x) => x.no != null).sort(byNo);
  for (const f of list.filter((x) => x.no == null && x.when !== Infinity).sort((a, b) => a.when - b.when || a.order - b.order)) {
    let at = 0;
    out.forEach((x, i) => { if (x.when <= f.when) at = i + 1; });
    out.splice(at, 0, f);
  }
  // 沒季數也沒首播時間的排最後（照頻道清單順序）
  return [...out, ...list.filter((x) => x.no == null && x.when === Infinity).sort((a, b) => a.order - b.order)].map(({ when, ...x }) => x);
}

/**
 * 把一個頻道的季（播放清單）與單篇分組成作品（docs/adr/0003）。
 * items: [{ id, name, rawTitle, lang, original, single, order, aid, when, episodes:[{id}] }]
 *   order = 頻道清單順序；aid = 對應到的 AniList 編號；when = 首播（年*10+季度，未知為 null）；original = 這份是原聲
 * override: { 清單ID: 作品名 }（人工作品對應表；指定的作品不參與自動合併）
 * related: { AniList編號: [續集／前傳的編號] }
 * apart: { AniList編號: [重製版、系列形式外傳的編號] }（任何條件都不併這些）
 * chainOf: Map<AniList編號, 系列鏈代表編號>（沿續作關係、不經過劇場版能連到的是同一條鏈）
 * log: 只靠模糊比對併起來的作品名配對會推進來，列進 report 供覆核
 * 所有頻道一起分組：同一部動畫不分片源頻道是同一部作品；同一季在不同頻道的清單是那一季的不同片源（item.channel）
 * 回傳 [{ key, base, seasons:[{ name, kind, no, dubs:[item] }] }]，季已排序；kind = season | collection | special
 */
export function groupWorks(items, override = {}, related = {}, apart = {}, log = [], chainOf = new Map()) {
  // 1. 標題：作品名相同的歸一部；季名相同、配音不同的是同一季的配音版；同季同配音只留集數最多的（重複上傳）
  const works = new Map();
  const workOf = (base) => {
    const key = norm(base);
    if (!works.has(key)) works.set(key, { key, base, groups: new Map(), pinned: false });
    return works.get(key);
  };
  const addTo = (w, it, special) => {
    const gk = it.bundle ? `bd:${it.id}` : special ? `sp:${norm(String(it.rawTitle ?? it.name).replace(/【([^】]*)】/g, (m, x) => (TAG.test(x) ? '' : m)).replace(/[(（][^)）]*(字幕|配音|原聲|雙語)[^)）]*[)）]|[｜|]\s*(Muse|Ani-One|腾讯|阅文|曼迪)[^｜|]*$/g, ''))}` : norm(it.name); // 合集一支一份；單篇同標題（去掉語言標記）的才是配音版
    const g = w.groups.get(gk) ?? { name: it.name, special, bundle: it.bundle, coll: !special && isCollection(it.rawTitle), dubs: new Map(), order: it.order };
    const dk = `${it.channel?.key ?? ''}|${it.lang}`; // 片源＋配音
    const cur = g.dubs.get(dk);
    if (!cur || it.episodes.length > cur.episodes.length) g.dubs.set(dk, it);
    g.order = Math.min(g.order, it.order);
    w.groups.set(gk, g);
    if (it.id in override) w.pinned = true;
  };
  for (const it of items.filter((x) => !x.single)) addTo(workOf(override[it.id] ?? workBase(it.name)), it, false);
  // 單篇（劇場版、特別篇、合集）：名稱含某作品名（取最長的）就歸入該作品，否則自成一部。
  // 短的先處理，自成一部的也能讓後面的歸入（《完美世界》的合集和特別篇歸在同一部）
  const keys = () => [...works.values()].filter((w) => w.key.length >= 2).sort((a, b) => b.key.length - a.key.length);
  // 兩個字的作品名太容易撞名：單篇名稱要以它開頭、後面接空白或標點（「冰菓 第01-22話」算、「冰菓子」不算）
  const fits = (w, name) => (w.key.length >= 3 ? norm(name).includes(w.key) : name.startsWith(w.base) && /^[\s\p{P}]/u.test(name.slice(w.base.length)));
  const singles = items.filter((x) => x.single).sort((a, b) => norm(a.name).length - norm(b.name).length);
  for (const it of singles) {
    const forced = override[it.id];
    // 合集的名稱常是簡稱（「聖者無雙」對「聖者無雙～上班族的異世界生存之道」），也接受作品名以它開頭的
    // 都對不上時，名稱去掉集數、【】、劇場版／總集篇字樣後跟作品名相似度 ≥ 0.8 也算（頻道少打一個字：「惑星公主蜥蜴騎士」）
    const core = (name) => bigrams(name.replace(/【[^】]*】|[(（][^)）]*[)）]/g, ' ').replace(/第\s*[\d.]+\s*[話话集回]|總集篇|总集篇|特別篇|特别篇|劇場版|剧场版|電影版?|\bOVA\b|\bOAD\b/gi, ' '));
    const fuzzy = (name) => keys().find((w) => w.key.length >= 3 && dice(core(name), bigrams(w.base)) >= FUZZY);
    const find = (name) => keys().find((w) => fits(w, name)) ?? (it.bundle && norm(name).length >= 3 ? keys().find((w) => w.key.startsWith(norm(name))) : undefined) ?? fuzzy(name);
    const w = forced ? workOf(forced) : (it.bundle ? it.bundle.names.map(find).find(Boolean) : find(it.name)) ?? workOf(it.bundle ? workBase(it.name) : it.name);
    addTo(w, it, true);
  }

  // 2. 合併（docs/adr/0007）。系列之間的直接連結先合併：名稱相似、兩份季清單共用影片過半、同一個 AniList 編號、
  //    同一條系列鏈上的續作關係。非系列（劇場版、單篇、合輯）的連結只能歸入一部系列：兩邊都已經有系列時，
  //    只在系列鏈有交集才合併（進擊的巨人的「全集」連起 S1 與 The Final Season；Love Live! 的劇場版不會把 Sunshine 連進來）。
  //    AniList 標明是重製版、系列形式外傳的（apart）不合併；人工指定的作品不動
  const list = [...works.values()];
  const dubsOf = (w) => [...w.groups.values()].flatMap((g) => [...g.dubs.values()]);
  // 系列：單篇以外的季；只含劇場版的清單（「伊莉雅 雪下的誓言」）不算
  const movieOnly = (g) => [...g.dubs.values()].every((d) => d.a?.format === 'MOVIE');
  const seasonDubs = (w) => [...w.groups.values()].filter((g) => !g.special && !movieOnly(g)).flatMap((g) => [...g.dubs.values()]);
  const plainDubs = (w) => [...w.groups.values()].filter((g) => !g.special && !g.coll).flatMap((g) => [...g.dubs.values()]);
  const idsOf = (ds) => new Set(ds.flatMap((d) => d.episodes.map((e) => e.id)));
  const eps = list.map((w) => idsOf(dubsOf(w))), plainEps = list.map((w) => idsOf(plainDubs(w)));
  const aids = list.map((w) => new Set(dubsOf(w).map((d) => d.aid).filter(Boolean)));
  const seasonAids = list.map((w) => new Set(seasonDubs(w).map((d) => d.aid).filter(Boolean)));
  const chain = (aid) => chainOf.get(aid) ?? aid;
  const up = list.map((_, i) => i), chains = seasonAids.map((s) => new Set([...s].map(chain))), series = seasonAids.map((_, i) => seasonDubs(list[i]).length > 0);
  const find = (x) => (up[x] === x ? x : (up[x] = find(up[x])));
  const unite = (a, b) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra === rb) return;
    up[ra] = rb; series[rb] ||= series[ra]; chains[ra].forEach((c) => chains[rb].add(c));
  };
  const isApart = (a, b) => [...aids[a]].some((x) => [...aids[b]].some((y) => apart[x]?.includes(y) || apart[y]?.includes(x)));
  const links = []; // [a, b, 系列之間的直接連結?, 模糊?]
  const owners = new Map();
  eps.forEach((set, i) => set.forEach((e) => owners.set(e, [...(owners.get(e) ?? []), i])));
  const shared = new Map();
  for (const os of owners.values()) for (const a of os) for (const b of os) if (a < b) shared.set(`${a},${b}`, (shared.get(`${a},${b}`) ?? 0) + 1);
  for (const [k, n] of shared) { // 過半才算：「精選」「教學」這類混合清單只共用幾支，不該把不相干的作品串起來
    const [a, b] = k.split(',').map(Number);
    if (n * 2 < Math.min(eps[a].size, eps[b].size)) continue;
    const pn = [...plainEps[a]].filter((x) => plainEps[b].has(x)).length;
    links.push([a, b, pn > 0 && pn * 2 >= Math.min(plainEps[a].size, plainEps[b].size)]);
  }
  const byAid = new Map();
  list.forEach((w, i) => aids[i].forEach((x) => byAid.set(x, [...(byAid.get(x) ?? []), i])));
  for (const [x, ws] of byAid) for (const b of ws.slice(1)) links.push([ws[0], b, seasonAids[ws[0]].has(x) && seasonAids[b].has(x)]);
  list.forEach((_, a) => aids[a].forEach((x) => (related[x] ?? []).forEach((y) => (byAid.get(y) ?? []).forEach((b) => {
    if (a !== b) links.push([a, b, seasonAids[a].has(x) && seasonAids[b].has(y) && chain(x) === chain(y)]);
  }))));
  // 模糊：作品名相似度 Dice ≥ 0.8（實測 18 萬組不同作品只有 2 組超過，都是同系列的外傳）
  const grams = list.map((w) => bigrams(w.base));
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++)
    if (grams[a].size >= 2 && grams[b].size >= 2 && dice(grams[a], grams[b]) >= FUZZY) links.push([a, b, true, true]);
  const ok = (a, b) => !list[a].pinned && !list[b].pinned && !isApart(a, b);
  for (const [a, b, direct, fuzzy] of links) {
    if (!direct || !ok(a, b) || find(a) === find(b)) continue;
    if (fuzzy) log.push([list[a].base, list[b].base]);
    unite(a, b);
  }
  for (const [a, b, direct] of links) {
    if (direct || !ok(a, b) || find(a) === find(b)) continue;
    const [ra, rb] = [find(a), find(b)];
    // 兩邊都有系列、也都知道系列鏈，鏈卻沒有交集 → 不串連；查不到對應（沒有鏈）的照舊合併
    if (series[ra] && series[rb] && chains[ra].size && chains[rb].size && ![...chains[ra]].some((c) => chains[rb].has(c))) continue;
    unite(a, b);
  }

  const merged = new Map();
  list.forEach((w, i) => { const r = find(i); merged.set(r, [...(merged.get(r) ?? []), w]); });
  const out = [];
  for (const members of merged.values()) {
    // 作品名：有原聲首季的那份，同樣是首季就取名稱最短的（「我的英雄學院」而非「我的英雄學院 : I am a hero too」）
    const rank = (w) => Math.min(...[...w.groups.values()].filter((g) => !g.special && !movieOnly(g) && [...g.dubs.values()].some((d) => d.original)).map((g) => seasonNo(g.name) ?? 1));
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
  // 跨作品的合輯（「Love Live！全系列」）：一半以上的集屬於其他作品的季，就不收，免得別部作品的集出現在這裡
  const seasonOwner = new Map();
  out.forEach((w) => w.groups.forEach((g) => { if (!g.special && !g.coll) ids(g).forEach((e) => seasonOwner.set(e, w.key)); }));
  const crossWork = (key, g) => { const all = [...ids(g)]; return all.filter((e) => seasonOwner.has(e) && seasonOwner.get(e) !== key).length * 2 >= all.length; };
  // OVA、劇場版、特別篇、總集篇形式的清單不是季，歸到劇場版與特別篇（CONTEXT.md）
  const extraLike = (g) => [...g.dubs.values()].every((d) => ['MOVIE', 'OVA', 'SPECIAL'].includes(d.a?.format)) || /\bOVA\b|\bOAD\b|劇場版|剧场版|特別篇|特别篇|總集篇|总集篇|番外/i.test(g.name);
  return out.map(({ key, base, groups }) => {
    for (const g of groups.values()) if (!g.special && !g.coll && extraLike(g)) g.special = true;
    let gs = [...groups.values()].filter((g) => !g.special && !(g.coll && crossWork(key, g))).map((g) => ({ ...g, ids: ids(g) }));
    for (const g of gs) if (!g.coll) g.coll = gs.some((o) => o !== g && o.ids.size < g.ids.size && [...o.ids].every((x) => g.ids.has(x)));
    // 合輯（多季放在同一個清單）拆進各季，觀看者看不到合輯（CONTEXT.md「合輯」）：
    // 每一集看標題的季數標記，沒有就沿用前一集的；整份都沒有標記時，集數又從 1 開始就是下一季。
    // 那一季已經有同片源同配音的清單就不重複放；沒有的補成配音版，或新增一季。判斷不出季的集自成一組
    const noOf = (g) => seasonLabel(g.name, base).no;
    const plain = gs.filter((g) => !g.coll);
    // 集數 → 哪幾季有這一集（日語第 1 季是第 1-28 集 → 國語合輯的第 1-28 集也歸第 1 季）；沒季數的季用名稱當代號
    const nClaims = new Map();
    for (const p of plain) { const no = noOf(p) ?? p.name; for (const d of p.dubs.values()) for (const e of d.episodes) nClaims.set(e.n, new Set([...(nClaims.get(e.n) ?? []), no])); }
    const minClaimed = Math.min(...nClaims.keys());
    const hasFirst = plain.some((p) => noOf(p) === 1);
    // 沒有第 1 季、集數又比已知各季都小 → 第 1 季（葬送的芙莉蓮只有第 2 季的清單，合輯的第 1-28 集）
    const byN = (n) => (nClaims.get(n)?.size === 1 ? [...nClaims.get(n)][0] : nClaims.size && !hasFirst && n < minClaimed ? 1 : null);
    for (const g of gs.filter((x) => x.coll)) {
      for (const [dk, d0] of g.dubs) {
        // 照上架時間走（集數排序會讓各季的集交錯：1、1、2、2…，沿用前一集的季數就會錯）
        const d = { ...d0, episodes: [...d0.episodes].sort((a, b) => (a.at && b.at ? a.at.localeCompare(b.at) : 0)) };
        const marks = d.episodes.map((e) => episodeSeason(e.title));
        const first = marks.find((m) => m != null);
        const parts = new Map(); // 季數（null = 判斷不出）→ 集
        // 沒有標記時看集數重複：第二次出現的第 1 集屬於第 2 季（跟排序無關）；都不重複的判斷不出季
        const nums = d.episodes.map((e) => e.n).filter((n) => n != null);
        const seen = new Map(), repeats = first == null && nums.length === d.episodes.length && new Set(nums).size < nums.length;
        let cur = first != null ? 1 : null;
        // 順序：標題的季數標記 > 已知季的集數範圍（那季同集數已是別支影片就不算）> 沿用前一集 > 集數重複 > 判斷不出
        const claim = (e) => {
          const no = byN(e.n);
          const p = no == null ? null : plain.find((x) => (typeof no === 'string' ? x.name === no : noOf(x) === no));
          return p && [...p.dubs.values()].some((x) => x.episodes.some((h) => h.n === e.n && h.id !== e.id) && x === p.dubs.get(dk)) ? null : no;
        };
        d.episodes.forEach((e, i) => {
          const c = marks[i] == null ? claim(e) : null;
          if (marks[i] != null) cur = marks[i];
          else if (c != null) cur = c;
          else if (repeats) { seen.set(e.n, (seen.get(e.n) ?? 0) + 1); cur = seen.get(e.n); }
          else if (first == null) cur = null;
          parts.set(cur, [...(parts.get(cur) ?? []), e]);
        });
        for (const [no, eps] of parts) {
          const sorted = sortEpisodes(eps);
          const target = no == null ? null : plain.find((p) => (typeof no === 'string' ? p.name === no : noOf(p) === no));
          if (target) {
            const had = target.dubs.get(dk), add = sorted.filter((e) => !(had?.episodes ?? []).some((h) => sameEp(h, e)));
            if (add.length) target.dubs.set(dk, had ? { ...had, episodes: sortEpisodes([...had.episodes, ...add]) } : { ...d, episodes: sorted });
            target.ids = ids(target);
            continue;
          }
          const sub = seasonLabel(g.name, base).sub;
          // 名稱沒副標的合輯（「某作(全部集數)」）判斷不出季的集是本傳：有第 1 季就併進去，沒有就成為第 1 季
          const first1 = no == null && !sub ? plain.find((p) => !p.loose && noOf(p) === 1) : null;
          if (first1) {
            const had = first1.dubs.get(dk), add = sorted.filter((e) => !(had?.episodes ?? []).some((h) => sameEp(h, e)));
            if (add.length) first1.dubs.set(dk, had ? { ...had, episodes: sortEpisodes([...had.episodes, ...add]) } : { ...d, episodes: sorted });
            first1.ids = ids(first1);
            continue;
          }
          const main = no == null && !sub;
          const name = main ? `${base} 第1季` : no == null ? (sub ? g.name : `${base} 全部集數`) : typeof no === 'string' ? no : `${base} 第${no}季`;
          const made = { name, special: false, coll: false, loose: no == null && !main, dubs: new Map([[dk, { ...d, episodes: sorted }]]), order: g.order, ids: new Set(sorted.map((e) => e.id)) };
          if (no == null && [...made.ids].every((x) => plain.some((p) => p.ids.has(x)))) continue; // 全都在別季裡了
          const same = plain.find((p) => p.name === name); // 好幾份合輯拆出的同一組（同一季、或都判斷不出季）合在一起
          if (!same) { plain.push(made); continue; }
          const had = same.dubs.get(dk);
          same.dubs.set(dk, had ? { ...had, episodes: sortEpisodes([...had.episodes, ...sorted.filter((e) => !had.episodes.some((h) => h.id === e.id))]) } : { ...d, episodes: sorted });
          same.ids = ids(same);
        }
      }
    }
    // 保底：合輯裡還有影片沒出現在任何一季（同集數被別支影片佔了），放進「全部集數」，不丟資料
    for (const g of gs.filter((x) => x.coll)) for (const [dk, d] of g.dubs) {
      const left = d.episodes.filter((e) => !plain.some((p) => p.ids.has(e.id)));
      if (!left.length) continue;
      const name = `${base} 全部集數`, loose = plain.find((p) => p.name === name);
      if (!loose) { plain.push({ name, special: false, coll: false, loose: true, dubs: new Map([[dk, { ...d, episodes: sortEpisodes(left) }]]), order: g.order, ids: new Set(left.map((e) => e.id)) }); continue; }
      const had = loose.dubs.get(dk);
      loose.dubs.set(dk, had ? { ...had, episodes: sortEpisodes([...had.episodes, ...left.filter((e) => !had.episodes.some((h) => h.id === e.id))]) } : { ...d, episodes: sortEpisodes(left) });
      loose.ids = ids(loose);
    }
    // 同一部作品裡季數相同的季合成一季：片源或配音不同就並列，同片源同配音的把集合在一起（同一集不重複）
    const hasOrig = (g) => [...g.dubs.values()].some((d) => d.original);
    for (const g of [...plain].sort((a, b) => hasOrig(b) - hasOrig(a))) { // 原聲那份當主體（季名、作品名用它的）
      const no = g.loose ? null : noOf(g);
      if (no == null || !plain.includes(g)) continue;
      const subOf = (x) => norm(seasonLabel(x.name, base).sub);
      for (const o of plain.filter((x) => x !== g && !x.loose && noOf(x) === no && subOf(x) === subOf(g))) { // 「第 2 季」和「第 2 季 act2」是不同季
        for (const [dk, d] of o.dubs) {
          const had = g.dubs.get(dk);
          g.dubs.set(dk, had ? { ...had, episodes: sortEpisodes([...had.episodes, ...d.episodes.filter((e) => !had.episodes.some((h) => sameEp(h, e)))]) } : d);
        }
        g.order = Math.min(g.order, o.order);
        plain.splice(plain.indexOf(o), 1);
      }
      g.ids = ids(g);
    }
    const kept = new Set(plain);
    gs = plain;
    const aidOf = (g) => { const a = new Set([...g.dubs.values()].map((d) => d.aid)); return a.size === 1 ? [...a][0] : null; };
    for (const g of [...gs]) {
      if (!kept.has(g) || !aidOf(g)) continue;
      for (const o of gs) {
        if (o === g || !kept.has(o) || aidOf(o) !== aidOf(g) || noOf(o) !== noOf(g)) continue;
        if ([...o.dubs.keys()].some((l) => g.dubs.has(l))) continue;
        const [main, extra] = [...o.dubs.values()].some((d) => d.original) ? [o, g] : [g, o];
        for (const [l, d] of extra.dubs) main.dubs.set(l, d);
        main.order = Math.min(main.order, extra.order);
        kept.delete(extra);
      }
    }
    const seasons = orderSeasons([...kept].map((g) => ({
      name: g.name, kind: 'season', no: g.loose ? null : seasonLabel(g.name, base).no, order: g.order, dubs: [...g.dubs.values()], ...(g.loose && { loose: true }),
      when: Math.min(...[...g.dubs.values()].map((d) => d.when ?? Infinity)),
    })));
    const specials = [...groups.values()].filter((g) => g.special).sort((a, b) => a.order - b.order)
      .map((g) => ({ name: g.name, kind: 'special', no: Infinity, order: g.order, dubs: [...g.dubs.values()], ...(g.bundle && { bundle: g.bundle }) }));
    return { key, base, seasons: [...seasons, ...specials] };
  });
}

// ── 集的副標：作品頁顯示「第 n 集」＋副標（CONTEXT.md「季」）──
const META = /Muse木棉花|木棉花|^\s*Muse\s*$|腾讯视频|騰訊視頻|阅文动漫|閱文動畫|曼迪|Mighty TV|Ani-One|官方Official|MULTI ?SUB|ENG SUB|^\s*(动漫|動漫|動畫 ?線上看|線上看)\s*$|新番上[线線]/i;
const TAG = /会员|會員|搶先|抢先|字幕|配音|原聲|原声|雙語|双语|日語|國語|粵語|日语|国语|粤语|中日|限時|限时|Ani-One|免費|免费/;

/** 去掉落單的括號：沒有開頭的「)」「】」、沒有結尾的「(」「【」 */
const PAIRS = { ')': '(', '）': '（', '】': '【', '》': '《' };
function balance(t) {
  const out = [], open = [];
  for (const c of t) {
    if (Object.values(PAIRS).includes(c)) { open.push(out.length); out.push(c); } else if (PAIRS[c]) { const i = open.findLastIndex((k) => out[k] === PAIRS[c] || (PAIRS[c] === '(' && out[k] === '（') || (PAIRS[c] === '（' && out[k] === '(')); if (i >= 0) { open.splice(i, 1); out.push(c); } } else out.push(c);
  }
  for (const i of open) out[i] = '';
  return out.join('');
}

/**
 * 一季（一個配音版）每一集的副標：去掉頻道與語言標記、《作品名》、作品名、英文片名、集數與季數，
 * 再去掉同一季每一集都一樣的開頭與結尾（片名、標語）。names：作品名與季名（繁簡都比對）
 */
export function episodeSubs(titles, names = [], cn = false) {
  const variants = [...new Set(names.filter(Boolean).flatMap((n) => [n, toSimp(n), toTrad(n)]))].sort((a, b) => b.length - a.length);
  const stripHead = (seg) => { // 只去掉每一段開頭的作品名（「暴走哈姆醬大量出現！」裡的不動）；頻道寫的作品名較短時，去掉 6 字以上的前段
    let x = seg.trim();
    for (let again = true; again;) {
      again = false;
      for (const v of variants) {
        if (v.length >= 2 && x.startsWith(v)) { x = x.slice(v.length).trim(); again = true; break; }
        let k = 0; while (k < v.length && x[k] === v[k]) k++;
        while (k > 0 && /[第【《(（「]/.test(x[k - 1])) k--; // 「第」、開頭括號留給後面（「鑽石王牌act2 第27話」對上「鑽石王牌act2 第二季」、「暴走哈姆醬【第2回】」）
        if (k >= 6 && /^[\s～~:：\-—、，,第]|^\d/.test(x.slice(k))) { x = x.slice(k).trim(); again = true; break; }
      }
    }
    return x.replace(/^\d{2,4}(?=\D)/, '').trim(); // 開頭的「001」是集數
  };
  const one = (raw) => {
    let s = raw.replace(/[\p{Extended_Pictographic}\u{FE0F}\u200D]/gu, '')
      .replace(/【([^】]*)】/g, (m, x) => (TAG.test(x) ? ' ' : m)).replace(/[(（][^)）]*[)）]/g, (m) => (TAG.test(m) ? ' ' : m)); // 先拿掉標籤，免得被「|」切斷
    s = s.split(/\s*[｜|]\s*|\s{3,}/).filter((seg) => seg.trim() && !META.test(seg) && !(TAG.test(seg) && [...seg.trim()].length <= 10)).map(stripHead).join(' ');
    s = s.replace(/【([^】]*)】/g, (m, x) => (TAG.test(x) || /^第?\s*\d+\s*[回話话集]?$/.test(x) ? ' ' : ` ${x} `)).replace(/[(（][^)）]*[)）]/g, (m) => (TAG.test(m) ? ' ' : m));
    s = s.replace(/《[^》]*》/g, ' ');
    s = s.replace(/第\s*[一二三四五六七八九十]{1,3}\s*[集话話]|第\s*\d+\s*(?:[-~～]\s*\d+\s*)?[話话集回]|\bEP\.?\s*\d+(?:\s*[-~]\s*(?:EP)?\s*\d+)?|#\s*\d+|首播\d*分鐘|\b4K\b/gi, ' ')
      .replace(/第\s*[一二三四五六七八九十\d]+\s*季|(?<![A-Za-z])S\d+(?!\d)|Season\s*\d+/gi, ' ');
    // 中文副標旁邊的英文片名（「Slay The Gods」）不要；整段都是英文的保留
    if (/\p{Script=Han}/u.test(s)) s = s.replace(/(?:^|\s)[A-Za-z][A-Za-z0-9'’:!?&.,\- ]{6,}(?=\s|$)/g, ' ');
    s = balance(s.replace(/[(（【《『][\s\d,，、]*[)）】》』]/g, ' ')); // 「(S2)」「（第六季EP1）」拿掉內容後的空括號、落單的括號
    s = s.replace(/[「」]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-—:：、,，.。·•~～/／]+|[\s\-—:：、,，.·•~～/／]+$/g, '').trim();
    s = s.replace(/^\d{1,4}(?:\s+|$)/, ''); // 開頭殘留的集數（「作戰06【bug】」「目標088」）
    if (TAG.test(s) && [...s].length <= 10) s = ''; // 只剩標籤（頻道打錯的「第9字幕 | 日語原聲)」）
    return cn ? toTrad(s) : s;
  };
  const subs = titles.map(one);
  if (subs.length >= 3) { // 每一集都一樣的開頭、結尾（標語、片名）拿掉；全部一樣就是沒有副標
    const pre = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
    let p = subs.reduce((n, s) => Math.min(n, pre(subs[0], s)), Infinity);
    let q = subs.reduce((n, s) => Math.min(n, pre([...subs[0]].reverse().join(''), [...s].reverse().join(''))), Infinity);
    if (subs.every((s) => s === subs[0])) return subs.map(() => '');
    // 只在詞的邊界切：前後是空白、標點，或接著數字（不切斷數字：「目標088」切在「目標」後）；
    // 「我要招架牛」「我要招架龍」的「我要招架」是集名的一部分，不切
    const sep = (c) => c === undefined || /[\s\p{P}\p{S}]/u.test(c);
    while (p > 0 && /\d/.test(subs[0][p - 1])) p--;
    while (q > 0 && /\d/.test(subs[0][subs[0].length - q])) q--;
    if (p < 2 || !subs.every((s) => sep(s[p - 1]) || sep(s[p]) || /\d/.test(s[p]))) p = 0;
    if (q < 2 || !subs.every((s) => sep(s[s.length - q]) || sep(s[s.length - q - 1]))) q = 0;
    const cut = subs.map((s) => s.slice(p, s.length - q).replace(/^[\s\-—:：、,，·•|｜]+|[\s\-—:：、,，·•|｜]+$/g, '').trim().replace(/^\d{1,4}(?:\s+|$)/, ''));
    // 同一句在一季裡出現 3 次以上：是宣傳語（「鐵騎龍騰，續寫紫川傳奇！」）或英文片名（「Almighty Mage」），不是副標
    const count = new Map(); cut.forEach((s) => count.set(s, (count.get(s) ?? 0) + 1));
    return cut.map((s) => (s && count.get(s) >= 3 ? '' : s));
  }
  return subs;
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
  const story = lines.findIndex((l) => /^\W*(劇情|故事|作品)簡介\W*$/u.test(l.trim())); // 【劇情簡介】、✧劇情簡介✧
  if (story >= 0) {
    lines = lines.slice(story + 1);
    const end = lines.findIndex((l) => /^\s*【|^[゜✧.━\s]{6,}$/.test(l));
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

/**
 * 影片說明當作品簡介。要像一段簡介（有一句 15 字以上、帶標點的句子，不是宣傳行或章節列表）。
 * 下一集的說明第一段不一樣，就是各集劇情（木棉花、Ani-One）：只有第 1 集、而且提到作品名的才當簡介（故事開頭）。
 * 每集一樣的是整部的簡介：提到作品名就用；沒提到（騰訊常不寫片名）時簡介裡寫的《》要是這部
 * （騰訊有些影片放別部的說明）。只有一集的要提到作品名。names：作品名與各季名
 */
/** 同一部片重複上傳的比對鍵：去掉語言／頻道標記、「｜」後的頻道名（版本名留著）、電影／劇場版字樣，編、篇視為同字
 *  （「進擊的巨人-劇場版【前編 紅蓮的弓矢】」＝「【中日雙語字幕】電影「進擊的巨人劇場版-前篇 紅蓮的弓矢」」） */
export const movieKey = (title) => norm(String(title).split(/[｜|]/).filter((s, i) => !i || !META.test(s)).join(' ').replace(/【([^】]*)】/g, (m, x) => (TAG.test(x) || META.test(x) ? '' : x))
  .replace(/[(（][^)）]*(字幕|配音|原聲)[^)）]*[)）]/g, '').replace(/劇場版|剧场版|電影|电影/g, '').replace(/編/g, '篇'));

export function ownDesc(desc, next, names, first = false) {
  const text = cleanDesc(desc), after = cleanDesc(next);
  if (!text || !/[^\n《》【】]{15,}[，。！？；]/.test(text)) return '';
  const keys = names.map((n) => norm(toTrad(n))).filter((k) => k.length >= 2);
  const named = keys.some((n) => norm(toTrad(String(desc))).includes(n));
  const head = (t) => t.split('\n')[0];
  if (after && head(after) !== head(text)) return first && named ? text : '';
  if (named) return text;
  const like = (x) => { const k = norm(x); return keys.some((n) => n.includes(k) || k.includes(n) || dice(bigrams(x), bigrams(n)) >= FUZZY); };
  const marks = [...toTrad(text).matchAll(/《(.+?)》/g)].map((m) => m[1]);
  return after && (!marks.length || marks.some(like)) ? text : '';
}

/**
 * 作品實際看得到的集數：各季的集（同一季的配音版、片源只算一次）＋單篇＋合集補上的集
 * （合集範圍裡沒有單獨上傳的集；整季、整部的全集沒寫範圍，當成全部看得到，回 Infinity）
 */
export function playableEps(seasons) {
  const have = new Map();
  let n = 0;
  for (const s of seasons) {
    if (s.bundle) continue;
    if (s.kind === 'special') { n++; continue; }
    const key = s.no ?? `名:${s.name}`; // 沒季數的季（「I am a hero too」）不能跟第 1 季混在一起
    const set = have.get(key) ?? new Set();
    for (const d of s.dubs) for (const e of d.episodes) set.add(e.n);
    have.set(key, set);
  }
  n += [...have.values()].reduce((k, x) => k + x.size, 0);
  for (const { bundle: b } of seasons.filter((s) => s.bundle)) {
    if (b.a == null) return Infinity;
    const set = b.season ? have.get(b.season) ?? new Set() : new Set([...have.values()].flatMap((x) => [...x]));
    for (let k = b.a; k <= b.b; k++) if (!set.has(k)) { set.add(k); n++; }
  }
  return n;
}

/** 幾乎只有會員限定的作品不收：有會員集、看得到的不到 12 集（一季），而且不到全部的 1/3（docs/adr/0009） */
export const memberLocked = (playable, members) => members > 0 && playable < 12 && playable * 3 < playable + members;
