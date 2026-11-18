// YouTube IFrame Player API 載入器。用標準網域（非 nocookie），這樣 Premium 會員登入時才不會有廣告。
export interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  getCurrentTime(): number;
  destroy(): void;
}
interface YTNamespace { Player: new (el: HTMLElement, opts: unknown) => YTPlayer }

let api: Promise<YTNamespace> | null = null;
export function loadYT(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
  api ??= new Promise((resolve, reject) => {
    if (w.YT?.Player) return resolve(w.YT);
    w.onYouTubeIframeAPIReady = () => resolve(w.YT as YTNamespace);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { api = null; reject(new Error('無法載入 YouTube 播放器')); };
    document.head.appendChild(s);
  });
  return api;
}
