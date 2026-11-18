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
// 觀看紀錄的排序依據：每部作品最後一次播放的時間（ms）
export const lastWatched = reactive<Record<string, number>>(load('aniqube:last:works', {}));
watch(lastWatched, () => save('aniqube:last:works', lastWatched), { deep: true });
// 設定（設定頁）：之後新增的偏好也放這裡
export interface Settings { autoplay: boolean }
export const settings = reactive<Settings>({ autoplay: true, ...load<Partial<Settings>>('aniqube:settings', {}) });
watch(settings, () => save('aniqube:settings', settings), { deep: true });

export const inList = (id: string) => myList.includes(id);
export function toggleList(id: string) {
  const i = myList.indexOf(id);
  if (i >= 0) myList.splice(i, 1);
  else { myList.unshift(id); seen[id] ??= new Date().toISOString(); }
}
export const setProgress = (id: string, ep: string, t: number, d?: number) => { progress[id] = { ep, t: Math.floor(t), at: Date.now(), d }; lastWatched[id] = Date.now(); };
export const clearProgress = (id: string) => { delete progress[id]; };

/** 打開作品頁或播放頁：基準更新到作品目前的最後更新時間，有新集的標記就消失 */
export const markSeen = (id: string, updated: string) => { seen[id] = updated; };
/** 片單或繼續觀看裡的作品，在上次看之後又上架了新的集（見 CONTEXT.md「有新集」） */
export function hasNew(w: { id: string; updated: string }): boolean {
  if (!inList(w.id) && !progress[w.id]) return false;
  const base = seen[w.id] ?? (progress[w.id] ? new Date(progress[w.id].at).toISOString() : null);
  return !!base && w.updated > base;
}

export function markWatched(id: string, ep: string) { const l = (watched[id] ??= []); if (!l.includes(ep)) l.push(ep); lastWatched[id] = Date.now(); }
export const isWatched = (id: string, ep: string) => !!watched[id]?.includes(ep);
/** 清除觀看紀錄：進度與看過的集一起清掉（只想從繼續觀看拿掉用 clearProgress） */
export function clearHistory(id: string) { delete progress[id]; delete watched[id]; delete lastWatched[id]; }
/** 觀看紀錄：有看過的集或有進度的作品，依最後觀看時間新到舊；沒有時間的（舊紀錄）排最後 */
export const historyIds = () => [...new Set([...Object.keys(watched), ...Object.keys(progress)])]
  .map((id) => ({ id, at: lastWatched[id] ?? progress[id]?.at ?? 0 }))
  .sort((a, b) => b.at - a.at);

// ── 備份與還原：沒有帳號，換裝置靠檔案搬資料 ──
export interface Backup { app: 'aniqube'; version: 1; exportedAt: string; list: string[]; progress: Record<string, Progress>; watched: Record<string, string[]>; seen: Record<string, string>; last: Record<string, number>; settings?: Partial<Settings> }

export const exportBackup = (): Backup => ({
  app: 'aniqube', version: 1, exportedAt: new Date().toISOString(),
  list: [...myList], progress: { ...progress }, watched: { ...watched }, seen: { ...seen }, last: { ...lastWatched }, settings: { ...settings },
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** 匯入的檔案來自外部：格式不對整份拒絕，個別欄位不對就略過那一筆 */
export function parseBackup(text: string): Backup | null {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return null; }
  if (!isObj(j) || j.app !== 'aniqube') return null;
  const progressIn: Record<string, Progress> = {};
  for (const [k, p] of Object.entries(isObj(j.progress) ? j.progress : {})) {
    if (isObj(p) && typeof p.ep === 'string' && typeof p.t === 'number' && typeof p.at === 'number') {
      progressIn[k] = { ep: p.ep, t: p.t, at: p.at, ...(typeof p.d === 'number' && { d: p.d }) };
    }
  }
  const watchedIn: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(isObj(j.watched) ? j.watched : {})) { const l = strs(v); if (l.length) watchedIn[k] = l; }
  const seenIn: Record<string, string> = {};
  for (const [k, v] of Object.entries(isObj(j.seen) ? j.seen : {})) if (typeof v === 'string') seenIn[k] = v;
  const lastIn: Record<string, number> = {}; // 較早的備份檔沒有這欄
  for (const [k, v] of Object.entries(isObj(j.last) ? j.last : {})) if (typeof v === 'number') lastIn[k] = v;
  const settingsIn: Partial<Settings> = {};
  if (isObj(j.settings) && typeof j.settings.autoplay === 'boolean') settingsIn.autoplay = j.settings.autoplay;
  return { app: 'aniqube', version: 1, exportedAt: typeof j.exportedAt === 'string' ? j.exportedAt : '', list: strs(j.list), progress: progressIn, watched: watchedIn, seen: seenIn, last: lastIn, settings: settingsIn };
}

/** 合併進這台裝置：片單、看過取聯集；同一部作品的進度留較新的；有新集的基準留較晚的 */
export function mergeBackup(b: Backup): { list: number; progress: number; watched: number } {
  let list = 0, prog = 0, eps = 0;
  for (const id of b.list) if (!myList.includes(id)) { myList.push(id); list++; }
  for (const [id, p] of Object.entries(b.progress)) if (!progress[id] || p.at > progress[id].at) { progress[id] = p; prog++; }
  for (const [id, l] of Object.entries(b.watched)) for (const ep of l) if (!isWatched(id, ep)) { markWatched(id, ep); eps++; }
  for (const [id, t] of Object.entries(b.seen)) if (!seen[id] || t > seen[id]) seen[id] = t;
  for (const [id, t] of Object.entries(b.last)) if (!lastWatched[id] || t > lastWatched[id]) lastWatched[id] = t;
  Object.assign(settings, b.settings ?? {}); // 設定以備份檔為準：還原就是要回到那時的偏好
  return { list, progress: prog, watched: eps };
}
