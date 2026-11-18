import test from 'node:test';
import assert from 'node:assert/strict';
import { episodeRows, epAt, firstSpot, locate, nextSpot, switchDub } from './work.ts';
import type { Detail, Dub, Season } from './types.ts';

const dub = (lang: string, ...ids: string[]): Dub => ({ lang, list: 'pl', episodes: ids.map((id, i) => ({ id, n: i + 1, title: id, sec: 1440, ext: false })) });
const season = (name: string, kind: Season['kind'], ...dubs: Dub[]): Season => ({ name, kind, dubs });
const det: Detail = {
  id: 'w', desc: '', members: null, seasons: [
    season('第一季', 'season', dub('日語', 'j1', 'j2', 'j3'), dub('國語', 't1', 't2')),
    season('第二季', 'season', dub('日語', 'k1')),
    season('劇場版', 'special', dub('日語', 'm1')),
  ],
};

test('locate / firstSpot', () => {
  assert.deepEqual(locate(det, 't2'), { s: 0, d: 1, i: 1 });
  assert.equal(locate(det, 'nope'), null);
  assert.deepEqual(firstSpot(det), { s: 0, d: 0, i: 0 });
});

test('nextSpot：同配音版下一集，季末接下一季，沒有這個配音就用原聲，不接到單篇', () => {
  assert.equal(epAt(det, nextSpot(det, { s: 0, d: 0, i: 0 })!).id, 'j2');
  assert.equal(epAt(det, nextSpot(det, { s: 0, d: 0, i: 2 })!).id, 'k1');
  assert.equal(epAt(det, nextSpot(det, { s: 0, d: 1, i: 1 })!).id, 'k1');      // 第二季沒有國語 → 原聲
  assert.equal(nextSpot(det, { s: 1, d: 0, i: 0 }), null);                      // 後面只剩單篇
  assert.equal(nextSpot(det, { s: 2, d: 0, i: 0 }), null);
});

test('switchDub：同集數，沒有就從第一集', () => {
  assert.equal(epAt(det, switchDub(det, { s: 0, d: 0, i: 1 }, 1)).id, 't2');
  assert.equal(epAt(det, switchDub(det, { s: 0, d: 0, i: 2 }, 1)).id, 't1');
});

test('episodeRows：列出其他配音版有、這版沒有的集數', () => {
  assert.deepEqual(episodeRows(det.seasons[0], 1).map((r) => [r.n, r.ep?.id ?? null]), [[1, 't1'], [2, 't2'], [3, null]]);
});
