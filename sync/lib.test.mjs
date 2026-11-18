import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanTitle, parseHints, candidates, buildIndex, match, classifyVideo, episodeNumber, sortEpisodes, buildSeasons, buildStandalones, dropCovered, splitName, dubLabel, dropSameTitle, norm } from './lib.mjs';

const cfg = JSON.parse(readFileSync(new URL('../sources.json', import.meta.url)));
const ch = (key) => cfg.channels.find((c) => c.key === key);
const v = (o) => ({ id: 'x', title: '某作品 EP1', sec: 1440, embeddable: true, age: false, twBlocked: false, live: 'none', views: 1, at: '2026-01-01', ...o });

test('cleanTitle：實際遇到的各種清單標題', () => {
  assert.equal(cleanTitle('失憶投捕【Ani-One】'), '失憶投捕');
  assert.equal(cleanTitle('🌿《給不滅的你 (第三季)》(繁中字幕)【Ani-One】| 2025年10月新番'), '給不滅的你 (第三季)');
  assert.equal(cleanTitle('【國語】SPY×FAMILY間諜家家酒(全部集數)｜Muse木棉花 動畫 線上看'), 'SPY×FAMILY間諜家家酒');
  assert.equal(cleanTitle('《大理寺日志》White Cat Legend | 腾讯视频 - 动漫'), '大理寺日志');
  assert.equal(cleanTitle('【我推的孩子】【限時免費公開】【Ani-One】'), '【我推的孩子】');
  assert.equal(cleanTitle('💥《我的英雄學院》第六季 (繁中字幕)【Ani-One ULTRA】'), '我的英雄學院 第六季');
  assert.equal(cleanTitle('【Members Premiere 会员抢先看】《诛仙》第三季 | Jade Dynasty Season 3'), '诛仙 第三季');
  assert.equal(cleanTitle('《期間限定》青春豬頭少年系列｜《青春豬頭少年不會夢到親愛好朋友》'), '青春豬頭少年系列');
});

test('parseHints：季數與年份', () => {
  assert.deepEqual(parseHints('歡迎來到實力至上主義的教室S3｜Muse'), { season: 3, year: null, movie: false });
  assert.equal(parseHints('一人之下 第五季').season, 5);
  assert.equal(parseHints('⚽️《青之蘆葦 第二季》| 2026年10月新番').year, 2026);
  assert.equal(parseHints('《仙逆剧场版 弑仙之战》').movie, true);
});

test('candidates：去季數與副標', () => {
  assert.deepEqual(candidates('一拳超人S1-S3'), ['一拳超人S1-S3', '一拳超人']);
  assert.ok(candidates('畫江湖之不良人第七季：九幽玄天').includes('畫江湖之不良人'));
});

test('norm：繁簡與標點折疊', () => {
  assert.equal(norm('我的英雄學院'), norm('我的英雄学院'));
  assert.equal(norm('Re：從零開始的異世界生活'), norm('Re:從零開始的異世界生活'));
});

const entry = (title, anilist, year, season, type = 'TV', syn = []) => ({
  title, type, synonyms: syn, animeSeason: { year, season }, sources: [`https://anilist.co/anime/${anilist}`],
});
const index = buildIndex([
  entry('One Punch Man', 21087, 2015, 'FALL', 'TV', ['一拳超人']),
  entry('One Punch Man 2', 97668, 2019, 'SPRING', 'TV', ['一拳超人']),
  entry('One Punch Man 3', 178788, 2025, 'FALL', 'TV', ['一拳超人']),
  entry('Spy x Family', 140960, 2022, 'SPRING', 'TV', ['間諜家家酒']),
  entry('Spy x Family Movie', 1, 2023, 'WINTER', 'MOVIE', ['間諜家家酒']),
  { title: 'no anilist', type: 'TV', synonyms: ['無來源'], sources: ['https://myanimelist.net/anime/1'] },
]);

test('match：單一、季數、年份、劇場版、查無', () => {
  assert.equal(match('間諜家家酒【Ani-One】', index).how, 'first');
  assert.equal(match('間諜家家酒【Ani-One】', index).anilistId, 140960);
  assert.equal(match('一拳超人 第二季', index).anilistId, 97668);
  assert.equal(match('《一拳超人》(繁中字幕)【Ani-One】| 2025年10月新番', index).anilistId, 178788);
  assert.equal(match('間諜家家酒 劇場版', index).anilistId, 1);
  assert.equal(match('一拳超人S1-S3', index).anilistId, 21087);
  assert.equal(match('無來源', index), null);
  assert.equal(match('完全不存在的作品', index), null);
});

test('classifyVideo：各種排除原因', () => {
  const muse = ch('muse'), tx = ch('tencent'), members = new Set(['m1']);
  const r = (o, c = muse, opt) => classifyVideo(v(o), cfg, c, members, opt);
  assert.equal(r({}).ok, true);
  assert.equal(r({ live: 'upcoming' }).reason, 'live');
  assert.equal(r({ id: 'm1' }).reason, 'members');
  assert.equal(r({ twBlocked: true }).reason, 'region');
  assert.equal(r({ sec: 60 }).reason, 'length');
  assert.equal(r({ sec: 20000 }).reason, 'length');
  assert.equal(r({ title: '#ULTRA會員搶先看《某》#3 (繁中字幕)' }).reason, 'early');
  assert.equal(r({ title: '【會員搶先看】MULTI SUB《仙逆》EP 165' }, tx).ok, true); // 騰訊的搶先看是公開影片
  assert.equal(r({ title: '【會員搶先看】某部動畫 EP3' }).reason, 'early');
  assert.equal(r({ title: '《某》正式預告' }).reason, 'denied');
  assert.equal(r({ title: 'EP36 Trailer 預告｜《某》' }).reason, 'denied');
  assert.equal(r({ sec: 600 }, tx).reason, 'length'); // 騰訊下限 15 分鐘
  assert.equal(r({ sec: 600 }, muse).ok, true);
  assert.equal(r({ sec: 1300 }, muse, { standalone: true }).ok, true);
  assert.equal(r({ sec: 1100 }, muse, { standalone: true }).reason, 'length');
});

test('classifyVideo：不能嵌入或年齡限制 → 站外集，不是排除', () => {
  const members = new Set();
  assert.equal(classifyVideo(v({ embeddable: false }), cfg, ch('muse'), members).ext, true);
  assert.equal(classifyVideo(v({ age: true }), cfg, ch('muse'), members).ext, true);
  assert.equal(classifyVideo(v({}), cfg, ch('muse'), members).ext, false);
});

test('episodeNumber 與排序', () => {
  assert.equal(episodeNumber('《仙逆》Renegade Immortal EP 165 | x'), 165);
  assert.equal(episodeNumber('#ULTRA會員搶先看《BLEACH》#50 (繁中字幕'), 50);
  assert.equal(episodeNumber('某某 第12集'), 12);
  assert.equal(episodeNumber('某某 2025年新番'), null);
  const sorted = sortEpisodes([{ title: 'EP10' }, { title: 'EP2' }, { title: 'EP1' }]);
  assert.deepEqual(sorted.map((e) => e.n), [1, 2, 10]);
  const keep = sortEpisodes([{ title: '前篇' }, { title: '後篇' }]);
  assert.deepEqual(keep.map((e) => e.title), ['前篇', '後篇']);
});

test('buildSeasons：過濾、排除混合清單、不收空清單', () => {
  const videos = new Map([
    ['a', v({ id: 'a', title: '某 EP1' })], ['b', v({ id: 'b', title: '某 EP2' })],
    ['pv', v({ id: 'pv', title: '某 PV', sec: 90 })], ['mem', v({ id: 'mem', title: '某 EP3' })],
    ['m1', v({ id: 'm1', title: '《甲》EP1' })], ['m2', v({ id: 'm2', title: '《乙》EP1' })], ['m3', v({ id: 'm3', title: '《丙》EP1' })],
  ]);
  const playlists = [
    { id: 'p1', title: '某【Ani-One】', videoIds: ['b', 'a', 'pv', 'mem', 'gone'] },
    { id: 'p2', title: '只有預告', videoIds: ['pv'] },
    { id: 'p3', title: '週邊精品', videoIds: ['a'] },
    { id: 'p4', title: '精選', videoIds: ['m1', 'm2', 'm3'] },
    { id: 'p5', title: '某【Ani-One ULTRA】', videoIds: ['mem'] },
  ];
  const s = buildSeasons(playlists, videos, { ...cfg, excludeSeasons: [] }, ch('anione'), new Set(['mem']));
  assert.deepEqual(s.map((x) => x.playlistId), ['p1', 'p5'].filter((id) => id === 'p1'));
  assert.deepEqual(s[0].episodes.map((e) => e.n), [1, 2]);
  const manual = buildSeasons([playlists[0]], videos, { ...cfg, excludeSeasons: ['p1'] }, ch('anione'), new Set());
  assert.equal(manual.length, 0);
});

test('dropCovered：被涵蓋的重複季丟掉，相同的留一份', () => {
  const s = (id, ...e) => ({ playlistId: id, episodes: e.map((x) => ({ id: x })) });
  const out = dropCovered([s('a', '1', '2'), s('b', '1', '2', '3'), s('c', '1', '2', '3'), s('d', '9')]);
  assert.deepEqual(out.map((x) => x.playlistId), ['b', 'd']);
});

test('buildStandalones：只收不在季裡的長片', () => {
  const ups = [v({ id: 'u1', title: '劇場版 某', sec: 6000 }), v({ id: 'u2', title: '某 EP1', sec: 1440 }), v({ id: 'u3', title: '特別篇', sec: 1500 }), v({ id: 'u4', title: '【動漫Gossip】劇場版開箱', sec: 1500 }), v({ id: 'u5', title: 'Love Live! EP1｜《劇場版 Love Live!》上映！', sec: 1440 })];
  const s = buildStandalones(ups, new Set(['u3']), cfg, ch('muse'), new Set());
  assert.deepEqual(s.map((x) => x.playlistId), ['v-u1']);
  assert.equal(s[0].single, true);
});

test('splitName：中英黏在一起才拆，命中標為 split', () => {
  assert.deepEqual(splitName('CODE GEASS叛逆的魯魯修'), ['CODE GEASS', '叛逆的魯魯修']);
  assert.deepEqual(splitName('夜櫻家大作戰'), []);
  const idx = buildIndex([{ title: 'Code Geass', type: 'TV', sources: ['https://anilist.co/anime/1575'] }]);
  assert.equal(match('CODE GEASS叛逆的魯魯修【Ani-One】', idx).how, 'split');
});

test('dubLabel：只認明確的配音標記', () => {
  assert.equal(dubLabel('【國語】獵人HUNTER×HUNTER｜Muse木棉花'), '國語');
  assert.equal(dubLabel('【日語】獵人HUNTER×HUNTER｜Muse木棉花'), '日語');
  assert.equal(dubLabel('《勇者、辭職不幹了》(粵語配音 | 繁中字幕)【Ani-One】'), '粵語');
  assert.equal(dubLabel('魔法公主的小煩惱【中文配音】｜Muse'), '國語');
  assert.equal(dubLabel('《勇者、辭職不幹了》(日語原聲 | 繁中字幕)【Ani-One】'), null);
});

test('dropSameTitle：同頻道同名只留集數最多的，單篇不併', () => {
  const s = (id, channel, title, eps, format = 'TV') => ({ id, channel, title, eps, format });
  const out = dropSameTitle([s('a', 'muse', '甲', 19), s('b', 'muse', '甲', 20), s('c', 'anione', '甲', 5),
    s('d', 'muse', '甲（國語）', 3), s('e', 'tencent', '特別篇', 1, 'SINGLE'), s('f', 'tencent', '特別篇', 1, 'SINGLE')]);
  assert.deepEqual(out.map((x) => x.id), ['b', 'c', 'd', 'e', 'f']);
});
