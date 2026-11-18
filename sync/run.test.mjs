// 端對端：用假的 YouTube / GitHub / AniList 把 run.mjs 整支跑一遍
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('run.mjs 端對端（假資料）', () => {
  const root = resolve(import.meta.dirname, '..');
  const dir = mkdtempSync(join(tmpdir(), 'aniqube-'));
  const cfg = JSON.parse(readFileSync(join(root, 'sources.json')));
  cfg.channels = [
    { key: 'a', id: 'UCtestA', name: 'A 頻道', origin: 'JP', minSec: 120 },
    { key: 'b', id: 'UCtestB', name: 'B 頻道', origin: 'CN', minSec: 900 },
  ];
  writeFileSync(join(dir, 'sources.json'), JSON.stringify(cfg));
  const out = execFileSync('node', ['--import', join(root, 'sync/mock-fetch.mjs'), join(root, 'sync/run.mjs')], { cwd: dir, env: { ...process.env, YOUTUBE_API_KEY: 'test' }, encoding: 'utf8' });
  console.log(out);

  const read = (f) => JSON.parse(readFileSync(join(dir, 'public/data', f)));
  const idx = read('index.json').seasons;
  const by = Object.fromEntries(idx.map((s) => [s.id, s]));
  assert.deepEqual(Object.keys(by).sort(), ['plA1', 'plB', 'v-movieA']);       // 週邊、成人向、預告都不在

  const a = by.plA1;
  assert.equal(a.title, '某部動畫');
  assert.deepEqual(a.genres, ['動作']);                                         // 不在對照表的題材不顯示
  assert.deepEqual(a.tags, ['異世界']);                                         // rank<60 的標籤不收
  assert.equal(a.eps, 3);                                                       // a1 a2 + 站外集 noEmb；扣掉 PV/會員/搶先看/台灣封鎖
  assert.equal(a.score, 81);
  assert.equal(a.anilistId, 100);
  const detail = read('seasons/plA1.json');
  assert.deepEqual(detail.episodes.map((e) => e.id), ['a1', 'a2', 'noEmb']);
  assert.equal(detail.episodes.find((e) => e.id === 'noEmb').ext, true);
  assert.equal(detail.desc, '一段 簡介');

  const b = by.plB;
  assert.equal(b.title, '仙逆');
  assert.equal(b.origin, 'CN');
  assert.equal(b.eps, 2);                                                       // 預告被濾掉

  const m = by['v-movieA'];
  assert.equal(m.format, 'SINGLE');
  assert.equal(m.anilistId, null);

  const rep = read('report.json');
  assert.deepEqual(rep.unmatched.map((x) => x.id), ['v-movieA']);
  assert.deepEqual(rep.dropped.map((x) => x.id), ['plA3']);
  assert.ok(rep.units < 60, `額度用量 ${rep.units}`);
});
