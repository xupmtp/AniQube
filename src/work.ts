// 作品內的位置：第幾季、哪個配音版、第幾集。播放頁與作品頁共用，純函式所以能直接測。
// 集數列表是一季裡所有配音版、片源的聯集，同一集只列一次；換配音、換片源只在播放頁、只換那一支（docs/adr/0010）
import type { Detail, Episode, Season } from './types.ts';

export interface Spot { s: number; d: number; i: number }
/** 挑版本時優先的配音與片源（dubChoices 用；列表、上下一集都用預設） */
export interface Pref { lang?: string; ch?: string }
/** 列表的一列：這一集要播的那支（s、d、i），與同一集所有版本的影片 ID（看過的標記用） */
export interface Row extends Spot { n: number; ep: Episode; ids: string[] }

export const epAt = (det: Detail, p: Spot): Episode => det.seasons[p.s].dubs[p.d].episodes[p.i];

/** 影片 ID 在作品裡的位置；找不到回 null */
export function locate(det: Detail, epId: string): Spot | null {
  for (const [s, season] of det.seasons.entries()) {
    for (const [d, dub] of season.dubs.entries()) {
      const i = dub.episodes.findIndex((e) => e.id === epId);
      if (i >= 0) return { s, d, i };
    }
  }
  return null;
}

/** 同一集有好幾支時挑哪支：偏好的配音 > 原聲（sync 把原聲排第一）> 其他配音；同配音再看偏好的片源 > 能站內播 > sync 的順序 */
function rank(season: Season, d: number, ep: Episode, pref: Pref): number[] {
  const x = season.dubs[d], orig = season.dubs[0].lang;
  return [x.lang === (pref.lang ?? orig) ? 0 : x.lang === orig ? 1 : 2, pref.ch && x.ch === pref.ch ? 0 : 1, ep.ext ? 1 : 0, d];
}
const better = (a: number[], b: number[]) => { for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k]; return false; };

/** 季的集數列表：所有配音版、片源的聯集，依集數排，每集挑一支 */
export function unionRows(det: Detail, s: number, pref: Pref = {}): Row[] {
  const season = det.seasons[s], rows = new Map<number, Row & { r: number[] }>();
  season.dubs.forEach((dub, d) => dub.episodes.forEach((ep, i) => {
    const r = rank(season, d, ep, pref), cur = rows.get(ep.n);
    if (!cur) rows.set(ep.n, { s, d, i, n: ep.n, ep, ids: [ep.id], r });
    else { cur.ids.push(ep.id); if (better(r, cur.r)) Object.assign(cur, { d, i, ep, r }); }
  }));
  return [...rows.values()].sort((a, b) => a.n - b.n).map(({ r, ...row }) => row);
}

/** 從頭看：第一個非單篇的季的第一集 */
export function firstSpot(det: Detail): Spot {
  const s = Math.max(0, det.seasons.findIndex((x) => x.kind !== 'special'));
  const { d, i } = unionRows(det, s)[0];
  return { s, d, i };
}

/** 下一集（照預設挑版本，不沿用這一支的配音、片源）；這季看完接下一季（略過單篇），單篇看完就停 */
export function nextSpot(det: Detail, p: Spot): Spot | null {
  const rows = unionRows(det, p.s), k = rows.findIndex((r) => r.n === epAt(det, p).n);
  if (k + 1 < rows.length) return rows[k + 1];
  if (det.seasons[p.s].kind === 'special') return null;
  const s = det.seasons.findIndex((x, j) => j > p.s && x.kind !== 'special');
  return s < 0 ? null : unionRows(det, s)[0];
}

/** 上一集；季的第一集就沒有 */
export function prevSpot(det: Detail, p: Spot): Spot | null {
  const rows = unionRows(det, p.s), k = rows.findIndex((r) => r.n === epAt(det, p).n);
  return k > 0 ? rows[k - 1] : null;
}

/** 這一集有哪些配音：每個配音挑一支（同配音時沿用目前的片源） */
export function dubChoices(det: Detail, p: Spot): { lang: string; spot: Spot }[] {
  const season = det.seasons[p.s], n = epAt(det, p).n, ch = season.dubs[p.d].ch;
  const langs = [...new Set(season.dubs.map((x) => x.lang))];
  return langs.map((lang) => ({ lang, row: unionRows(det, p.s, { lang, ch }).find((r) => r.n === n) }))
    .filter((x) => x.row && season.dubs[x.row.d].lang === x.lang).map(({ lang, row }) => ({ lang, spot: { s: row!.s, d: row!.d, i: row!.i } }));
}

/** 這一集在目前配音下有哪些片源頻道 */
export function sourceChoices(det: Detail, p: Spot): { ch: string; spot: Spot }[] {
  const season = det.seasons[p.s], n = epAt(det, p).n, lang = season.dubs[p.d].lang;
  return season.dubs.flatMap((x, d) => {
    const i = x.lang === lang ? x.episodes.findIndex((e) => e.n === n) : -1;
    return i >= 0 ? [{ ch: x.ch ?? '', spot: { s: p.s, d, i } }] : [];
  });
}
