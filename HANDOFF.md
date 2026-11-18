# 交接：動漫立方 AniQube

先讀 `CONTEXT.md`（詞彙表）和 `docs/adr/`（三份決策紀錄），再讀本文件。回覆一律用繁體中文，語氣直接，少用條列。

## 專案是什麼
類 Netflix 的動畫瀏覽網站。影片全部來自 YouTube 官方頻道，只嵌入播放。沒有登入、沒有後端、沒有資料庫。

## 已定案的設計
- 技術：Vue 3 + Vite + TypeScript，手寫 CSS、深色主題、hash 路由，部署 GitHub Pages。每天 GitHub Actions 執行 `npm run sync`，產生靜態 JSON（`public/data/index.json`、`works/<id>.json`、`report.json`）並提交。抓下來的 YouTube 原始資料存在 `sync/cache/raw.json`，改任何規則用 `npm run rebuild` 重跑，不花配額。搜尋、篩選、排序都在瀏覽器做。
- 片源頻道（ID 寫死在 `sources.json`）：Muse木棉花-TW `UCgdwtyqBunlRb-i-7PnCssQ`、Ani-One中文官方 `UC45ONEZZfMDZCnEhgYmVu-A`、騰訊視頻動畫 `UCdpiId0eJGnnIvfhpbJIM1w`。只收正片，不收預告、花絮、直播、馬拉松合集。
- 資料模型（ADR 0003）：一張卡片 = 一部作品 = 同一頻道內作品名相同的所有季；國語／日語等清單是同一季的配音版；合輯被單季涵蓋就不列；劇場版等單篇歸入所屬作品。`manual-works.json` 可人工指定清單屬於哪部作品。
- 可播的定義：台灣可看、非會員限定、標題沒有「會員搶先看」、非直播。不能嵌入或有年齡限制的集數保留，顯示「前往 YouTube 觀看」。
- 會員限定偵測：YouTube 沒有欄位，用 `UUMO` + 頻道 ID 去掉 `UC` 的非公開播放清單，從所有季清單中扣除。
- 作品對應：anime-offline-database（ODbL）把清理後的標題對到 AniList ID，再向 AniList 取題材、評分、人氣、橫幅等。`manual-matches.json` 可手動覆蓋（`null` = 刻意不對應）。對不上的歸入「未分類」。成人類（Hentai）直接丟棄。
- 前端：首頁主打 + 多列橫向卡片、瀏覽頁（搜尋、題材、製作國、年份、片源、狀態、類型、八種排序）、作品頁、播放頁（IFrame API、續播到秒、自動下一集並跨季接續、季與配音版下拉切換）、關於頁。「繼續觀看」「我的片單」只存在 localStorage。

## 目前進度
已上線：https://xupmtp.github.io/AniQube/ （repo xupmtp/AniQube，每天台灣早上 4 點自動同步並部署，一次約 3,000 配額單位）。原本的五項待驗證都已完成：真實資料同步、對應率約 92%（`manual-matches.json` 約 100 筆）、騰訊「会员抢先看」實測為公開影片所以不排除、站面與續播／自動下一集／YouTube 備援實測、標籤補到 15 個。

## 已知的待辦
- 約 100 個清單沒對上 AniList（多為特別篇、OVA、總集篇），缺題材與評分但可播。
- 名稱差很多的季（例如「The Final Season」）不會自動併入作品，要寫進 `manual-works.json`。
- 不跨頻道合併：Muse 和 Ani-One 都有的作品會是兩張卡。

## 還沒決定
- 作品簡介是 AniList 英文原文，要保留、隱藏還是翻譯。
- 韓國動畫延後。

## 金鑰規則（重要）
YouTube API 金鑰只從環境變數 `YOUTUBE_API_KEY` 讀取，**不得寫進任何檔案、設定或提交**，也不要貼進對話。GitHub 上對應的是 repo Secret `YOUTUBE_API_KEY`。對話中曾貼出過一把舊金鑰，應該重新產生（Google Cloud Console → 憑證 → aniqube-sync → 重新產生金鑰）。

## 已知的環境坑
- Node 需 22.15 以上（`zlib.zstdDecompressSync`），Actions 用 Node 24。
- 測試用 glob：`node --test "sync/*.test.mjs"`，不能傳資料夾。
- 目前慣例：非瑣碎邏輯各留一個可執行的檢查，不加多餘抽象。
