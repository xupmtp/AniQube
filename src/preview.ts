// 卡片預覽（仿 Netflix）：桌面滑鼠停留後放大成預覽卡，觸控裝置點卡片從底部彈出面板。
// 全站只有一個預覽，畫在橫列外面，才不會被可捲動的列裁掉。
import { reactive } from 'vue';
import type { Work } from './types.ts';

export const preview = reactive<{ work: Work | null; rect: DOMRect | null; resume: boolean; sheet: boolean }>({ work: null, rect: null, resume: false, sheet: false });

let timer = 0;
export const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

/** 滑鼠停在卡片上 450ms 才展開，掃過去不會一直跳出來 */
export function hoverIn(work: Work, el: Element, resume: boolean) {
  clearTimeout(timer);
  timer = window.setTimeout(() => Object.assign(preview, { work, rect: el.getBoundingClientRect(), resume, sheet: false }), 450);
}
/** 離開卡片：稍等一下，滑鼠若移進預覽卡就取消 */
export function hoverOut() {
  clearTimeout(timer);
  timer = window.setTimeout(close, 120);
}
export const keep = () => clearTimeout(timer);
export function openSheet(work: Work, resume: boolean) { clearTimeout(timer); Object.assign(preview, { work, rect: null, resume, sheet: true }); }
export function close() { clearTimeout(timer); Object.assign(preview, { work: null, rect: null, sheet: false }); }
