// 繼續觀看與我的片單：只存在這個瀏覽器的 localStorage，沒有帳號。
import { reactive, watch } from 'vue';

export interface Progress { ep: string; t: number; at: number }

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 無痕模式或額滿：忽略，這只是便利功能 */ }
}

export const progress = reactive<Record<string, Progress>>(load('aniqube:progress', {}));
export const myList = reactive<string[]>(load('aniqube:list', []));
watch(progress, () => save('aniqube:progress', progress), { deep: true });
watch(myList, () => save('aniqube:list', myList), { deep: true });

export const inList = (id: string) => myList.includes(id);
export function toggleList(id: string) {
  const i = myList.indexOf(id);
  if (i >= 0) myList.splice(i, 1); else myList.unshift(id);
}
export const setProgress = (id: string, ep: string, t: number) => { progress[id] = { ep, t: Math.floor(t), at: Date.now() }; };
export const clearProgress = (id: string) => { delete progress[id]; };
