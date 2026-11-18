import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyFilters, filterWorks, sortWorks, topGenres, pickHero, fmtDur, metaLine, epTitle } from './catalog.ts';
import type { Work } from './types.ts';

const s = (o: Partial<Work>): Work => ({
  id: 'x', title: '某作品', channel: 'muse', origin: 'JP', alt: [], genres: [], tags: [], facets: [], year: 2024, season: 'SPRING',
  status: 'FINISHED', format: 'TV', score: 80, popularity: 1, trending: 0, seasons: 1, eps: 12, totalEps: 12, views: 0,
  updated: '2026-01-01T00:00:00Z', thumb: 't', cover: null, banner: null, anilistId: 1, how: 'single', ...o,
  facets: o.facets ?? [...(o.genres ?? []), ...(o.tags ?? [])],
});
const all = [
  s({ id: 'a', title: '間諜家家酒', alt: ['Spy x Family', 'スパイファミリー'], genres: ['動作', '喜劇'], popularity: 100, score: 81, year: 2022, season: 'SPRING', views: 5 }),
  s({ id: 'b', title: '仙逆', origin: 'CN', channel: 'tencent', genres: ['奇幻'], tags: ['修仙'], popularity: 300, score: null, year: 2023, season: 'FALL', status: 'RELEASING', updated: '2026-11-15T00:00:00Z', views: 50 }),
  s({ id: 'c', title: '鬼滅之刃', genres: ['動作', '奇幻'], popularity: 200, score: 85, year: 2019, season: 'SPRING', format: 'MOVIE', views: 20 }),
];
const ids = (l: Season[]) => l.map((x) => x.id).join('');

test('搜尋比對中文名、英文別名、日文別名，忽略大小寫與標點', () => {
  const f = (q: string) => ids(filterWorks(all, { ...emptyFilters(), q }));
  assert.equal(f('間諜'), 'a');
  assert.equal(f('SPY X family'), 'a');
  assert.equal(f('スパイ'), 'a');
  assert.equal(f('spy-x-family!'), 'a');
  assert.equal(f('不存在'), '');
});

test('篩選：題材（含標籤）要全部符合，其餘欄位精確比對', () => {
  const f = (o: object) => ids(filterWorks(all, { ...emptyFilters(), ...o }));
  assert.equal(f({ genres: ['動作'] }), 'ac');
  assert.equal(f({ genres: ['動作', '奇幻'] }), 'c');
  assert.equal(f({ genres: ['修仙'] }), 'b');
  assert.equal(f({ origin: 'CN' }), 'b');
  assert.equal(f({ year: '2022' }), 'a');
  assert.equal(f({ status: 'RELEASING' }), 'b');
  assert.equal(f({ format: 'MOVIE' }), 'c');
});

test('排序：沒有評分的排最後、首播時間含季度、名稱用繁中排序', () => {
  assert.equal(ids(sortWorks(all, 'popularity')), 'bca');
  assert.equal(ids(sortWorks(all, 'score')), 'cab');
  assert.equal(ids(sortWorks(all, 'year')), 'bac');
  assert.equal(ids(sortWorks(all, 'updated'))[0], 'b');
  assert.equal(ids(sortWorks(all, 'views')), 'bca');
  assert.equal(all.map((x) => x.id).join(''), 'abc'); // 不改動原陣列
});

test('topGenres 把標籤一起算', () => {
  assert.deepEqual(topGenres(all, 2), ['動作', '奇幻']);
});

test('pickHero：優先近七天有更新且有橫幅，否則逐層放寬，空片庫回 null', () => {
  const now = Date.parse('2026-11-17T00:00:00Z');
  const lib = [s({ id: 'old', banner: 'b', trending: 99, updated: '2026-01-01T00:00:00Z' }), s({ id: 'new', banner: 'b', trending: 1, updated: '2026-11-16T00:00:00Z' }), s({ id: 'nb', trending: 500, updated: '2026-11-16T00:00:00Z' })];
  assert.equal(pickHero(lib, now, () => 0)?.id, 'new');
  assert.equal(pickHero(lib.slice(0, 1), now, () => 0)?.id, 'old');
  assert.equal(pickHero(lib.slice(2), now, () => 0)?.id, 'nb');
  assert.equal(pickHero([], now), null);
});

test('顯示格式', () => {
  assert.equal(fmtDur(1440), '24 分');
  assert.equal(fmtDur(6000), '1 時 40 分');
  assert.equal(metaLine(all[0]), '2022 · TV 動畫 · 已完結 · 12 / 12 集');
  assert.equal(metaLine(s({ totalEps: null, status: null, year: null, eps: 7 })), 'TV 動畫 · 7 集可看');
});

test('集數超過總集數時只顯示可看集數', () => {
  assert.match(metaLine(s({ eps: 12, totalEps: 12 })), /12 \/ 12 集/);
  assert.match(metaLine(s({ eps: 104, totalEps: 25 })), /104 集可看/);
});

test('epTitle：去掉宣傳尾巴與字幕標示', () => {
  assert.equal(epTitle('BanG Dream! Ave Mujica 第01話【秘密】｜《BanG Dream! Ave Mujica prima aurora》2026/10/16（五）大螢幕上映！'), 'BanG Dream! Ave Mujica 第01話【秘密】');
  assert.equal(epTitle('《BLEACH 死神》第356話 (繁中字幕 | 日語原聲)【Ani-One】'), '《BLEACH 死神》第356話');
  assert.equal(epTitle('ENG SUB《诛仙3》Jade Dynasty S3 EP78 |  | 腾讯视频 - 动漫'), 'ENG SUB《诛仙3》Jade Dynasty S3 EP78');
  assert.equal(epTitle('第1集'), '第1集');
});

test('多季作品顯示季數', () => {
  assert.match(metaLine(s({ seasons: 6, eps: 11, totalEps: null })), /6 季 · 11 集可看/);
});

test('題材篩選用所有季的聯集（facets），不只卡片上顯示的', () => {
  const w = s({ id: 'z', genres: ['動作'], facets: ['動作', '校園'] });
  assert.equal(ids(filterWorks([w], { ...emptyFilters(), genres: ['校園'] })), 'z');
});

test('epTitle 給季名時去掉重複的作品名，只剩集數與副標', () => {
  assert.equal(epTitle('【日語】獵人HUNTER×HUNTER 第005話【西索x悄悄接近】｜Muse木棉花 動畫 線上看', '獵人HUNTER×HUNTER'), '第005話【西索x悄悄接近】');
  assert.equal(epTitle('《BLEACH 死神》第356話 (繁中字幕 | 日語原聲)【Ani-One】', 'BLEACH 死神'), '第356話');
  assert.equal(epTitle('第1集', '別的作品'), '第1集');
  assert.equal(epTitle('獵人HUNTER×HUNTER', '獵人HUNTER×HUNTER'), '獵人HUNTER×HUNTER');   // 整個標題就是作品名時不清空
});
