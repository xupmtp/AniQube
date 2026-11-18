# 對應覆核流程（排程代理每週執行）

每天同步後，`public/data/report.json` 會列出還沒對上 AniList 的季（`unmatched`）與用猜的對應（`guessed`）。這份流程把它們清掉：查出正確的 AniList 編號，寫進 `manual-matches.json`，直接提交到 `main`。推上去後 GitHub Action 會用快取重建資料並部署。

## 準備

```bash
nvm use 22 || true          # 需要 Node ≥ 22.15（zstd）
npm ci
mkdir -p sync/cache && git fetch -q --depth 1 origin data-cache && git show FETCH_HEAD:raw.json > sync/cache/raw.json
npm run rebuild             # 不需要 YouTube 金鑰、不花配額
```

`report.json` 的 `unmatched`、`guessed` 都是空的、`fuzzy` 也沒有錯併，就結束，不要提交任何東西。

## 每一筆怎麼判斷

1. 從標題取出作品名：去掉【頻道】、表情符號、「(繁中字幕)」「2026年10月新番」等雜訊。
2. 想出日文原名或羅馬拼音，用 AniList GraphQL 搜（`https://graphql.anilist.co`，`Page(perPage:5){media(search:$s,type:ANIME){id format seasonYear episodes title{native romaji}}}`）。中文搜通常查不到；Bangumi（`api.bgm.tv/search/subject/<關鍵字>?type=2`）可輔助查日文名。遇到 429 等 60 秒再試。
3. 選對的那一筆：
   - **季數要對**：標題寫第 2 季、S3、「2nd Attack」就選那一季，不是第一季。`guessed` 裡 `how: noseason` 幾乎都是對到了前作。
   - **形式要對**：劇場版選 MOVIE，OVA/OAD 選 OVA，總集篇、特別篇對到所屬那一季。
   - 多季合輯（「S1-S4」「全部集數」）對到第一季。
   - 片名本身就帶續作字樣的（「超電磁砲Ｓ」「act II」）以標題為準，不要往後推一季。
4. 寫進 `manual-matches.json`：key 是清單 ID（單篇影片是 `v-` 加影片 ID），value 是 AniList 編號。`guessed` 裡原本就對的也寫進去鎖定，之後就不會再列出來。
5. 查不到、或沒把握的：**不要寫**，留在 `unmatched`，在提交訊息裡列出來。寧可缺資料也不要對錯。

key 依字母排序、一個空格縮排（`JSON.stringify(obj, null, 1)`），檔尾換行。

## 檢查模糊合併

`report.json` 的 `fuzzy` 列出只靠名稱相似度（Dice ≥ 0.8）合併的作品名配對。逐一確認是同一部作品；不是的（外傳、換主角的新系列）在 `manual-works.json` 把其中一邊的清單指定為自己的作品名拆開，並在提交訊息裡註明。

## 檢查合併

對到同一個 AniList 編號、或有續作關係的季會被併成同一部作品。寫完後：

```bash
git show HEAD:public/data/index.json > /tmp/old.json
npm run rebuild
```

比對前後 `index.json` 的作品清單：消失的作品是被併進別的作品了。逐一確認是同一部作品的續作、劇場版或特別篇。**不同系列**（換主角、換學校的新系列，例如 MyGO 不是 BanG Dream! 第一部、Sunshine 不是 Love Live! 第一部）被併在一起時，在 `manual-works.json` 把該清單指定為自己的作品名（`"清單ID": "作品名"`），再 rebuild 確認。

最後跑 `npm test`，要全部通過。

## 提交

- 只提交 `manual-matches.json`、`manual-works.json`。`public/data` 不用提交，Action 會重建；結束前（包括什麼都沒改的時候）`git checkout -- public/data` 還原 rebuild 產生的變動。
- 直接提交到 `main` 並推送，提交前先 `git pull --rebase`。
- 提交訊息：`data: weekly match review YYYY-MM-DD`，內文列出改了幾筆、修正了哪些錯的對應、哪些查不到。

## 不要做

- 不要改 `sync/`、`src/` 等程式碼，也不要改這份流程以外的規則；發現規則本身有問題，寫在提交訊息裡就好。
- 不要跑 `npm run sync`（需要 YouTube 金鑰），也不要把任何金鑰寫進檔案。
