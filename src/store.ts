// 繼續觀看與我的片單：只存在這個瀏覽器的 localStorage，沒有帳號。以作品為單位；季為單位的舊紀錄（舊 key）直接作廢。
import { reactive, watch } from 'vue';

export interface Progress { ep: string; t: number; at: number; d?: number } // d：這集長度（秒），卡片進度條用

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 無痕模式或額滿：忽略，這只是便利功能 */ }
}

export const progress = reactive<Record<string, Progress>>(load('aniqube:progress:works', {}));
export const myList = reactive<string[]>(load('aniqube:list:works', []));
watch(progress, () => save('aniqube:progress:works', progress), { deep: true });
watch(myList, () => save('aniqube:list:works', myList), { deep: true });
// 有新集的基準：觀看者上次看這部作品時，它的最後更新時間（ISO）；只加進片單、沒看過的，從加入那一刻起算
export const seen = reactive<Record<string, string>>(load('aniqube:seen:works', {}));
watch(seen, () => save('aniqube:seen:works', seen), { deep: true });
// 看過的集：每部作品記下播放超過 30 秒的影片 ID（見 CONTEXT.md「看過」），不設上限
export const watched = reactive<Record<string, string[]>>(load('aniqube:watched:works', {}));
watch(watched, () => save('aniqube:watched:works', watched), { deep: true });

export const inList = (id: string) => myList.includes(id);
export function toggleList(id: string) {
  const i = myList.indexOf(id);
  if (i >= 0) myList.splice(i, 1);
  else { myList.unshift(id); seen[id] ??= new Date().toISOString(); }
}
export const setProgress = (id: string, ep: string, t: number, d?: number) => { progress[id] = { ep, t: Math.floor(t), at: Date.now(), d }; };
export const clearProgress = (id: string) => { delete progress[id]; };

/** 打開作品頁或播放頁：基準更新到作品目前的最後更新時間，有新集的標記就消失 */
export const markSeen = (id: string, updated: string) => { seen[id] = updated; };
/** 片單或繼續觀看裡的作品，在上次看之後又上架了新的集（見 CONTEXT.md「有新集」） */
export function hasNew(w: { id: string; updated: string }): boolean {
  if (!inList(w.id) && !progress[w.id]) return false;
  const base = seen[w.id] ?? (progress[w.id] ? new Date(progress[w.id].at).toISOString() : null);
  return !!base && w.updated > base;
}

export function markWatched(id: string, ep: string) { const l = (watched[id] ??= []); if (!l.includes(ep)) l.push(ep); }
export const isWatched = (id: string, ep: string) => !!watched[id]?.includes(ep);
/** 清除觀看紀錄：進度與看過的集一起清掉（只想從繼續觀看拿掉用 clearProgress） */
export function clearHistory(id: string) { delete progress[id]; delete watched[id]; }
