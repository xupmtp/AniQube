# AniQube 與主流串流站的功能落差

調查日期：2026-11-18。比較對象：Netflix（最細）、巴哈姆特動畫瘋、Crunchyroll，另簡短參考 bilibili 番劇。

## 來源說明（先讀）

- 競品功能只採一手來源：官方說明中心、官方網站頁面、官方新聞、官方 App 商店頁的開發者描述、官方 API 文件。每條陳述後面的方括號是來源代號，對應文末「來源」一節。
- **動畫瘋的官方頁面（ani.gamer.com.tw、gnn.gamer.com.tw、m.gamer.com.tw、prj.gamer.com.tw）對自動抓取一律回 403**，無法直接開啟。動畫瘋的陳述只用兩種依據：(1) App Store 上開發者自己寫的描述（可直接讀取）[B1]；(2) 搜尋引擎對動畫瘋官方頁面的索引摘要（標「摘要」）。巴哈姆特哈啦板上的使用者討論不算官方，相關內容一律標「未經官方證實」。
- **Crunchyroll 說明中心（help.crunchyroll.com）的文章內文用 JavaScript 載入，抓取只拿到標題**；陳述依據為官方說明中心文章的搜尋摘要與文章標題，已逐條附連結。
- 「未見」= 在官方來源中找不到；不等於確定沒有。

## 1. AniQube 現有功能（從程式碼讀出）

**發現**

- 首頁主打（Hero）：近 7 天有更新、有橫幅的作品中取趨勢前 5 隨機挑一個，逐層放寬。`src/catalog.ts`（`pickHero`）、`src/components/Hero.vue`
- 首頁橫列：繼續觀看、我的片單、最近更新、趨勢、人氣（前 10 名，大數字排名樣式）、作品數最多的 6 個題材各一列、日本動畫、中國動畫；每列有「查看全部」連到瀏覽頁的對應條件。`src/views/Home.vue`、`src/components/Row.vue`
- 搜尋：導覽列搜尋框（中文、日文、英文名）跳到瀏覽頁。`src/components/Navbar.vue`
- 瀏覽頁：關鍵字、題材與標籤（多選）、製作國、年份、狀態（連載中／已完結）、類型（TV、劇場版、OVA⋯），八種排序（人氣、評分、趨勢、首播時間、最近更新、觀看數、集數、名稱）；條件存在網址 query，可直接分享；每次顯示 60 部、「顯示更多」。`src/views/Browse.vue`、`src/catalog.ts`（`SORTS`、`filterWorks`、`sortWorks`）
- 卡片：封面、AniList 評分、年份／類型／狀態、前三個題材。`src/components/Card.vue`

**作品頁**（`src/views/Title.vue`）

- 橫幅背景、封面、評分、題材＋標籤、AniList 英文簡介。
- 有會員限定集時提示並連到 YouTube 清單。
- 「播放／繼續觀看」按鈕、加入／移出我的片單。
- 季與配音版下拉切換（換季沿用目前配音）；集數列表含長度、目前看到的集高亮、「在 YouTube 觀看」標記、「無此配音」占位；劇場版／特別篇另列。

**觀看**（`src/views/Watch.vue`、`src/player.ts`）

- YouTube IFrame API 嵌入，自動播放；續播到秒（每 5 秒記一次，前 3 秒不記）。
- 播完自動下一集，並跨季接續；整部看完清除進度。
- 上一集／下一集按鈕，側欄集數列表，季與配音版切換。
- 站外集或播放器錯誤時改顯示「前往 YouTube 觀看」。
- 播放速度、畫質、CC 字幕：AniQube 沒有自己的控制項，但 YouTube 嵌入播放器本身的設定選單有這些功能 [Y5][Y6][Y7]，觀看者可直接使用。用標準網域嵌入，YouTube Premium 登入者無廣告（`src/player.ts` 註解、`src/views/About.vue`）。

**個人化**（`src/store.ts`）

- 繼續觀看：每部作品記錄集 ID、秒數、時間戳，存 localStorage（`aniqube:progress:works`）。
- 我的片單：作品 ID 陣列，存 localStorage（`aniqube:list:works`）。
- 沒有帳號、沒有觀看紀錄頁、沒有從繼續觀看移除的按鈕、沒有評分。

**其他**

- 關於頁：版權、資料來源、隱私、片庫最後更新時間。`src/views/About.vue`
- hash 路由，每個作品、每一集都有固定網址。`src/router.ts`
- 同步端已抓但前端沒用到的資料：每集上架時間（`sync/cache/raw.json` 的 `at`）；YouTube API 回應中有、但同步時丟掉的：播放清單簡介（`playlists` 的 `snippet.description`）、影片是否有字幕（`contentDetails.caption`）[Y4]、影片說明（可能含章節時間）。`sync/run.mjs` 第 52–76 行。

## 2. 功能對照表

符號：✅ 有　◐ 部分／有條件　✗ 沒有　？ 未經官方證實（括號內為找到的線索）

### 發現

| 功能 | Netflix | 動畫瘋 | Crunchyroll | AniQube |
|---|---|---|---|---|
| 首頁個人化推薦 | ✅ 依觀看紀錄、評分等推薦 [N1] | ◐ 「主題式作品推薦」[B1]（是否個人化未見） | ？ | ◐ 主打與橫列依人氣／趨勢，非個人化 |
| 分類／篩選 | ✅ 可依類型瀏覽 [N2] | ✅ 所有動畫：分類（電影、泡麵番⋯）、標籤、對象（闔家觀賞、付費會員、年齡限制）、排序 [B4 摘要] | ？（官方有「What shows are available」[C14]，篩選細節未讀到） | ✅ 題材、標籤、製作國、年份、狀態、類型 |
| 搜尋 | ✅ [N2] | ？（App 描述未列 [B1]） | ✅（Android 說明列有清除搜尋紀錄 [C9]） | ✅ 中日英名 |
| 排行 | ✅ Top 10 列，每週更新，另有 top10.netflix.com [N3][N4] | ◐ 首頁可「依平均人氣排列」[B2 摘要]；獨立排行榜？ | ？ | ✅ 人氣前 10；可依觀看數、趨勢排序 |
| 即將上架 | ✅ New & Hot 的 Coming Soon [N5] | ✅ 季度新番首播時間公告 [B3 摘要] | ✅ Simulcast Calendar [C1] | ✗ |

### 觀看

| 功能 | Netflix | 動畫瘋 | Crunchyroll | AniQube |
|---|---|---|---|---|
| 續播 | ✅ Continue Watching 列，可移除 [N6] | ✅ 記錄上次看到的集數與時間 [B1] | ✅（iOS 繼續觀看小工具 [C10]） | ✅ 到秒 |
| 自動下一集 | ✅ 可開關 [N7]；「你還在看嗎？」提示 [N8] | ？ | ✅ [C2] | ✅ 跨季接續；不能關 |
| 跳過片頭 | ✅（快捷鍵 S）[N9][N10] | ？（只見第三方腳本，非官方） | ◐ 僅 Premium、非所有作品；片尾、前情提要尚不能跳 [C3] | ✗ |
| 播放速度 | ◐ 有，但廣告方案的網頁版不支援 [N11] | ✅ Beta 播放器增加速率層級，快捷鍵 Shift+> / < [B5 摘要] | ✅（官方說明中心有「How do I change my playback speed?」文章，內文未能讀取）[C13] | ◐ 用 YouTube 播放器內建 [Y5] |
| 字幕／配音切換 | ✅ Audio & Subtitles 選單 [N12]；字幕外觀可調 [N13] | ？ | ✅ 字幕 [C4]、配音 [C5]；部分日語作品字幕不能關 [C6] | ◐ 配音版下拉（各自清單）；字幕靠 YouTube CC，有無看上傳者 [Y7] |
| 畫質 | ✅ 依方案與網路 [N14] | ◐ 1080p 為付費訂閱權益（片源未達者除外）[B1] | ？ | ◐ YouTube 播放器自選 [Y6] |
| 鍵盤快捷鍵 | ✅ [N9] | ✅ D 彈幕、T 劇院、F 全螢幕、M 靜音 [B6 摘要] | ？ | ◐ 只有 YouTube 播放器自己的 [Y8] |

### 個人化

| 功能 | Netflix | 動畫瘋 | Crunchyroll | AniQube |
|---|---|---|---|---|
| 片單 | ✅ My List，集中在 My Netflix [N15] | ◐ 訂閱動畫 [B1]（片單形式未見） | ✅ Watchlist [C7]、自訂清單 Crunchylists [C9] | ✅ 本機 |
| 觀看紀錄 | ✅ 可查看、下載、隱藏 [N16][N17] | ✅ 與巴哈帳號同步 [B1]；超過 90 天清除？（論壇使用者說法） | ✅ 可清除 [C9] | ◐ 只有每部作品最後一集，沒有紀錄頁 |
| 使用者評分 | ✅ 不喜歡／喜歡／超愛，影響推薦 [N18] | ？ | ✅ 星等評分保留 [C8] | ✗（只顯示 AniList 平均分） |
| 多人設定檔 | ✅ [N19] | ？（帳號制，設定檔未見） | ✅ 最多 5 個 [C11]；青少年設定檔 [C15]、設定檔 PIN [C16] | ✗ |

### 追番

| 功能 | Netflix | 動畫瘋 | Crunchyroll | AniQube |
|---|---|---|---|---|
| 新番時間表 | ◐ Coming Soon（以上架日為主）[N5] | ✅ 週期表、本季新番 [B2 摘要] | ✅ Simulcast Calendar，依星期列出、可篩 Premium [C1] | ✗ |
| 更新提醒 | ✅ Remind Me，上架時通知或寄信並自動加入 My List [N20]；App 通知可設定 [N21] | ✅ 訂閱後新集上架即時通知 [B1] | ？ | ✗ |
| 追蹤作品 | ✅ Remind Me [N20] | ✅ 訂閱 [B1] | ✅ Watchlist [C7] | ◐ 我的片單，但沒有「有新集」標記 |

### 社群

| 功能 | Netflix | 動畫瘋 | Crunchyroll | AniQube |
|---|---|---|---|---|
| 彈幕 | ✗ 未見 | ✅ 彈幕，可調不透明度、字體大小，自訂過濾關鍵字 [B1][B6 摘要] | ✗ 未見 | ✗ |
| 留言 | ✗ 未見 | ？ | ✗ 已移除所有使用者留言 [C8] | ✗ |
| 分享 | ✅ 行動裝置作品頁的 Share [N22]；Moments 片段分享 [N23] | ？ | ？ | ◐ 每個作品與每集都有固定網址，但沒有分享按鈕 |

### 其他

| 功能 | Netflix | 動畫瘋 | Crunchyroll | AniQube |
|---|---|---|---|---|
| 下載離線 | ✅ iOS／Android [N24] | ？（App 描述未列 [B1]；論壇使用者說不支援） | ✅ 行動裝置與 Switch，有期限 [C12] | ✗ |
| 跨裝置同步 | ✅ 帳號／設定檔層級（觀看紀錄在帳號頁 [N16]） | ✅ 觀看紀錄跟著巴哈帳號 [B1] | ？（帳號制推定） | ✗ 只有本機 |
| 家長控制 | ✅ 設定檔分級、封鎖個別作品 [N25] | ◐ 所有動畫可篩「闔家觀賞」「年齡限制」[B4 摘要] | ✅ 各設定檔內容分級限制 [C17] | ◐ 同步時丟棄 Hentai；YouTube 年齡限制集只能站外看 |
| 無廣告 | ◐ 依方案 [N26] | ◐ 付費無廣告 NT$100／月 [B1]；2016 年起 [B7] | ◐ 依方案 | ◐ 廣告由 YouTube 決定；Premium 登入無廣告 |

### 參考：bilibili 番劇（簡述）

官方有新番時間表頁 [L1]，番劇索引可依追番人數、更新時間、最高評分、播放數量、開播時間排序 [L2]；國創另有時間表 [L3]。功能面與動畫瘋同屬「時間表＋追番＋彈幕」型，不另細比。

## 3. 落差分析

判斷基準就是 HANDOFF 與 ADR 0001 的前提：靜態站、無後端無帳號、只能嵌 YouTube 而且不能改動或遮擋播放器（[Y2] III.I.6「modify, build upon, or block any portion or functionality of a YouTube player」；[Y1] 不得在播放器前方放任何視覺元素）、YouTube 資料 30 天內須刷新或刪除（[Y2] III.E.4，每日同步已符合）、每日配額 10,000（同步用約 3,000）。

| 缺的功能 | 判定 | 理由 |
|---|---|---|
| 新番時間表 | **可行** | 每集上架時間已在 `raw.json`（`at`），`npm run rebuild` 就能算出每部連載中作品「通常星期幾幾點上片」，0 配額。AniList 的 `nextAiringEpisode`／`airingSchedule` [A1][A2] 可加進現有那次 AniList 查詢，但那是日本首播時間，不是 YouTube 上片時間，只宜當輔助。 |
| 片單「有新集」標記 | **可行** | 純前端：在 localStorage 記住上次看到某作品時的集數，和片庫的 `eps` 比。 |
| 推播／Email 更新提醒 | **不可行**（推播）／**部分可行**（訂閱檔） | Web Push 需要伺服器保存訂閱與發送，違反無後端前提。但同步時可以多產一個靜態 RSS／Atom 或 iCal 檔（每部作品一個或全站一個），讓觀看者用 RSS 閱讀器或行事曆訂閱，這是靜態站做得到的「提醒」。 |
| 跨裝置同步 | **不可行**（自動）／**部分可行**（手動） | 自動同步要伺服器狀態（ADR 0001 已寫明做不到）。可做「匯出／匯入」：把片單與進度存成 JSON 檔或塞進一段網址片段，在另一台裝置開啟即匯入。 |
| 觀看紀錄頁、從繼續觀看移除 | **可行** | `progress` 已有時間戳，`clearProgress` 已存在，只缺 UI。若要每集「已看」勾選，需在 store 多存一組已看集 ID。 |
| 使用者評分 | **部分可行** | 本機的喜歡／不喜歡可以做，用來調整本機推薦或隱藏作品；全站平均或他人評分要後端，不可行（已用 AniList 平均分替代）。 |
| 個人化推薦 | **部分可行** | AniList Media 有 `recommendations` 欄位（「看過這部的人也推薦」），可放進同一次查詢；前端再依本機觀看紀錄的題材挑「因為你看了 X」。不是 Netflix 那種協同過濾，但不需後端。 |
| 多人設定檔 | **部分可行，價值低** | 可以用 localStorage 分命名空間做本機多設定檔，但同一台瀏覽器多人共用的情境少；家長若要管控，本機設定也擋不住小孩。 |
| 自動下一集開關 | **可行** | 純前端設定，存 localStorage。 |
| 跳過片頭 | **部分可行** | 播放器外放一顆按鈕呼叫 `seekTo` [Y3]：`seekTo` 是 API 文件明列的功能，不是在播放器上加疊層，應不違反 [Y1][Y2]，但條款沒有明文談自訂跳轉按鈕，屬灰色地帶，要自行判斷。真正的難點是**時間標記資料**：YouTube 不提供片頭位置；只能 (1) 人工維護 JSON（每季一個片頭秒數，同一季多半固定），或 (2) 同步時保留影片說明，解析頻道若有寫的章節時間（是否有寫未查證）。 |
| 跳過片尾 | **部分可行** | 同上；另一種做法是「片尾開始就顯示下一集按鈕」，同樣需要時間標記。 |
| 播放速度、畫質、字幕切換（站內控制項） | **不需要做** | YouTube 播放器的設定選單已提供 [Y5][Y6][Y7]。IFrame API 有 `setPlaybackRate` 但不保證生效，也沒有設定畫質的函式 [Y3]。站內可以做的是標示「本集有 CC 字幕」：`contentDetails.caption` 在現有的 videos 請求裡就有 [Y4]，只是沒存，0 額外配額。 |
| 中文簡介 | **可行（待驗證資料）** | 現在用 AniList 英文。`playlists` 請求的 `snippet` 已含清單簡介，現在被丟掉；改成保留只需重抓一次，不多花配額。各頻道清單簡介寫得多完整未查證，要先看資料。 |
| 彈幕 | **不可行** | 需要即時寫入與讀取他人資料的伺服器；而且彈幕要疊在播放器畫面上，違反 [Y1] 不得在播放器前方顯示任何元素。 |
| 留言 | **部分可行** | 自己做要後端，不可行。可嵌第三方留言（例如用 GitHub Discussions 的服務），但觀看者要登入 GitHub、需要審核人力，Crunchyroll 也已因社群安全移除留言 [C8]；建議不做或最後再議。 |
| 分享按鈕 | **可行** | 網址已可分享；加一顆按鈕用瀏覽器原生分享功能（不支援時複製網址）。 |
| 下載離線 | **不可行** | 條款禁止分離、修改 YouTube 影音內容 [Y2] III.I.7；也沒有可存的檔案。 |
| 家長控制 | **部分可行** | 本機「闔家模式」可隱藏有特定 AniList 題材／標籤的作品；但本機設定擋不住人，且 AniList 沒有台灣分級，只能粗略過濾。 |
| 鍵盤快捷鍵（站內，例如 N 下一集） | **可行** | 純前端；播放器取得焦點時按鍵會被 YouTube iframe 吃掉，只在焦點在頁面上時有效。 |
| 每週觀看數排行 | **部分可行** | 需要上一次同步的觀看數做差值：同步端多存一份上次的 `views`（已在 repo 內提交的 JSON 裡就有），0 額外配額。但 YouTube 觀看數是累計，新上架的集會自然灌高，排行要以作品為單位正規化。 |

## 4. 建議清單（價值高、成本低在前）

1. **片單／繼續觀看的「有新集」標記與首頁「片單有更新」列** — 追番使用者最常回來看的理由就是「有沒有出新集」，動畫瘋與 Netflix 都有提醒 [B1][N20]。只動前端（`src/store.ts` 多存上次看到的集數，`Card.vue`、`Home.vue` 顯示）；資料來自既有的 `Work.eps`／`updated`。
2. **新番時間表頁（依星期列出連載中作品的 YouTube 上片時間）** — 動畫瘋、Crunchyroll、bilibili 都把它放在主要入口 [B2][C1][L1]。同步端在 rebuild 時從 `raw.json` 每集的 `at` 算出每部作品慣常的星期與時段，寫進 `index.json`（0 配額）；前端加 `/schedule` 路由。AniList `nextAiringEpisode` 可作備援 [A1]。
3. **觀看紀錄管理：從繼續觀看移除、每集已看標記** — Netflix 有移除與隱藏紀錄 [N6][N17]，Crunchyroll 可清紀錄 [C9]。只動前端：`clearProgress` 已存在，加按鈕；store 多存已看集 ID，`Title.vue`／`Watch.vue` 集數列表打勾。
4. **匯出／匯入本機資料** — 沒有帳號下唯一能換裝置的方法，也防止清快取後片單全失。只動前端（`About.vue` 或新設定區塊）：下載／讀取 JSON 檔，或產生帶資料的網址片段。
5. **中文簡介改用頻道播放清單簡介** — 解決 HANDOFF 裡「簡介是英文」的待決事項，台灣觀眾讀得懂。同步端在 `fetchChannel` 保留 `playlists` 的 `snippet.description`（下次同步即有，不多花配額），沒有時退回 AniList 英文；前提是先抽查各頻道簡介品質。
6. **相似作品列（作品頁）＋「因為你看了 X」首頁列** — 補個人化推薦的缺口 [N1]。同步端在現有 AniList 查詢加 `recommendations`（只保留片庫內有的作品 ID）；前端 `Title.vue` 加一列，`Home.vue` 依 localStorage 進度挑最近看過的一部。
7. **分享按鈕** — Netflix 有分享 [N22]；AniQube 已有固定網址，只差一顆按鈕。只動前端（`Title.vue`、`Watch.vue`），用瀏覽器原生分享，不支援時複製網址。
8. **自動下一集開關＋站內快捷鍵（N 下一集、P 上一集）** — Netflix 讓使用者關自動下一集 [N7]，有人只想看一集。只動前端：`Watch.vue` 的 `ended()` 讀一個 localStorage 設定。
9. **RSS／iCal 更新訂閱檔** — 在不能推播的前提下最接近「更新提醒」的做法 [N20][B1]。同步端產生 `public/data/feed.xml`（每次同步新增的集）；前端在作品頁與關於頁放訂閱連結。
10. **跳過片頭按鈕（人工時間標記，先做熱門連載）** — 價值高（Netflix 說每天被按 1.36 億次 [N10]），但要人工維護資料，且條款屬灰色地帶，所以排最後。同步端新增 `manual-intros.json`（季清單 ID → 片頭起訖秒數）帶進 `works/<id>.json`；前端在播放器**外**的控制列顯示按鈕並呼叫 `seekTo`。

明確不建議：彈幕（需後端且會遮擋播放器 [Y1]）、下載離線（違反 [Y2] III.I.7）、自動跨裝置同步與推播（需後端，ADR 0001）。

## 來源

**Netflix（help.netflix.com、about.netflix.com）**

- [N1] How Netflix's Recommendations System Works — https://help.netflix.com/en/node/100639
- [N2] How to search and browse Netflix — https://help.netflix.com/en/node/47765
- [N3] Top 10 lists aren't showing — https://help.netflix.com/en/node/116472
- [N4] Netflix Top 10 — https://top10.netflix.com
- [N5] Updated layout, navigation, Clips feed, and more for the Netflix mobile app（New & Hot：Coming Soon、Top 10）— https://help.netflix.com/en/node/575087423404644 ；How to find out about new shows and movies — https://help.netflix.com/en/node/14422
- [N6] How to remove titles from the 'Continue Watching' row — https://help.netflix.com/en/node/115312
- [N7] How to autoplay the next episode — https://help.netflix.com/en/node/121518
- [N8] Why Netflix asks, 'Are you still watching?' — https://help.netflix.com/en/node/114059
- [N9] Using keyboard shortcuts on Netflix（Skip intro：S）— https://help.netflix.com/en/node/24855
- [N10] Looking Back on the Origin of Skip Intro Five Years Later — https://about.netflix.com/en/news/looking-back-on-the-origin-of-skip-intro-five-years-later
- [N11] How to change playback speed — https://help.netflix.com/en/node/116584
- [N12] How to use subtitles, captions, or choose audio language — https://help.netflix.com/en/node/372
- [N13] How to change the appearance of subtitles and closed captions — https://help.netflix.com/en/node/100267
- [N14] How to get the best video quality — https://help.netflix.com/en/node/13444
- [N15] Introducing My Netflix — https://about.netflix.com/en/news/introducing-my-netflix-a-one-stop-shop-for-series-and-movies-you-want-to
- [N16] How to see viewing history and device activity — https://help.netflix.com/en/node/101917
- [N17] How to hide titles from viewing history — https://help.netflix.com/en/node/22205
- [N18] How to rate TV shows and movies — https://help.netflix.com/en/node/9898
- [N19] How to create, edit, or delete profiles — https://help.netflix.com/en/node/10421
- [N20] How to be reminded of upcoming TV shows or movies — https://help.netflix.com/en/node/101522
- [N21] How to turn Netflix app notifications on or off — https://help.netflix.com/en/node/64175
- [N22] How to share TV shows and movies on mobile devices — https://help.netflix.com/en/node/464
- [N23] Clip to save, rewatch, and share your favorite Netflix moments — https://help.netflix.com/en/node/210664027435620
- [N24] How to use 'Download Next Episode' — https://help.netflix.com/en/node/101262 ；Downloads missing from the Netflix app — https://help.netflix.com/en/node/65679
- [N25] How to set profile maturity ratings or block titles — https://help.netflix.com/en/node/114276
- [N26] Ads on Netflix — https://help.netflix.com/en/node/126831

**巴哈姆特動畫瘋**（官方網域對自動抓取回 403；B1 為直接讀取，其餘為官方頁面的搜尋摘要）

- [B1] 《巴哈姆特動畫瘋》App Store 頁（開發者描述：彈幕、訂閱通知、觀看紀錄同步、續看紀錄、手勢、主題式推薦；訂閱方案「無廣告30天自動訂閱」NT$100／月，含 1080p）— https://apps.apple.com/tw/app/%E5%B7%B4%E5%93%88%E5%A7%86%E7%89%B9%E5%8B%95%E7%95%AB%E7%98%8B/id1102650114
- [B2] 動畫瘋首頁（本季新番、週期表、依更新日／平均人氣排列）— https://ani.gamer.com.tw/
- [B3] 動畫瘋 2026 秋季新番公告（GNN）— https://gnn.gamer.com.tw/detail.php?sn=312660
- [B4] 所有動畫（分類、標籤、排序、闔家觀賞／付費會員／年齡限制）— https://ani.gamer.com.tw/animeList.php ；年齡限制篩選 — https://ani.gamer.com.tw/animeList.php?target=%E5%B9%B4%E9%BD%A1%E9%99%90%E5%88%B6
- [B5] 播放頁 Beta 播放器改善說明（劇院／全螢幕發彈幕、增加播放速率層級）— https://ani.gamer.com.tw/animeVideo.php?sn=52079
- [B6] 播放頁彈幕設定與快捷鍵說明 — https://ani.gamer.com.tw/animeVideo.php?sn=51819
- [B7] 【公告】動畫瘋服務正式開啟（站務中心，含 2016 年付費無廣告上線）— https://forum.gamer.com.tw/C.php?bsn=60404&snA=24057

**Crunchyroll**（help.crunchyroll.com 內文以 JavaScript 載入，依據為官方文章標題與搜尋摘要）

- [C1] Simulcast Calendar — https://www.crunchyroll.com/simulcastcalendar
- [C2] Autoplay is not playing the correct episode — https://help.crunchyroll.com/hc/en-us/articles/19201059936532
- [C3] Skip Intro 功能說明（德文／西文版，同一篇文章 ID）— https://help.crunchyroll.com/hc/de/articles/20369940738708 、https://help.crunchyroll.com/hc/es/articles/20369940738708
- [C4] How do I change the subtitle language? — https://help.crunchyroll.com/hc/en-us/articles/22934571555476
- [C5] Comment changer la langue de l'audio ? — https://help.crunchyroll.com/hc/fr/articles/20762279453076
- [C6] Why can't I turn off subtitles for some content? — https://help.crunchyroll.com/hc/en-us/articles/31142616234772
- [C7] Why can't I add shows to my watchlist? — https://help.crunchyroll.com/hc/en-us/articles/18201548955796
- [C8] Why is Crunchyroll Disabling Comments?（移除所有使用者留言，保留星等評分）— https://help.crunchyroll.com/hc/en-us/articles/28154006791188
- [C9] How do I watch Crunchyroll on my Android device?（Crunchylists、清除觀看與搜尋紀錄）— https://help.crunchyroll.com/hc/en-us/articles/22701390449044
- [C10] What is a widget? (iOS) — https://help.crunchyroll.com/hc/en-us/articles/8160377089940
- [C11] How do I change my username?（最多 5 個設定檔）— https://help.crunchyroll.com/hc/en-us/articles/18487122414484
- [C12] How do I download content to watch offline? — https://help.crunchyroll.com/hc/en-us/articles/19203280609172
- [C13] 播放速度：官方說明中心相關文章標題「How do I change my playback speed?」出現在 [C8] 等頁面的相關文章列表，文章本身未能讀取
- [C14] What shows are available on Crunchyroll? — https://help.crunchyroll.com/hc/en-us/articles/26355675707412
- [C15] How do I set up and manage a teen profile? — https://help.crunchyroll.com/hc/en-us/articles/45826848365588
- [C16] How do I create a profile PIN? — https://help.crunchyroll.com/hc/en-us/articles/45829641876884
- [C17] Understanding Content Ratings and Restrictions — https://help.crunchyroll.com/hc/en-us/articles/29883830192788

**bilibili**

- [L1] 新番时间表 — https://www.bilibili.com/anime/timeline/
- [L2] 番剧索引 — https://www.bilibili.com/anime/index/
- [L3] 国创 — https://www.bilibili.com/guochuang/

**YouTube／AniList 官方文件**

- [Y1] YouTube API Services — Required Minimum Functionality（不得在嵌入播放器前方顯示任何視覺元素；最小 200×200）— https://developers.google.com/youtube/terms/required-minimum-functionality
- [Y2] YouTube API Services — Developer Policies（III.E.4 資料 30 天刷新；III.I.6 不得修改或封鎖播放器；III.I.7 不得分離影音）— https://developers.google.com/youtube/terms/developer-policies
- [Y3] YouTube IFrame Player API Reference（`seekTo`、`setPlaybackRate` 不保證生效、無設定畫質函式、captions 模組）— https://developers.google.com/youtube/iframe_api_reference
- [Y4] YouTube Data API — Videos resource（`contentDetails.caption`、`contentRating.ytRating`）— https://developers.google.com/youtube/v3/docs/videos
- [Y5] Speed up or slow down YouTube videos — https://support.google.com/youtube/answer/7509567
- [Y6] Change the quality of your video — https://support.google.com/youtube/answer/91449
- [Y7] Manage caption settings — https://support.google.com/youtube/answer/100078
- [Y8] Keyboard shortcuts for YouTube — https://support.google.com/youtube/answer/7631406
- [A1] AniList — Media Reference（`nextAiringEpisode`、`airingSchedule`、`recommendations`）— https://docs.anilist.co/reference/object/media（docs.anilist.co 對自動抓取回 403，欄位依官方文件的搜尋摘要）
- [A2] AniList — AiringSchedule Reference（`airingAt`、`timeUntilAiring`、`episode`）— https://docs.anilist.co/reference/object/airingschedule
