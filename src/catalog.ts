// 篩選、排序、顯示用的純函式；沒有 Vue、沒有網路，所以能直接測。
import type { Season } from './types.ts';

export const SORTS = {
  popularity: '人氣', score: '評分', trending: '趨勢', year: '首播時間',
  updated: '最近更新', views: '觀看數', eps: '集數', title: '名稱',
} as const;
export type SortKey = keyof typeof SORTS;

export const FORMATS: Record<string, string> = {
  TV: 'TV 動畫', TV_SHORT: '短篇動畫', MOVIE: '劇場版', ONA: '網路動畫', OVA: 'OVA', SPECIAL: '特別篇', SINGLE: '單篇', MUSIC: '音樂',
};
export const STATUS: Record<string, string> = {
  RELEASING: '連載中', FINISHED: '已完結', NOT_YET_RELEASED: '未播出', CANCELLED: '已取消', HIATUS: '暫停中',
};
export const ORIGINS: Record<string, string> = { JP: '日本', CN: '中國', KR: '韓國', TW: '台灣' };
const SEASON_ORDER: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };

export interface Filters {
  q: string; genres: string[]; origin: string; year: string; channel: string; status: string; format: string;
}
export const emptyFilters = (): Filters => ({ q: '', genres: [], origin: '', year: '', channel: '', status: '', format: '' });

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export function filterSeasons(all: Season[], f: Filters): Season[] {
  const q = norm(f.q);
  return all.filter((s) => {
    if (q && !norm([s.title, ...s.alt].join(' ')).includes(q)) return false;
    if (f.genres.some((g) => !s.genres.includes(g) && !s.tags.includes(g))) return false;
    if (f.origin && s.origin !== f.origin) return false;
    if (f.year && String(s.year) !== f.year) return false;
    if (f.channel && s.channel !== f.channel) return false;
    if (f.status && s.status !== f.status) return false;
    if (f.format && s.format !== f.format) return false;
    return true;
  });
}

const when = (s: Season) => (s.year == null ? -1 : s.year * 10 + (SEASON_ORDER[s.season ?? ''] ?? 0));

export function sortSeasons(list: Season[], key: SortKey): Season[] {
  const out = [...list];
  switch (key) {
    case 'popularity': return out.sort((a, b) => b.popularity - a.popularity);
    case 'score': return out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    case 'trending': return out.sort((a, b) => b.trending - a.trending);
    case 'year': return out.sort((a, b) => when(b) - when(a));
    case 'updated': return out.sort((a, b) => b.updated.localeCompare(a.updated));
    case 'views': return out.sort((a, b) => b.views - a.views);
    case 'eps': return out.sort((a, b) => b.eps - a.eps);
    case 'title': return out.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
  }
}

/** 出現次數最多的題材與標籤（首頁分類列、瀏覽頁篩選用） */
export function topGenres(all: Season[], n: number): string[] {
  const c = new Map<string, number>();
  for (const s of all) for (const g of [...s.genres, ...s.tags]) c.set(g, (c.get(g) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
}

/** 主打：近 7 天有更新、有橫幅、已對應的季，取趨勢最高 5 個隨機挑一個；都沒有就放寬 */
export function pickHero(all: Season[], now = Date.now(), rnd = Math.random): Season | null {
  const week = new Date(now - 7 * 864e5).toISOString();
  const tiers = [
    (s: Season) => s.banner && s.anilistId && s.updated >= week,
    (s: Season) => s.banner && s.anilistId,
    (s: Season) => s.banner,
    () => true,
  ];
  for (const ok of tiers) {
    const pool = sortSeasons(all.filter(ok), 'trending').slice(0, 5);
    if (pool.length) return pool[Math.floor(rnd() * pool.length)];
  }
  return null;
}

export const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
export const posterOf = (s: Season) => s.banner ?? thumbUrl(s.thumb);
export const ytUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function fmtDur(sec: number): string {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} 時 ${m % 60} 分` : `${m} 分`;
}

export function metaLine(s: Season): string {
  const parts = [s.year ? String(s.year) : '', FORMATS[s.format ?? ''] ?? '', s.status ? STATUS[s.status] ?? '' : '',
    // 合併多季的清單（S1-S5）常對到第一季，集數會超過總集數，這時只顯示可看集數
    s.totalEps && s.eps <= s.totalEps ? `${s.eps} / ${s.totalEps} 集` : `${s.eps} 集可看`];
  return parts.filter(Boolean).join(' · ');
}

/** 集標題去掉字幕標示、頻道標記與「｜」之後的宣傳尾巴 */
export function epTitle(t: string): string {
  const s = t.replace(/[(（][^)）]*(字幕|原聲|配音)[^)）]*[)）]/g, '').replace(/【Ani-One[^】]*】/g, '').replace(/\s*[｜|].*$/, '').trim();
  return s || t;
}
