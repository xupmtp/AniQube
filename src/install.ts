// 加到主畫面（PWA，不做 service worker）：Android／電腦 Chrome 用瀏覽器的安裝事件叫出系統視窗；iPhone 只能照步驟手動加
import { reactive } from 'vue';

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

/** 已經用主畫面的 App 開啟（全螢幕模式） */
export const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
/** iPhone、iPad 的 Safari（iPad 會假裝成 Mac，看有沒有觸控） */
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

export const install = reactive<{ prompt: InstallPrompt | null }>({ prompt: null });
// 事件只在頁面載入時送一次，要在一開始就接住（main.ts 會載入這個檔）
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); install.prompt = e as InstallPrompt; });
addEventListener('appinstalled', () => { install.prompt = null; });

/** Android／電腦：叫出系統安裝視窗；按過一次事件就失效 */
export async function promptInstall() {
  const p = install.prompt;
  if (!p) return;
  await p.prompt();
  await p.userChoice;
  install.prompt = null;
}
