// 作品 = 首頁一張卡片；季、配音版、集見 CONTEXT.md
export interface Work {
  id: string; title: string; channel: string; origin: string; alt: string[];
  genres: string[]; tags: string[]; facets: string[]; year: number | null; season: string | null;
  status: string | null; format: string | null; score: number | null;
  popularity: number; trending: number; seasons: number; eps: number; totalEps: number | null;
  views: number; updated: string; thumb: string; cover: string | null; banner: string | null;
  anilistId: number | null; how: string | null;
}
// moved：分組規則改變（例如跨頻道合併）後，舊作品 ID → 新作品 ID；舊網址轉址、本機紀錄搬移用
export interface Catalog { generatedAt: string; channels: { key: string; name: string; label?: string }[]; works: Work[]; moved?: Record<string, string> }
export interface Episode { id: string; n: number; title: string; sec: number; ext: boolean }
// ch：片源頻道（同一季可能有好幾個頻道上傳，觀看者可以切換）
export interface Dub { lang: string; ch?: string; list: string | null; episodes: Episode[] }
export interface Season { name: string; kind: 'season' | 'collection' | 'special'; dubs: Dub[] }
// members：有會員限定集時，該季清單的 ID（作品頁連到 YouTube）
// descLang：zh = 頻道寫的中文簡介，en = 退回 AniList 英文原文
export interface Detail { id: string; desc: string; descLang?: 'zh' | 'en'; members: string | null; seasons: Season[] }
