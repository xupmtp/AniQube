import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanTitle, parseHints, candidates, buildIndex, match, classifyVideo, episodeNumber, sortEpisodes, buildSeasons, buildStandalones, splitName, dubLabel, seasonNo, workBase, groupWorks, orderSeasons, cleanDesc, norm, isCollection, bundleName, bundleNames, bundleRange, pickBundles, isMixed, episodeSubs, seasonLabel, isExtra, ownDesc, movieKey, playableEps, memberLocked } from './lib.mjs';

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
  assert.equal(r({ title: '【會員搶先看】MULTI SUB《仙逆》EP 165' }, tx).ok, true); // 標題的搶先看是宣傳字，會員限定只看會員清單
  assert.equal(r({ title: '《某》正式預告' }).reason, 'denied');
  assert.equal(r({ title: 'EP36 Trailer 預告｜《某》' }).reason, 'denied');
  assert.equal(r({ sec: 600 }, tx).ok, true); // 所有頻道同一個下限（2 分鐘）
  assert.equal(r({ title: '[OST]《淬光》• 迈利撒', sec: 200 }, tx).reason, 'denied');
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
  const s = buildSeasons(playlists, videos, cfg, ch('anione'), new Set(['mem']));
  assert.deepEqual(s.map((x) => x.playlistId), ['p1', 'p5'].filter((id) => id === 'p1'));
  assert.deepEqual(s[0].episodes.map((e) => e.n), [1, 2]);
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
  assert.deepEqual(colls[0].seasons.map((s) => [s.name, s.kind]), [['某作 第1季', 'season'], ['某作 第二季', 'season']]); // 合輯都不顯示；名稱沒副標的合輯判斷不出季的集就是本傳（第 1 季）
  // 合輯拆進各季：每集看標題的季數標記，沒標記的沿用前一集（開頭沒標記的是第 1 季）；那季已有同配音的清單就不重複放
  const ep = (id, title) => ({ id, title, n: episodeNumber(title) });
  const t2 = (id, name, eps, raw) => ({ id, name, rawTitle: raw ?? name, lang: '日語', single: false, order: 0, episodes: eps });
  const s1 = groupWorks([t2('m', '無職', [ep('a', '無職 第01話'), ep('b', '無職 第02話'), ep('c', '無職～第2季 第01話'), ep('d', '無職～第2季 第02話')], '無職(全集數)'),
    t2('n', '無職 第2季', [ep('c', '無職～第2季 第01話'), ep('d', '無職～第2季 第02話')])]);
  assert.deepEqual(s1[0].seasons.map((s) => [s.name, s.dubs[0].episodes.map((e) => e.id).join()]), [['無職 第1季', 'a,b'], ['無職 第2季', 'c,d']]);
  // 沒有季數標記，但集數又從 1 開始 → 下一季
  const re = groupWorks([t2('r', '平凡', [ep('a', '平凡 第01話'), ep('b', '平凡 第02話'), ep('c', '平凡 第01話【新】'), ep('d', '平凡 第02話【新】')], '平凡S1-S2')]);
  assert.deepEqual(re[0].seasons.map((s) => s.name), ['平凡 第1季', '平凡 第2季']);
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
  // 兩份幾乎一樣的合輯：拆開後是同一季，多出的那集補進去
  const ep = (id, n) => ({ id, n, title: `某作 第${n}話` });
  const ten = Array.from({ length: 10 }, (_, i) => ep(String(i), i + 1));
  const both = (id, name, raw, eps) => ({ id, name, rawTitle: raw, lang: '日語', original: true, single: false, order: 0, aid: null, episodes: eps });
  const [w] = groupWorks([both('p', '某作S1-S2', '某作S1-S2', ten), both('q', '某作 全', '某作(全部集數)', [...ten.slice(0, 9), ep('x', 11)])]);
  assert.deepEqual(w.seasons.map((s) => [s.name, s.dubs[0].episodes.length]), [['某作 第1季', 11]]);
});

test('orderSeasons：有季數照季數，沒季數的依首播時間插入，都沒有的排最後', () => {
  const s = (name, no, when, order = 0) => ({ name, no, when: when ?? Infinity, order, kind: 'season', dubs: [] });
  const names = (l) => orderSeasons(l).map((x) => x.name);
  assert.deepEqual(names([s('完', null, 20201), s('續', null, 20152), s('首', null, 20132)]), ['首', '續', '完']);
  assert.deepEqual(names([s('完結篇', null, 20231), s('The Final Season', null, 20204), s('合輯', null, 20132), s('第二季', 2, 20172), s('第三季', 3, 20183)]),
    ['合輯', '第二季', '第三季', 'The Final Season', '完結篇']);
  assert.deepEqual(names([s('第二季', 2, null), s('無資料', null, null, 1)]), ['第二季', '無資料']);
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

test('groupWorks：模糊比對（Dice ≥ 0.8）、外傳否決、跨頻道片源', () => {
  const it = (id, name, o = {}) => ({ id, name, rawTitle: name, lang: o.lang ?? '日語', original: true, single: false, order: 0, aid: o.aid ?? null, channel: { key: o.ch ?? 'a' }, episodes: [{ id }] });
  const log = [];
  const titles = (ws) => ws.map((w) => w.seasons.map((s) => s.name).sort().join('+')).sort();
  const ws = groupWorks([
    it('k1', '為美好的世界獻上祝福！'), it('k3', '為美好的世界獻上祝福！3'),                                   // 名稱只差一個字 → 併
    it('t1', '關於我轉生變成史萊姆這檔事', { aid: 1 }), it('t2', '關於我轉生變成史萊姆這檔事 轉生史萊姆日記', { aid: 2 }), // AniList 標明是外傳 → 不併
    // 同系列、不同作品：相似度不到 0.8，不能併（實測時找到的錯併例子）
    it('b1', 'BanG Dream!'), it('b2', "BanG Dream! It's MyGO!!!!!"), it('l1', 'Love Live!'), it('l2', 'Love Live! Sunshine!!'),
    it('j1', '怪醫黑傑克TV版'), it('j2', '怪醫黑傑克21'), // 去掉「TV版」後只差續作編號 → 併（直接續作，CONTEXT）
  ], {}, {}, { 2: [1] }, log);
  assert.deepEqual(titles(ws), ["BanG Dream!", "BanG Dream! It's MyGO!!!!!", 'Love Live!', 'Love Live! Sunshine!!', '怪醫黑傑克21+怪醫黑傑克TV版',
    '為美好的世界獻上祝福！+為美好的世界獻上祝福！3', '關於我轉生變成史萊姆這檔事', '關於我轉生變成史萊姆這檔事 轉生史萊姆日記'].sort());
  assert.deepEqual(log.sort(), [['怪醫黑傑克', '怪醫黑傑克21'], ['為美好的世界獻上祝福！', '為美好的世界獻上祝福！3']]);
  // 跨頻道：同名的季是同一季的兩個片源；只有一邊有的季照樣併進同一部作品
  const x = groupWorks([it('m1', '高木同學', { ch: 'muse' }), it('n1', '高木同學', { ch: 'anione' }), it('m3', '高木同學 第3季', { ch: 'muse' })]);
  assert.equal(x.length, 1);
  assert.deepEqual(x[0].seasons.map((s) => [s.name, s.dubs.map((d) => d.channel.key).sort().join()]), [['高木同學', 'anione,muse'], ['高木同學 第3季', 'muse']]);
});

test('季數寫法：2nd Season、中文後的羅馬數字；「全集」是合輯', () => {
  assert.equal(seasonNo('地獄模式～無雙～ 2nd Season'), 2);
  assert.equal(seasonNo('約會大作戰Ⅴ'), 5);
  assert.equal(seasonNo('約會大作戰III'), 3);
  assert.equal(seasonNo('SPY×FAMILY'), null);
  assert.equal(workBase('約會大作戰Ⅴ'), '約會大作戰');
  assert.equal(workBase('地獄模式～無雙～ 2nd Season'), '地獄模式～無雙');
  assert.equal(cleanTitle('📓《地獄模式～無雙～》2nd Season｜2026年7月新番｜曼迪Mighty TV'), '地獄模式～無雙～ 2nd Season');
  assert.equal(cleanTitle('🌟【官方Official】🌟《仙迹寻踪》Tracing the Divine | 从无家可归到玄门至尊！| 阅文动漫'), '仙迹寻踪');
  assert.ok(isCollection('🐸《KERORO軍曹》TV全集（雙語）｜曼迪Mighty TV'));
});

test('cleanTitle：作品名寫在「｜」後面的單篇', () => {
  assert.equal(cleanTitle('🪐总集篇EP01-04【无拼接一口气】|《斗破苍穹》Battle Through the Heavens | 阅文动漫'), '斗破苍穹 总集篇EP01-04【无拼接一口气】');
  assert.equal(cleanTitle('劇場版 某作品｜Muse木棉花 動畫 線上看'), '劇場版 某作品');            // 後面不是《》就不動
});

test('cleanDesc：Muse 只取【劇情簡介】段落、去掉 Ani-One 的登陸開頭', () => {
  const muse = '木棉花2026一月新番 《某作》\n【巴哈姆特動畫瘋｜中華電信 MOD】\n【劇情簡介】\n有一天人們知道了邏輯的存在，世界從此改變，少年踏上了守護大家的漫長旅程。\n【關注木棉花的最新消息】\nhttps://x.com';
  assert.equal(cleanDesc(muse), '有一天人們知道了邏輯的存在，世界從此改變，少年踏上了守護大家的漫長旅程。');
  assert.equal(cleanDesc('《失憶投捕》登陸Ani-One！ 在國中球界馳名的強投・清峰葉流火，與冷靜捕手「智將」・要圭，這對投捕搭檔。'), '在國中球界馳名的強投・清峰葉流火，與冷靜捕手「智將」・要圭，這對投捕搭檔。');
});

test('合集：作品名、集數範圍；只留能補缺集的', () => {
  assert.equal(bundleName('ENG SUB《仙逆》Renegade Immortal EP101-115合集 Full Version | 腾讯视频'), '仙逆');
  assert.equal(bundleName('膽大黨《高速婆婆篇》100分鐘 第01-04話 ｜Muse木棉花'), '膽大黨');
  assert.equal(bundleName('《期間限定-全集馬拉松》青春豬頭少年不會夢到兔女郎學姊｜Muse木棉花'), '青春豬頭少年不會夢到兔女郎學姊');
  assert.equal(bundleName('【全集馬拉松】聖者無雙｜Muse木棉花 動畫 線上看'), '聖者無雙');
  assert.equal(bundleName('開播十週年！冰菓 第01-22話(含OVA)｜Muse木棉花'), '冰菓');
  assert.deepEqual(bundleRange('ENG SUB《仙逆》EP101-115合集'), { a: 101, b: 115, season: null });
  assert.deepEqual(bundleRange('🎮全集无删减 | EP01-45一口气Full |《全职高手》S1-S3'), { a: 1, b: 45, season: null });
  assert.deepEqual(bundleRange('全职高手S3合集EP01-17一次看过瘾！|《全职高手》第三季'), { a: 1, b: 17, season: 3 });
  // 作品只有第 1 集（其餘會員限定）：EP1-10、EP5-15 都補得到；EP1-5 被 EP1-10 涵蓋 → 不留；整季都有的合集 → 不留
  const ep = (n) => ({ id: `e${n}`, n });
  const s1 = { name: 'X', kind: 'season', no: 1, dubs: [{ members: 20, episodes: [ep(1)] }] };
  const b = (a, z) => ({ name: `b${a}`, kind: 'special', bundle: { a, b: z, season: null }, dubs: [] });
  assert.deepEqual(pickBundles([s1, b(1, 5), b(1, 10), b(5, 15), b(1, 1)]).map((s) => s.name), ['X', 'b1', 'b5']);
});

test('bundleName：容易抓錯的標題', () => {
  assert.equal(bundleName('【全集馬拉松】Love Live! Superstar!!S2｜Muse木棉花'), 'Love Live! Superstar!!');
  assert.equal(bundleName('【全集馬拉松】打工吧！魔王大人 第01-13話｜Muse木棉花'), '打工吧！魔王大人');
  assert.equal(bundleName('【全集馬拉松】BanG Dream!｜木棉花2026七月新番《BanG Dream！YUME∞MITA》7/2起'), 'BanG Dream!');
  assert.equal(bundleName('ENG SUB《缉妖录之启程篇》"Another Journey" | EP01-EP12 合集 | 腾讯视频'), '缉妖录之启程篇');
  assert.equal(bundleName('【全集馬拉松】開播十週年《Love Live! 一期》 |  Muse木棉花'), 'Love Live! 一期');
});

test('bundleNames：閱文「宣傳字 |《作品》」格式用《》裡的', () => {
  assert.deepEqual(bundleNames('🪐4K无删减 | S1-S5一口气 EP01-89 |《狐妖小红娘》Fox Spirit Matchmaker | 阅文动漫'), ['狐妖小红娘']);
  assert.deepEqual(bundleNames('🪐药族篇完整合集【无拼接一口气】|《斗破苍穹》Battle Through the Heavens | 阅文动漫'), ['斗破苍穹', '药族篇']);
  assert.deepEqual(bundleNames('膽大黨《高速婆婆篇》100分鐘 第01-04話 ｜Muse木棉花'), ['膽大黨', '高速婆婆篇']);
});

test('match：同名多筆時不挑試播；名稱已寫季數就不再用季數挑', () => {
  const e = (id, title, type, episodes, year) => ({ title, type, episodes, synonyms: [], animeSeason: { year }, sources: [`https://anilist.co/anime/${id}`] });
  const idx = buildIndex([e(1, '忘却バッテリー', 'ONA', 1, 2020), e(2, '忘却バッテリー', 'TV', 12, 2024),
    e(3, '斗破苍穹 第二季', 'ONA', 12, 2018), e(4, '斗破苍穹 第二季', 'ONA', 3, 2019)]);
  assert.equal(match('忘却バッテリー【Ani-One】', idx).anilistId, 2);
  assert.equal(match('《斗破苍穹 第二季》Battle Through the Heavens S2 | 腾讯视频', idx).anilistId, 3);
});

test('isMixed：不相干的作品混在一份清單；同一部長篇的各篇章不算', () => {
  const e = (id, title, rel = []) => ({ title, type: 'MOVIE', episodes: 1, synonyms: [], animeSeason: { year: 2020 }, sources: [`https://anilist.co/anime/${id}`], relatedAnime: rel.map((r) => `https://anilist.co/anime/${r}`) });
  const idx = buildIndex([e(1, '甲'), e(2, '乙'), e(3, '丙'), e(11, '死神', [12]), e(12, '死神 千年血戰篇', [11, 13]), e(13, '死神 千年血戰篇 訣別譚', [12])]);
  assert.equal(isMixed(['《甲》', '《乙》', '《丙》'], idx), true);
  assert.equal(isMixed(['《死神》', '《死神 千年血戰篇》', '《死神 千年血戰篇 訣別譚》'], idx), false);
  assert.equal(isMixed(['《甲》', '《乙》'], idx), false); // 兩部以下不算
});

test('groupWorks 系列鏈：劇場版、合輯不能串連不同系列；同一條鏈上的可以', () => {
  const it = (id, name, o = {}) => ({ id, name, rawTitle: o.raw ?? name, lang: '日語', original: true, single: !!o.single, order: 0, aid: o.aid ?? null, a: o.fmt ? { format: o.fmt } : null, channel: { key: 'a' }, episodes: (o.eps ?? [id]).map((x) => ({ id: x })) });
  const titles = (ws) => ws.map((w) => w.seasons.map((s) => s.name).sort().join('+')).sort();
  // Love Live! → 劇場版 → Sunshine：AniList 是續作關係，但中間隔著劇場版，兩個系列在不同的鏈上 → 劇場版只歸入一部
  const ll = groupWorks([it('a', 'Love Live!', { aid: 1 }), it('m', '劇場版 Love Live!', { aid: 2, single: true, fmt: 'MOVIE' }), it('s', 'Sunshine', { aid: 3 })],
    {}, { 2: [1, 3] }, {}, [], new Map([[1, 'LL'], [2, 'M'], [3, 'SS']]));
  assert.deepEqual(titles(ll), ['Love Live!+劇場版 Love Live!', 'Sunshine']);
  // 「全集」合輯連起 S1 和 The Final Season：同一條鏈 → 合併
  const aot = groupWorks([it('s1', '進擊的巨人', { aid: 10, eps: ['e1', 'e2'] }), it('f', 'The Final Season', { aid: 11, eps: ['e9'] }),
    it('all', '進擊的巨人 全集', { raw: '進擊的巨人(全部集數)', aid: 10, eps: ['e1', 'e2', 'e9'] })], {}, {}, {}, [], new Map([[10, 'A'], [11, 'A']]));
  assert.equal(aot.length, 1);
  // 同樣的合輯連起不同鏈的兩部（劍姬神聖譚）→ 不合併
  const dan = groupWorks([it('d', '地下城', { aid: 20, eps: ['x1'] }), it('k', '劍姬神聖譚', { aid: 21, eps: ['x2'] }),
    it('c', '地下城系列', { raw: '地下城系列', aid: 20, eps: ['x1', 'x2'] })], {}, {}, {}, [], new Map([[20, 'D'], [21, 'K']]));
  assert.equal(dan.length, 2);
  // 重製版（apart）連名稱相似也不併
  const tri = groupWorks([it('t', 'TRIGUN STAMPEDE', { aid: 30 }), it('u', 'TRIGUN STAMPEDE R', { aid: 31 })], {}, {}, { 30: [31] }, [], new Map());
  assert.equal(tri.length, 2);
});

test('groupWorks：只有單篇的作品也能被歸入；兩個字的作品名要接空白或標點', () => {
  const it = (id, name, o = {}) => ({ id, name, rawTitle: name, lang: '日語', original: true, single: true, order: 0, aid: null, channel: { key: 'a' }, bundle: o.bundle, episodes: [{ id }] });
  const b = (id, name) => it(id, name, { bundle: { name, names: [name], a: 1, b: 10, season: null } });
  const ws = groupWorks([it('s1', '完美世界• 柳神特別篇'), b('b1', '完美世界'), it('i1', '冰菓 OVA'), it('i2', '冰菓子的日常')]);
  const by = Object.fromEntries(ws.map((w) => [w.base, w.seasons.length]));
  assert.equal(by['完美世界'], 2);           // 合集與特別篇同一部
  assert.equal(by['冰菓子的日常'], 1);         // 不會被「冰菓」吸走
});

test('groupWorks：跨作品的合輯不收；只含劇場版的清單不算系列', () => {
  const it = (id, name, o = {}) => ({ id, name, rawTitle: o.raw ?? name, lang: '日語', original: true, single: false, order: 0, aid: o.aid ?? null, a: o.fmt ? { format: o.fmt } : null, channel: { key: 'a' }, episodes: (o.eps ?? [id]).map((x) => ({ id: x })) });
  const ws = groupWorks([it('a', 'Love Live!', { eps: ['l1', 'l2'] }), it('s', 'Sunshine', { eps: ['s1', 's2', 's3'] }),
    it('z', 'Love Live!全系列', { raw: 'Love Live！全系列', eps: ['l1', 's1', 's2', 's3'] })], {}, {}, { }, [], new Map());
  const ll = ws.find((w) => w.base === 'Love Live!');
  assert.ok(!ll || ll.seasons.every((s) => s.name !== 'Love Live!全系列')); // 大半是 Sunshine 的集 → 不收
});

test('episodeSubs：各頻道的集名取出副標', () => {
  assert.deepEqual(episodeSubs(['用【循環利息】強制收回借出的魔力 第01話【放逐】｜Muse木棉花 動畫 線上看', '用【循環利息】強制收回借出的魔力 第02話【契約】｜Muse木棉花 動畫 線上看', '用【循環利息】強制收回借出的魔力 第03話【追放】｜Muse木棉花'], ['用【循環利息】強制收回借出的魔力']), ['放逐', '契約', '追放']);
  assert.deepEqual(episodeSubs(['《某作》第1話 (繁中字幕 | 日語原聲)【Ani-One】', '《某作》第2話 (繁中字幕 | 日語原聲)【Ani-One】', '《某作》第3話 (繁中字幕 | 日語原聲)【Ani-One】'], ['某作']), ['', '', '']);
  assert.deepEqual(episodeSubs(['🦊MULTISUB | EP01 | 狐狸精与结婚狂 |《狐妖小红娘》Fox Spirit Matchmaker | 阅文动漫', '🦊MULTISUB | EP02 | 白月初 |《狐妖小红娘》Fox Spirit Matchmaker | 阅文动漫', '🦊MULTISUB | EP03 | 涂山 |《狐妖小红娘》Fox Spirit Matchmaker | 阅文动漫'], ['狐妖小紅娘'], true), ['狐狸精與結婚狂', '白月初', '塗山']);
  // 每集都一樣的標語拿掉；片名在副標中間的不動
  assert.deepEqual(episodeSubs(['ENG SUB《斩神》Slay The Gods EP01 | 大夏境内，神明禁行 | 腾讯视频 - 动漫', 'ENG SUB《斩神》Slay The Gods EP02 | 大夏境内，神明禁行 | 腾讯视频 - 动漫', 'ENG SUB《斩神》Slay The Gods EP03 | 大夏境内，神明禁行 | 腾讯视频 - 动漫'], ['斬神'], true), ['', '', '']);
  assert.deepEqual(episodeSubs(['暴走哈姆醬【第0回】暴走哈姆醬大量出現！', '暴走哈姆醬【第1回】啾4這麼可愛！', '暴走哈姆醬【第2回】哈姆'], ['暴走哈姆醬']), ['暴走哈姆醬大量出現！', '啾4這麼可愛！', '哈姆']);
});

test('seasonLabel：第 N 季＋副標；沒季數的用副標；譯名寫法不同算沒有副標', () => {
  const l = (n, b) => { const { no, sub } = seasonLabel(n, b); return [no, sub]; };
  assert.deepEqual(l('LoveLive Superstar 二期', 'Love Live! Superstar!!'), [2, '']);
  assert.deepEqual(l('Dr.STONE 新石紀 (第二季)', 'Dr.STONE'), [2, '新石紀']);
  assert.deepEqual(l('進擊的巨人 The Final Season', '進擊的巨人'), [null, 'The Final Season']);
  assert.deepEqual(l('SPY x FAMILY間諜家家酒', 'SPY×FAMILY間諜家家酒'), [1, '']);
  assert.deepEqual(l('魔導少年-最終章(妖精的尾巴)', '魔導少年(妖精的尾巴)'), [null, '最終章']);
  assert.deepEqual(l('幼女戰記 2', '幼女戰記'), [2, '']);
  assert.deepEqual(l('龍族II 悼亡者之瞳', '龍族'), [2, '悼亡者之瞳']);
  assert.deepEqual(l('鑽石王牌act2 第二季', '鑽石王牌'), [2, 'act2']);
});

test('sortEpisodes：沒有集數的照上架時間排（新的在前的清單也排對）；清單裡的劇場版不算集', () => {
  const e = (id, title, at) => ({ id, title, at });
  assert.deepEqual(sortEpisodes([e('c', '前篇', '2024-03'), e('b', '中篇', '2024-02'), e('a', '序章', '2024-01')]).map((x) => [x.id, x.n]), [['a', 1], ['b', 2], ['c', 3]]);
  assert.equal(isExtra('進擊的巨人-劇場版【前編 紅蓮的弓矢】'), true);
  assert.equal(isExtra('進擊的巨人 第01話【給二千年後的你】'), false);
});

test('buildSeasons：混合清單看拆出單篇前的全部標題；整份都是長片的劇場版清單拆成單篇', () => {
  const videos = new Map([
    ['w1', v({ id: 'w1', title: 'BURN THE WITCH 龍與魔女 #1', sec: 1200 })],
    ['k1', v({ id: 'k1', title: '【國語】蠟筆小新2016電影【爆睡！夢世界大作戰！】', sec: 6000 })],
    ['k2', v({ id: 'k2', title: '【日語】蠟筆小新2016電影【爆睡！夢世界大作戰！】', sec: 6000 })],
    ['o1', v({ id: 'o1', title: '某 OVA 第1話', sec: 1500 })], ['o2', v({ id: 'o2', title: '某 OVA 第2話', sec: 1500 })],
  ]);
  const playlists = [
    { id: 'mix', title: '【木棉花電影院】劇場版動畫', videoIds: ['w1', 'k1'] },
    { id: 'kmov', title: '【中日雙語】蠟筆小新 劇場版', videoIds: ['k1', 'k2'] },
    { id: 'ova', title: '某 OVA', videoIds: ['o1', 'o2'] },
  ];
  const s = buildSeasons(playlists, videos, cfg, ch('muse'), new Set());
  const mix = s.find((x) => x.playlistId === 'mix');
  assert.deepEqual(mix.allTitles.length, 2); // 混合判斷要看到被拆走的劇場版
  assert.equal(s.some((x) => x.playlistId === 'kmov'), false);
  assert.deepEqual(s.filter((x) => x.single).map((x) => x.playlistId).sort(), ['v-k1', 'v-k2']);
  assert.equal(s.find((x) => x.playlistId === 'ova').episodes.length, 2); // 短的 OVA 清單仍是一季
  assert.equal(isExtra('【中日雙語字幕】電影「企鵝公路」'), true);
});

test('workBase 去掉 TV版；ownDesc 只收整部的簡介', () => {
  assert.equal(workBase('蠟筆小新TV版'), '蠟筆小新');
  const syn = '简介:\n改编自同名小说，故事讲述了一个备受家族欺凌的少年，从一个平凡的下界二等门派外门弟子，机缘巧合下得到九色神雷的力量……\n🔥热播动漫🔥\n☞ 《斗罗大陆》: https://x';
  assert.ok(ownDesc(syn, syn, ['修羅武神'])); // 騰訊：說明沒寫作品名，但每集一樣
  const ep = (s) => `🎯台視最歡樂的『蠟筆小新』現正熱映中！\n✧劇情簡介✧\n${s}，大家跑去找，結果發現足球已經被妮妮拿去當成人質，要脅大家玩扮家家酒…`;
  assert.equal(ownDesc(ep('男生們在公園裡踢足球'), ep('小新去超市買東西'), ['蠟筆小新']), ''); // 各集劇情不是作品簡介
  const other = '简介:\n《斗罗大陆》唐三穿越到斗罗大陆，修炼魂力，结识史莱克七怪，一路成长成为强者的故事。';
  assert.equal(ownDesc(other, other, ['修羅武神']), ''); // 別部作品的簡介
  assert.equal(ownDesc('木棉花2024七月新番\n《擅長逃跑的殿下》\n【巴哈姆特動畫瘋｜中華電信 MOD｜Hami Video｜LiTV】', '', ['擅長逃跑的殿下']), ''); // 宣傳行
});

test('movieKey：重複上傳的同一部片對得上，不同片對不上', () => {
  assert.equal(movieKey('進擊的巨人-劇場版【前編 紅蓮的弓矢】| Muse木棉花 動畫 線上看'), movieKey('【中日雙語字幕】電影「進擊的巨人劇場版-前篇 紅蓮的弓矢」｜Muse木棉花 動畫 線上看'));
  assert.equal(movieKey('企鵝公路【木棉花電影院】| Muse木棉花'), movieKey('【中日雙語字幕】電影「企鵝公路」｜Muse木棉花'));
  assert.notEqual(movieKey('《機動戰士鋼彈SEED Special Edition II 遙遠的拂曉 HD Remaster》'), movieKey('《機動戰士鋼彈SEED Special Edition 虛空的戰場 HD Remaster》'));
});
test('movieKey：「｜」後是版本名時不能切掉', () => {
  assert.notEqual(movieKey('《機戰少女Alice Expansion》#OVA｜四谷裕美ver. (繁中字幕 | 日語原聲)【Ani-One】'), movieKey('《機戰少女Alice Expansion》#OVA｜兼志谷星ver. (繁中字幕 | 日語原聲)【Ani-One】'));
});

test('playableEps／memberLocked：合集補上的集也算看得到', () => {
  const s = (no, ns, extra = {}) => ({ kind: 'season', no, dubs: [{ episodes: ns.map((n) => ({ n })) }, { episodes: ns.map((n) => ({ n })) }], ...extra });
  assert.equal(playableEps([s(1, [1])]), 1); // 配音版不重複算
  assert.equal(playableEps([s(1, [1]), { bundle: { a: 1, b: 16, season: null }, dubs: [] }]), 16); // 從紅月開始
  assert.equal(playableEps([s(1, [1]), { bundle: { a: null, b: null, season: null }, dubs: [] }]), Infinity);
  assert.equal(memberLocked(1, 47), true);   // 快把我哥帶走 1/48
  assert.equal(memberLocked(5, 11), true);   // 墮玄師 5/16
  assert.equal(memberLocked(12, 126), false); // 我的英雄學院：一季以上
  assert.equal(memberLocked(5, 8), false);   // 九州縹緲錄：會員集不到 2/3
  assert.equal(memberLocked(3, 0), false);   // 沒有會員集
});
test('playableEps：沒季數的季另外算', () => {
  const s = (no, name, ns) => ({ kind: 'season', no, name, dubs: [{ episodes: ns.map((n) => ({ n })) }] });
  assert.equal(playableEps([s(1, '第 1 季', [1]), s(null, 'I am a hero too', [1])]), 2);
});
