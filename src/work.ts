// 作品內的位置：第幾季、哪個配音版、第幾集。播放頁與作品頁共用，純函式所以能直接測。
import type { Detail, Episode, Season } from './types.ts';

export interface Spot { s: number; d: number; i: number }

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

/** 從頭看：第一個非單篇的季、原聲（sync 已把原聲排第一）、第一集 */
export function firstSpot(det: Detail): Spot {
  return { s: Math.max(0, det.seasons.findIndex((x) => x.kind !== 'special')), d: 0, i: 0 };
}

/** 同一個配音版的下一集；這季看完接下一季（略過單篇），下一季沒有這個配音版就用原聲 */
export function nextSpot(det: Detail, p: Spot): Spot | null {
  const dub = det.seasons[p.s].dubs[p.d];
  if (p.i + 1 < dub.episodes.length) return { ...p, i: p.i + 1 };
  if (det.seasons[p.s].kind === 'special') return null;
  for (let s = p.s + 1; s < det.seasons.length; s++) {
    const season = det.seasons[s];
    if (season.kind === 'special') continue;
    return { s, d: Math.max(0, season.dubs.findIndex((x) => x.lang === dub.lang)), i: 0 };
  }
  return null;
}

/** 換配音版：跳到同一集數；那個配音版沒有這集就從第一集開始 */
export function switchDub(det: Detail, p: Spot, d: number): Spot {
  const n = epAt(det, p).n;
  return { s: p.s, d, i: Math.max(0, det.seasons[p.s].dubs[d].episodes.findIndex((e) => e.n === n)) };
}

/** 季在某配音版下的集數列表；其他配音版有、這版沒有的集數也列出，ep 為 null（顯示「無此配音」） */
export function episodeRows(season: Season, d: number): { n: number; ep: Episode | null }[] {
  const own = new Map(season.dubs[d].episodes.map((e) => [e.n, e]));
  const ns = new Set(season.dubs.flatMap((x) => x.episodes.map((e) => e.n)));
  return [...ns].sort((a, b) => a - b).map((n) => ({ n, ep: own.get(n) ?? null }));
}
