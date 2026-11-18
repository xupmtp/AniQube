// 播放頁快捷鍵（Netflix／YouTube 習慣）。焦點在 YouTube 播放器裡時按鍵由 YouTube 自己處理，這裡收不到。
export type KeyAction =
  | { do: 'toggle' } | { do: 'seek'; by: number } | { do: 'jump'; frac: number }
  | { do: 'fullscreen' } | { do: 'mute' } | { do: 'next' } | { do: 'prev' };

export const KEY_HELP: [string, string][] = [
  ['空白鍵／K', '播放／暫停'], ['← ／ →', '倒退／快轉 10 秒'], ['0～9', '跳到影片的 0%～90%'],
  ['F', '全螢幕'], ['M', '靜音'], ['N ／ P', '下一集／上一集'],
];

/** 按鍵 → 動作；有修飾鍵（Ctrl、Cmd、Alt）就不攔，留給瀏覽器 */
export function keyAction(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === ' ' || k === 'k') return { do: 'toggle' };
  if (k === 'ArrowLeft') return { do: 'seek', by: -10 };
  if (k === 'ArrowRight') return { do: 'seek', by: 10 };
  if (/^[0-9]$/.test(k)) return { do: 'jump', frac: Number(k) / 10 };
  if (k === 'f') return { do: 'fullscreen' };
  if (k === 'm') return { do: 'mute' };
  if (k === 'n') return { do: 'next' };
  if (k === 'p') return { do: 'prev' };
  return null;
}

/** 正在輸入文字或操作下拉選單時不攔按鍵 */
export const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
