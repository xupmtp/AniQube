import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanTitle, parseHints, candidates, buildIndex, match, classifyVideo, episodeNumber, sortEpisodes, buildSeasons, buildStandalones, splitName, dubLabel, seasonNo, workBase, groupWorks, orderSeasons, cleanDesc, norm } from './lib.mjs';

const cfg = JSON.parse(readFileSync(new URL('../sources.json', import.meta.url)));
const ch = (key) => cfg.channels.find((c) => c.key === key);
const v = (o) => ({ id: 'x', title: '某作品 EP1', sec: 1440, embeddable: true, age: false, twBlocked: false, live: 'none', views: 1, at: '2026-01-01', ...o });

test('cleanTitle：實際遇到的各種清單標題', () => {
  assert.equal(cleanTitle('失憶投捕【Ani-One】'), '失憶投捕');
  assert.equal(cleanTitle('🌿《給不滅的你 (第三季)》(繁中字幕)【Ani-One】| 2025年10月新番'), '給不滅的你 (第三季)');
  assert.equal(cleanTitle('【國語】SPY×FAMILY間諜家家酒(全部集數)｜Muse木棉花 動畫 線上看'), 'SPY×FAMILY間諜家家酒');
  assert.equal(cleanTitle('《大理寺日志》White Cat Legend | 腾讯视频 - 动漫'), '大理寺日志');
  assert.equal(cleanTitle('【我推的孩子】【限時免費公開】【Ani-One】'), '【我推的孩子】');
  assert.equal(cleanTitle('無職轉生～到了異世界就拿出真本事～(全集數)｜Muse木棉花 動畫 線上看'), '無職轉生～到了異世界就拿出真本事～');
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
  assert.equal(episodeNumber('葬送的芙莉蓮 首播100分鐘 第01-04話｜Muse木棉花'), 1);
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


test('seasonNo / workBase：季數與作品名', () => {
  assert.equal(seasonNo('我的英雄學院 第六季'), 6);
  assert.equal(seasonNo('爆漫王S1-S3'), 1);
  assert.equal(seasonNo('Re：從零開始的異世界生活S3 襲擊篇+反擊篇'), 3);
  assert.equal(seasonNo('我的英雄學院'), null);
  assert.equal(workBase('我的英雄學院 第六季'), '我的英雄學院');
  assert.equal(workBase('JOJO的奇妙冒險 第四季 (黃金之風)'), 'JOJO的奇妙冒險');
  assert.equal(workBase('Re：從零開始的異世界生活S3 襲擊篇+反擊篇'), 'Re：從零開始的異世界生活');
  assert.equal(workBase('工作細胞系列'), '工作細胞');
  assert.equal(workBase('UQ HOLDER！悠久持有者！'), 'UQ HOLDER！悠久持有者！');
});

test('groupWorks：分季、配音版、合輯、單篇', () => {
  const it = (id, name, o = {}) => ({ id, name, rawTitle: o.raw ?? name, lang: o.lang ?? '日語', single: !!o.single, order: o.order ?? 0, episodes: (o.eps ?? [id]).map((x) => ({ id: x })) });
  const works = groupWorks([
    it('h2', '我的英雄學院 第二季', { order: 1 }), it('h1', '我的英雄學院 第一季', { order: 2 }),
    it('jp', '獵人HUNTER×HUNTER', { eps: ['j1', 'j2'] }), it('tw', '獵人HUNTER×HUNTER', { lang: '國語', eps: ['t1'] }),
    it('dup', '獵人HUNTER×HUNTER', { eps: ['j1'] }),                                                      // 同季同配音 → 留集數多的
    it('s1', '佐佐木 第一季', { eps: ['x1', 'x2'] }), it('s2', '佐佐木 第二季', { eps: ['x3'] }),
    it('all', '佐佐木 S1-S2', { raw: '佐佐木 S1-S2', eps: ['x1', 'x2', 'x3'] }),            // 被單季涵蓋 → 不列
    it('mv', '獵人HUNTER×HUNTER 劇場版【緋色幻影】', { single: true }), it('mv2', '獵人HUNTER×HUNTER 劇場版【緋色幻影】', { single: true, lang: '國語' }), it('lone', '劇場版 某電影', { single: true }),
  ]);
  const by = Object.fromEntries(works.map((w) => [w.base, w]));
  assert.deepEqual(Object.keys(by).sort(), ['佐佐木', '劇場版 某電影', '我的英雄學院', '獵人HUNTER×HUNTER']);
  assert.deepEqual(by['我的英雄學院'].seasons.map((s) => s.name), ['我的英雄學院 第一季', '我的英雄學院 第二季']);
  const hunter = by['獵人HUNTER×HUNTER'].seasons;
  assert.deepEqual(hunter.map((s) => s.kind), ['season', 'special']);
  assert.deepEqual(hunter[0].dubs.map((d) => d.id).sort(), ['jp', 'tw']);
  assert.deepEqual(hunter[1].dubs.map((d) => d.id), ['mv', 'mv2']);                   // 單篇也配配音版
  assert.deepEqual(by['佐佐木'].seasons.map((s) => s.name), ['佐佐木 第一季', '佐佐木 第二季']);
  const colls = groupWorks([it('a', '某作', { raw: '某作(全部集數)', eps: ['1', '2', '3'] }), it('b', '某作S1-S2', { raw: '某作S1-S2', eps: ['1', '2'] }), it('c', '某作 第二季', { eps: ['2'] })]);
  assert.deepEqual(colls[0].seasons.map((s) => [s.name, s.kind]), [['某作', 'season'], ['某作', 'collection'], ['某作 第二季', 'season']]); // 小合輯拆出第一季後被涵蓋 → 不列；大合輯還有第 3 集 → 保留
  const keep = groupWorks([it('p', '佐佐木', { eps: ['x1', 'x2', 'x3', 'x4', 'x5'] }), it('q', '佐佐木 第二季', { eps: ['x3'] })]);
  // 開頭單季沒有的集拆成第一季；拆完合輯還有單季沒有的集（x4、x5）→ 合輯保留
  assert.deepEqual(keep[0].seasons.map((s) => [s.name, s.kind, s.dubs[0].episodes.map((e) => e.id).join()]),
    [['佐佐木', 'season', 'x1,x2'], ['佐佐木', 'collection', 'x1,x2,x3,x4,x5'], ['佐佐木 第二季', 'season', 'x3']]);
  const s1 = groupWorks([it('m', '無職(全集數)', { raw: '無職(全集數)', eps: ['a', 'b', 'c', 'd'] }), it('n', '無職 第2季', { eps: ['c', 'd'] })]);
  assert.deepEqual(s1[0].seasons.map((s) => [s.name, s.kind]), [['無職', 'season'], ['無職 第2季', 'season']]); // 第一季拆出來後合輯全被涵蓋 → 不列
  assert.equal(groupWorks([it('r', '平凡S2-S3', { raw: '平凡S2-S3', eps: ['a', 'b'] }), it('t', '平凡 S3', { eps: ['b'] })])[0].seasons[0].name, '平凡 第2季'); // 合輯從第幾季開始
  assert.equal(groupWorks([it('z', '某作 第二季')], { z: '另一部' })[0].base, '另一部');   // 人工作品對應表
});

test('sortEpisodes：合併版涵蓋的集都有單獨上傳就拿掉，否則保留並取第一個數字', () => {
  const e = (title) => ({ id: title, title });
  const out = sortEpisodes([e('首播 第01-04話'), e('第05話'), e('第06話'), e('第07話'), e('第08話'), e('120分鐘 第07-08話')]);
  assert.deepEqual(out.map((x) => [x.n, x.title]), [[1, '首播 第01-04話'], [5, '第05話'], [6, '第06話'], [7, '第07話'], [8, '第08話']]);
});


test('groupWorks：共用影片過半、同 AniList、續集關聯才合併；人工指定的不併', () => {
  const it = (id, name, o = {}) => ({ id, name, rawTitle: o.raw ?? name, lang: o.lang ?? '日語', original: (o.lang ?? '日語') === '日語', single: false, order: o.order ?? 0, aid: o.aid ?? null, episodes: (o.eps ?? [id]).map((x) => ({ id: x })) });
  const titles = (ws) => ws.map((w) => w.base).sort();
  // 無職轉生：名稱不同但影片幾乎一樣
  assert.deepEqual(titles(groupWorks([it('a', '無職轉生S1-S3', { raw: '無職轉生S1-S3', eps: ['1', '2', '3'] }), it('b', '無職轉生 全', { eps: ['1', '2', '3', '4'] })])), ['無職轉生']);
  // 混合清單只共用一支，不併
  assert.equal(groupWorks([it('x', '暗殺教室', { eps: ['1', '2', '3', '4'] }), it('y', '學日文', { eps: ['1', '9', '8', '7'] })]).length, 2);
  // 續集關聯：名稱完全不同
  assert.deepEqual(titles(groupWorks([it('c', '果然我的青春', { aid: 1 }), it('d', '果然我的青春。續', { aid: 2 })], {}, { 2: [1] })), ['果然我的青春']);
  // 人工指定的作品不參與自動合併
  assert.equal(groupWorks([it('m', 'MyGO', { aid: 1 }), it('n', 'Ave Mujica', { aid: 2 })], { n: 'Ave Mujica' }, { 2: [1] }).length, 2);
});

test('groupWorks：名稱不同、同 AniList 編號、語言互補的季配成配音版，作品名用原聲', () => {
  const it = (id, name, lang, aid) => ({ id, name, rawTitle: name, lang, original: lang === '日語', single: false, order: 0, aid, episodes: [{ id }] });
  const [w] = groupWorks([
    it('c1', 'Dr.STONE', '粵語', 10), it('c2', 'Dr.STONE (第二季)', '粵語', 11),
    it('j1', 'Dr.STONE 新石紀', '日語', 10), it('j2', 'Dr.STONE 新石紀 (第二季)', '日語', 11),
  ]);
  assert.equal(w.base, 'Dr.STONE 新石紀');
  assert.deepEqual(w.seasons.map((s) => [s.name, s.dubs.map((d) => d.lang).sort()]), [
    ['Dr.STONE 新石紀', ['日語', '粵語']], ['Dr.STONE 新石紀 (第二季)', ['日語', '粵語']],
  ]);
});

test('groupWorks：作品名取原聲首季中最短的；九成重複的合輯不列', () => {
  const it = (id, name, o = {}) => ({ id, name, rawTitle: o.raw ?? name, lang: '日語', original: true, single: false, order: o.order ?? 0, aid: o.aid ?? null, episodes: (o.eps ?? [id]).map((x) => ({ id: x })) });
  const [hero] = groupWorks([it('a', '英雄學院 : I am a hero too', { aid: 1, order: 0 }), it('b', '英雄學院 第一季', { aid: 1, order: 5 })]);
  assert.equal(hero.base, '英雄學院');
  const ten = Array.from({ length: 10 }, (_, i) => String(i));
  const [w] = groupWorks([it('p', '某作S1-S2', { raw: '某作S1-S2', eps: ten }), it('q', '某作 全', { raw: '某作(全部集數)', eps: [...ten.slice(0, 9), 'x'] })]);
  assert.equal(w.seasons.length, 1);
});

test('orderSeasons：有季數照季數，沒季數的依首播時間插入，都沒有的當第一季', () => {
  const s = (name, no, when, order = 0) => ({ name, no, when: when ?? Infinity, order, kind: 'season', dubs: [] });
  const names = (l) => orderSeasons(l).map((x) => x.name);
  assert.deepEqual(names([s('完', null, 20201), s('續', null, 20152), s('首', null, 20132)]), ['首', '續', '完']);
  assert.deepEqual(names([s('完結篇', null, 20231), s('The Final Season', null, 20204), s('合輯', null, 20132), s('第二季', 2, 20172), s('第三季', 3, 20183)]),
    ['合輯', '第二季', '第三季', 'The Final Season', '完結篇']);
  assert.deepEqual(names([s('第二季', 2, null), s('無資料', null, null, 1)]), ['無資料', '第二季']);
});

test('cleanDesc：騰訊只取「简介」之後，刪宣傳行與表情符號，太短回空字串', () => {
  const tx = '🗓️ 更新时间：每周4更新1集，会员专享\n\n简介\n《大理寺日志》讲述的是在唐朝武明空统治时期，以主管全国大案要案的大理寺为舞台，展开各种惊心动魄的破案冒险。\n\n00:00 加入腾讯视频\n🔥热播动漫🔥\n☞ 仙逆: https://youtube.com/x';
  assert.equal(cleanDesc(tx), '《大理寺日志》讲述的是在唐朝武明空统治时期，以主管全国大案要案的大理寺为舞台，展开各种惊心动魄的破案冒险。');
  const muse = '《某作》2026.11.06上映確定\n\n少年終將長大，思春期奇幻故事堂堂步入完結，所有謎團即將揭曉。\n原作／某人、導演／某人';
  assert.equal(cleanDesc(muse), '少年終將長大，思春期奇幻故事堂堂步入完結，所有謎團即將揭曉。');
  assert.equal(cleanDesc('《幼女戰記》\n《幼女戰記 2》'), '');
  const long = '由韓國漫畫家孫齊皓擔任原作、李光洙作畫，於 LINE WEBTOON 上連載的漫畫作品《大貴族》，故事描述吸血鬼貴族中的貴族「萊」，在沉睡了 820 年之後再度甦醒。';
  assert.equal(cleanDesc(long), long);                                            // 長段落提到 LINE 不該被整段刪掉
});

test('match：標題寫第二季、資料集只有前作時標成 noseason（待覆核），不當成可信的 single', () => {
  const idx = buildIndex([{ title: 'Ao Ashi', type: 'TV', synonyms: ['青之蘆葦'], animeSeason: { year: 2022 }, sources: ['https://anilist.co/anime/134732'] }]);
  assert.equal(match('⚽️《青之蘆葦 第二季》| 2026年10月新番', idx).how, 'noseason');
  assert.equal(match('青之蘆葦【Ani-One】', idx).how, 'single');
});
