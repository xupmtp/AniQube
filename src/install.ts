// 加到主畫面（PWA，不做 service worker）：Android／電腦 Chrome 用瀏覽器的安裝事件叫出系統視窗；iPhone 只能照步驟手動加
import { reactive } from 'vue';

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

/** 已經用主畫面的 App 開啟（全螢幕模式） */
export const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
/** iPhone、iPad（iPad 會假裝成 Mac，看有沒有觸控） */
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

/**
 * 這個瀏覽器怎麼加到主畫面。有系統安裝視窗的（Chrome、Edge、Samsung 等收到安裝事件）給按鈕；
 * 不能叫出視窗的照瀏覽器給步驟；LINE、Facebook、IG 等 App 內建瀏覽器不能安裝，請改用瀏覽器開；
 * 電腦上沒有安裝事件的（Firefox、Safari）不顯示
 */
export function installGuide(hasPrompt: boolean, ua = navigator.userAgent): { button: boolean; steps: string[]; inApp?: boolean } | null {
  if (/Line\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|Messenger|Twitter|TikTok|musical_ly/i.test(ua)) return { button: false, inApp: true, steps: ['這是 App 內建的瀏覽器，不能加到主畫面', '點右上角的「⋯」或分享，選「用瀏覽器開啟」', '在瀏覽器裡再到這一頁安裝'] };
  if (hasPrompt) return { button: true, steps: [] };
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) {
    if (/CriOS/.test(ua)) return { button: false, steps: ['點網址列右邊的「分享」', '選「加入主畫面」', '按「新增」'] };
    if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return { button: false, steps: ['點瀏覽器選單（≡ 或 ⋯）裡的「分享」', '選「加入主畫面」', '按「新增」'] };
    return { button: false, steps: ['點 Safari 下方的「分享」', '選「加入主畫面」', '按右上角「新增」'] };
  }
  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return { button: false, steps: ['點下方的選單「≡」', '選「新增頁面至」→「主畫面」'] };
    if (/Firefox/.test(ua)) return { button: false, steps: ['點右上角選單「⋮」', '選「安裝」或「加到主畫面」'] };
    return { button: false, steps: ['點瀏覽器選單（⋮ 或 ≡）', '選「安裝應用程式」或「加到主畫面」'] };
  }
  return null;
}

export const install = reactive<{ prompt: InstallPrompt | null }>({ prompt: null });
// 事件只在頁面載入時送一次，要在一開始就接住（main.ts 會載入這個檔）
if (typeof window !== 'undefined') { // 測試（Node）沒有 window
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); install.prompt = e as InstallPrompt; });
  addEventListener('appinstalled', () => { install.prompt = null; });
}

/** Android／電腦：叫出系統安裝視窗；按過一次事件就失效 */
export async function promptInstall() {
  const p = install.prompt;
  if (!p) return;
  await p.prompt();
  await p.userChoice;
  install.prompt = null;
}
