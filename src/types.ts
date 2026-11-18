export interface Season {
  id: string; title: string; channel: string; origin: string; alt: string[];
  genres: string[]; tags: string[]; year: number | null; season: string | null;
  status: string | null; format: string | null; score: number | null;
  popularity: number; trending: number; eps: number; totalEps: number | null;
  views: number; updated: string; thumb: string; cover: string | null; banner: string | null;
  anilistId: number | null; how: string | null;
}
export interface Catalog { generatedAt: string; channels: { key: string; name: string }[]; seasons: Season[] }
export interface Episode { id: string; n: number; title: string; sec: number; ext: boolean }
export interface Detail { id: string; desc: string; episodes: Episode[] }
