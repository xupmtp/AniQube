import test from 'node:test';
import assert from 'node:assert/strict';
import { clearHistory, clearProgress, exportBackup, hasNew, isWatched, markSeen, markWatched, mergeBackup, myList, parseBackup, progress, seen, setProgress, toggleList } from './store.ts';

test('hasNew：只看片單與繼續觀看裡的作品，以上次看到時的更新時間為基準', () => {
  const w = (id: string, updated: string) => ({ id, updated });
  assert.equal(hasNew(w('x', '2099-01-01T00:00:00Z')), false);                 // 不在片單也沒看過
  toggleList('a');                                                              // 加入片單：從現在起算
  assert.equal(hasNew(w('a', '2000-01-01T00:00:00Z')), false);
  assert.equal(hasNew(w('a', '2099-01-01T00:00:00Z')), true);
  markSeen('a', '2099-01-01T00:00:00Z');                                       // 打開作品頁後消失
  assert.equal(hasNew(w('a', '2099-01-01T00:00:00Z')), false);
  setProgress('b', 'ep', 100);                                                  // 舊進度沒有基準時，以進度時間起算
  assert.equal(hasNew(w('b', '2099-01-01T00:00:00Z')), true);
  myList.splice(0); for (const k of Object.keys(progress)) delete progress[k]; for (const k of Object.keys(seen)) delete seen[k];
});

test('看過：重複記同一集只留一筆；移除繼續觀看保留看過，清除觀看紀錄才全清', () => {
  setProgress('w', 'e2', 40); markWatched('w', 'e1'); markWatched('w', 'e1'); markWatched('w', 'e2');
  assert.equal(isWatched('w', 'e1'), true);
  clearProgress('w');
  assert.equal(progress.w, undefined);
  assert.equal(isWatched('w', 'e2'), true);
  setProgress('w', 'e2', 40); clearHistory('w');
  assert.equal(progress.w, undefined);
  assert.equal(isWatched('w', 'e1'), false);
});

test('備份：匯出再匯入是合併，壞資料略過、非備份檔拒絕', () => {
  toggleList('x'); setProgress('x', 'e1', 10); markWatched('x', 'e1');
  const b = exportBackup();
  assert.equal(parseBackup('不是 JSON'), null);
  assert.equal(parseBackup('{"app":"other"}'), null);
  const p = parseBackup(JSON.stringify({ ...b, list: ['x', 'y', 3], progress: { ...b.progress, bad: { ep: 1 } }, watched: { x: ['e1', 'e2'] } }))!;
  assert.deepEqual(p.list, ['x', 'y']);
  assert.equal(p.progress.bad, undefined);
  const r = mergeBackup(p);
  assert.deepEqual(r, { list: 1, progress: 0, watched: 1 });                    // y 新增、x 進度不比較新、e2 新增
  assert.ok(myList.includes('y') && isWatched('x', 'e2'));
  myList.splice(0); for (const k of Object.keys(progress)) delete progress[k]; for (const k of Object.keys(seen)) delete seen[k];
  clearHistory('x');
});
