// 作品 = 首頁一張卡片；季、配音版、集見 CONTEXT.md
export interface Work {
  id: string; title: string; channel: string; origin: string; alt: string[];
  genres: string[]; tags: string[]; facets: string[]; year: number | null; season: string | null;
  status: string | null; format: string | null; score: number | null;
  popularity: number; trending: number; seasons: number; eps: number; totalEps: number | null;
  views: number; updated: string; thumb: string; cover: string | null; banner: string | null;
  anilistId: number | null; how: string | null;
  memberEps?: number; // 會員限定（不在片庫內）的集數
  bundles?: number; // 合集影片支數（docs/adr/0006）
}
// moved：分組規則改變（例如跨頻道合併）後，舊作品 ID → 新作品 ID；舊網址轉址、本機紀錄搬移用
export interface Catalog { generatedAt: string; channels: { key: string; name: string; label?: string }[]; works: Work[]; moved?: Record<string, string> }
// sub：集的副標（同步時從標題取出，見 CONTEXT.md「季」）；title 是 YouTube 原標題
// part：拆成兩半的集是哪一半（後半的 n 是 x.5，顯示用 epNo）
export interface Episode { id: string; n: number; part?: '上' | '下'; title: string; sub?: string; sec: number; ext: boolean }
// ch：片源頻道（同一季可能有好幾個頻道上傳，觀看者可以切換）
export interface Dub { lang: string; ch?: string; list: string | null; episodes: Episode[] }
// kind=special 是「劇場版與特別篇」（CONTEXT.md），type 標示劇場版／OVA／特別篇／總集篇／合集；bundle：合集影片
export interface Season { name: string; kind: 'season' | 'special'; type?: string; bundle?: boolean; dubs: Dub[] }
// members：有會員限定集時，該季清單的 ID（作品頁連到 YouTube）
// descLang：zh = 頻道寫的中文簡介，en = 退回 AniList 英文原文
// similar：相似作品的作品 ID（CONTEXT.md「相似作品」），同步時算好
export interface Detail { id: string; desc: string; descLang?: 'zh' | 'en'; members: string | null; seasons: Season[]; similar?: string[] }
