// 作品 = 首頁一張卡片；季、配音版、集見 CONTEXT.md
export interface Work {
  id: string; title: string; channel: string; origin: string; alt: string[];
  genres: string[]; tags: string[]; facets: string[]; year: number | null; season: string | null;
  status: string | null; format: string | null; score: number | null;
  popularity: number; trending: number; seasons: number; eps: number; totalEps: number | null;
  views: number; updated: string; thumb: string; cover: string | null; banner: string | null;
  anilistId: number | null; how: string | null;
}
export interface Catalog { generatedAt: string; channels: { key: string; name: string }[]; works: Work[] }
export interface Episode { id: string; n: number; title: string; sec: number; ext: boolean }
export interface Dub { lang: string; list: string | null; episodes: Episode[] }
export interface Season { name: string; kind: 'season' | 'collection' | 'special'; dubs: Dub[] }
// members：有會員限定集時，該季清單的 ID（作品頁連到 YouTube）
export interface Detail { id: string; desc: string; members: string | null; seasons: Season[] }
