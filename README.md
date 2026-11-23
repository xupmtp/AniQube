# 動漫立方 AniQube

**繁體中文** | [English](README.en.md)

類 Netflix 的動畫瀏覽網站。影片全部來自 YouTube 官方頻道（Muse 木棉花、Ani-One 中文官方、騰訊視頻動畫），站上只嵌入播放。純靜態網站，沒有後端與資料庫。

網站：<https://xupmtp.github.io/AniQube/>

## 運作方式
每天 GitHub Actions 執行 `npm run sync`：用 YouTube Data API 抓三個頻道的播放清單，比對 AniList 的作品資料，產生 `public/data/` 底下的 JSON，提交後建置並部署到 GitHub Pages。瀏覽器只讀這些 JSON，搜尋、篩選、排序都在本機做。

架構、各程式職責、資料格式與同步流程的完整說明見 [docs/architecture.html](docs/architecture.html)。

## 為什麼有些集只能去 YouTube 看
站上只用 YouTube 的嵌入播放器，下面兩種影片在 YouTube 上能看、在站上不能播，作品頁標「在 YouTube 觀看」，播放頁顯示「這一集無法在站內播放」與前往 YouTube 的按鈕：
- **頻道關閉嵌入**：上傳的頻道在影片設定裡關掉「允許嵌入」，只開放在 youtube.com 或 App 觀看（例：曼迪的《亂世千金》第 1 話，首播集常這樣做）。
- **年齡限制**：YouTube 標成限制級的影片要登入並確認年齡，嵌入播放器一律不能播。

這是頻道與 YouTube 的設定，依 YouTube 條款不能繞過，所以不修。同步時每支影片約每 7 天重查一次，頻道之後重新開放嵌入，最慢一週內會自動恢復站內播放。2026-11 全站約 27 集（2 集關閉嵌入、25 集年齡限制）。

## 第一次設定
1. 建立 GitHub repo（public），推上所有檔案；Settings → Pages → Source 選 GitHub Actions。
2. Settings → Secrets and variables → Actions 新增 `YOUTUBE_API_KEY`。
3. 把 `src/config.ts` 的 `REPO_URL` 改成你的 repo。
4. Actions 頁手動執行 `sync-and-deploy`。

## 本機
需要 Node 22.15 以上。
```
npm install
YOUTUBE_API_KEY=你的金鑰 npm run sync   # 約 3,000 單位配額，上限每天 10,000
npm run rebuild   # 改規則後用：重用上次抓的 YouTube 資料，不花配額、免金鑰
npm run dev
npm test
```
金鑰只從環境變數 `YOUTUBE_API_KEY` 讀取，程式與設定檔裡都沒有它。

## 調整
- `public/data/report.json`：每次同步的報告。`unmatched` 是沒對上 AniList 的播放清單，`guessed` 是用猜的對應（建議抽查）。
- `manual-matches.json`：`{"播放清單ID": AniList編號}` 手動指定；填 `null` 表示刻意不對應。手動優先於自動。
- `manual-works.json`：`{"播放清單ID": "作品名"}` 手動指定清單屬於哪部作品（自動是看標題去掉季數與配音後是否相同）。
- `sources.json`：頻道、長度門檻、標題排除與會員標記的正規表示式。
- `sync/taxonomy.mjs`：題材與標籤的中文名稱。

## 授權
程式碼 MIT。作品名稱對照使用 anime-offline-database（ODbL-1.0），AniList 資料依其條款使用。影片版權屬各頻道。
