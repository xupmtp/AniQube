import type { Catalog, Detail } from './types.ts';

const url = (p: string) => `${import.meta.env.BASE_URL}data/${p}`;
let catalog: Promise<Catalog> | null = null;

export function loadCatalog(): Promise<Catalog> {
  catalog ??= fetch(url('index.json')).then((r) => {
    if (!r.ok) throw new Error(`片庫載入失敗 (${r.status})`);
    return r.json() as Promise<Catalog>;
  });
  return catalog;
}

export async function loadDetail(id: string): Promise<Detail> {
  const r = await fetch(url(`works/${encodeURIComponent(id)}.json`));
  if (!r.ok) throw new Error(`找不到這部作品 (${r.status})`);
  return r.json() as Promise<Detail>;
}
