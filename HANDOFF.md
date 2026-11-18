# 交接：動漫立方 AniQube

先讀 `CONTEXT.md`（詞彙表）和 `docs/adr/`（兩份決策紀錄），再讀本文件。回覆一律用繁體中文，語氣直接，少用條列。

## 專案是什麼
類 Netflix 的動畫瀏覽網站。影片全部來自 YouTube 官方頻道，只嵌入播放。沒有登入、沒有後端、沒有資料庫。使用者 Simon，台北，熟 Vue 3 / TypeScript。

## 已定案的設計
- 技術：Vue 3 + Vite + TypeScript，手寫 CSS、深色主題、hash 路由，部署 GitHub Pages。每天 GitHub Actions 執行 `npm run sync`，產生靜態 JSON（`public/data/index.json`、`seasons/<id>.json`、`report.json`）並提交。搜尋、篩選、排序都在瀏覽器做。
- 片源頻道（ID 寫死在 `sources.json`）：Muse木棉花-TW `UCgdwtyqBunlRb-i-7PnCssQ`、Ani-One中文官方 `UC45ONEZZfMDZCnEhgYmVu-A`、騰訊視頻動畫 `UCdpiId0eJGnnIvfhpbJIM1w`。只收正片，不收預告、花絮、直播、馬拉松合集。
- 資料模型：一個 YouTube 播放清單 = 一季 = 一張卡片，影片 = 集。不在任何季裡、長度 20 分到 3 小時的影片成為「單篇」。
- 可播的定義：台灣可看、非會員限定、標題沒有「會員搶先看」、非直播。不能嵌入或有年齡限制的集數保留，顯示「前往 YouTube 觀看」。
- 會員限定偵測：YouTube 沒有欄位，用 `UUMO` + 頻道 ID 去掉 `UC` 的非公開播放清單，從所有季清單中扣除。
- 作品對應：anime-offline-database（ODbL）把清理後的標題對到 AniList ID，再向 AniList 取題材、評分、人氣、橫幅等。`manual-matches.json` 可手動覆蓋（`null` = 刻意不對應）。對不上的歸入「未分類」。成人類（Hentai）直接丟棄。
- 前端：首頁主打 + 多列橫向卡片、瀏覽頁（搜尋、題材、製作國、年份、片源、狀態、類型、八種排序）、作品頁、播放頁（IFrame API、續播到秒、自動下一集）、關於頁。「繼續觀看」「我的片單」只存在 localStorage。

## 目前進度
同步端與前端程式都已完成。`npm test`（17 項）、`vue-tsc`、`vite build` 全過。但**從未用真實資料跑過**：開發環境連不到 googleapis.com 和 AniList，只用模擬資料測過。

## 待驗證（請依序做）
1. 用金鑰跑 `npm run sync`，確認三個頻道都抓得到、配額用量合理（預期約 700，上限每天 10,000）、不會誤觸「片庫縮水 30% 即中止」。
2. 檢查 `public/data/report.json`：逐筆看 `unmatched` 與 `guessed`，錯的寫進 `manual-matches.json`，重跑確認對應率。
3. 驗證騰訊「會員搶先看」集數非會員能不能看，決定排除規則要不要放寬（目前全部排除）。
4. `npm run dev` 開站，檢查首頁、瀏覽、作品、播放頁；重點是續播、自動下一集、「前往 YouTube 觀看」備援、手機版版面。
5. 用實際資料檢查題材標籤草稿（異世界、轉生、校園、武術、修仙、武俠、生存、偶像）。

## 還沒決定
- 作品簡介是 AniList 英文原文，要保留、隱藏還是翻譯。
- 韓國動畫延後；作品（跨季合併）留到 v2。
- 上線前把 `src/config.ts` 的 `REPO_URL` 改成真實 repo。

## 金鑰規則（重要）
YouTube API 金鑰只從環境變數 `YOUTUBE_API_KEY` 讀取，**不得寫進任何檔案、設定或提交**，也不要貼進對話。GitHub 上對應的是 repo Secret `YOUTUBE_API_KEY`。對話中曾貼出過一把舊金鑰，應該重新產生（Google Cloud Console → 憑證 → aniqube-sync → 重新產生金鑰）。

## 已知的環境坑
- Node 需 22.15 以上（`zlib.zstdDecompressSync`），Actions 用 Node 24。
- 測試用 glob：`node --test "sync/*.test.mjs"`，不能傳資料夾。
- 目前慣例：非瑣碎邏輯各留一個可執行的檢查，不加多餘抽象。
