import test from 'node:test';
import assert from 'node:assert/strict';
import { clock } from './share.ts';

test('clock：分享時間的顯示', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(754.6), '12:34');
  assert.equal(clock(3723), '1:02:03');
});
