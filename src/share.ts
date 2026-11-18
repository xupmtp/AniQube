// 分享：手機與支援的瀏覽器開系統分享選單（LINE、訊息⋯），不支援就複製網址並提示
import { reactive } from 'vue';

export const toast = reactive({ text: '' });
let hide = 0;
export function say(text: string) { toast.text = text; clearTimeout(hide); hide = window.setTimeout(() => { toast.text = ''; }, 2200); }

/** hash 路由的完整網址（保留 GitHub Pages 的子路徑） */
export const pageUrl = (path: string) => `${location.origin}${location.pathname}#${path}`;

export async function share(title: string, url: string) {
  if (navigator.share) {
    try { await navigator.share({ title, text: title, url }); } catch { /* 使用者取消：不用提示 */ }
    return;
  }
  try { await navigator.clipboard.writeText(url); say('已複製連結'); } catch { say('無法複製，請手動複製網址列'); }
}

/** 秒數 → 「12:34」或「1:02:03」 */
export function clock(sec: number) {
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}
