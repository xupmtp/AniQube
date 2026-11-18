import test from 'node:test';
import assert from 'node:assert/strict';
import { keyAction } from './keys.ts';

test('keyAction：Netflix／YouTube 慣用鍵，數字鍵跳到對應百分比，修飾鍵不攔', () => {
  assert.deepEqual(keyAction({ key: ' ' }), { do: 'toggle' });
  assert.deepEqual(keyAction({ key: 'K' }), { do: 'toggle' });
  assert.deepEqual(keyAction({ key: 'ArrowLeft' }), { do: 'seek', by: -10 });
  assert.deepEqual(keyAction({ key: '0' }), { do: 'jump', frac: 0 });
  assert.deepEqual(keyAction({ key: '7' }), { do: 'jump', frac: 0.7 });
  assert.deepEqual(keyAction({ key: 'n' }), { do: 'next' });
  assert.equal(keyAction({ key: 'f', metaKey: true }), null);
  assert.equal(keyAction({ key: 'x' }), null);
});
