import test from 'node:test';
import assert from 'node:assert/strict';
import { dubChoices, epAt, firstSpot, locate, nextSpot, prevSpot, sourceChoices, unionRows } from './work.ts';
import type { Detail, Dub, Season } from './types.ts';

const dub = (lang: string, ...ids: string[]): Dub => ({ lang, list: 'pl', episodes: ids.map((id, i) => ({ id, n: i + 1, title: id, sec: 1440, ext: false })) });
const src = (ch: string, lang: string, ...ids: string[]): Dub => ({ ...dub(lang, ...ids), ch });
const season = (name: string, kind: Season['kind'], ...dubs: Dub[]): Season => ({ name, kind, dubs });
const det: Detail = {
  id: 'w', desc: '', members: null, seasons: [
    season('第一季', 'season', dub('日語', 'j1', 'j2'), dub('國語', 't1', 't2', 't3')),
    season('第二季', 'season', dub('日語', 'k1')),
    season('劇場版', 'special', dub('日語', 'm1')),
  ],
};
const ids = (rows: { ep: { id: string } }[]) => rows.map((r) => r.ep.id);

test('locate / firstSpot', () => {
  assert.deepEqual(locate(det, 't2'), { s: 0, d: 1, i: 1 });
  assert.equal(locate(det, 'nope'), null);
  assert.deepEqual(firstSpot(det), { s: 0, d: 0, i: 0 });
});

test('unionRows：配音版聯集，原聲優先，原聲沒有的集用其他配音；偏好的配音優先', () => {
  assert.deepEqual(ids(unionRows(det, 0)), ['j1', 'j2', 't3']);
  assert.deepEqual(ids(unionRows(det, 0, { lang: '國語' })), ['t1', 't2', 't3']);
  assert.deepEqual(unionRows(det, 0)[0].ids, ['j1', 't1']); // 看過的標記看同一集所有版本
});

test('unionRows：片源聯集，同一集重複只留一支：偏好片源 > 能站內播 > sync 的順序', () => {
  const two: Detail = { id: 'w', desc: '', members: null, seasons: [season('第一季', 'season', src('tencent', '國語', 'a1', 'a2'), src('yuewen', '國語', 'b1', 'b2', 'b3'))] };
  assert.deepEqual(ids(unionRows(two, 0)), ['a1', 'a2', 'b3']); // 全職高手：兩邊互補
  assert.deepEqual(ids(unionRows(two, 0, { ch: 'yuewen' })), ['b1', 'b2', 'b3']);
  two.seasons[0].dubs[0].episodes[0].ext = true;
  assert.deepEqual(ids(unionRows(two, 0)), ['b1', 'a2', 'b3']); // 站外集不選
  assert.deepEqual(sourceChoices(two, { s: 0, d: 0, i: 1 }).map((x) => x.ch), ['tencent', 'yuewen']);
  assert.deepEqual(sourceChoices(two, { s: 0, d: 1, i: 2 }).map((x) => x.ch), ['yuewen']);
});

test('nextSpot / prevSpot：照偏好接下一集，季末接下一季，不接到單篇', () => {
  assert.equal(epAt(det, nextSpot(det, { s: 0, d: 0, i: 1 })!).id, 't3');            // 原聲沒有第 3 集 → 國語
  assert.equal(epAt(det, nextSpot(det, { s: 0, d: 1, i: 0 }, { lang: '國語' })!).id, 't2');
  assert.equal(epAt(det, nextSpot(det, { s: 0, d: 1, i: 2 }, { lang: '國語' })!).id, 'k1'); // 第二季沒有國語 → 原聲
  assert.equal(nextSpot(det, { s: 1, d: 0, i: 0 }), null);
  assert.equal(nextSpot(det, { s: 2, d: 0, i: 0 }), null);
  assert.equal(epAt(det, prevSpot(det, { s: 0, d: 1, i: 2 })!).id, 'j2');
  assert.equal(prevSpot(det, { s: 0, d: 0, i: 0 }), null);
});

test('dubChoices：只列這一集有的配音', () => {
  assert.deepEqual(dubChoices(det, { s: 0, d: 0, i: 0 }).map((x) => [x.lang, epAt(det, x.spot).id]), [['日語', 'j1'], ['國語', 't1']]);
  assert.deepEqual(dubChoices(det, { s: 0, d: 1, i: 2 }).map((x) => x.lang), ['國語']);
});
