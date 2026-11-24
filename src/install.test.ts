import test from 'node:test';
import assert from 'node:assert/strict';
import { installGuide } from './install.ts';

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
  iosLine: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:132.0) Gecko/20100101 Firefox/132.0',
};

test('installGuide：有安裝事件給按鈕，其他照瀏覽器給步驟，App 內建瀏覽器請改用瀏覽器，電腦沒事件不顯示', () => {
  assert.deepEqual(installGuide(true, UA.samsung), { button: true, steps: [] });
  assert.match(installGuide(false, UA.iosSafari)!.steps[0], /Safari/);
  assert.match(installGuide(false, UA.iosChrome)!.steps[0], /網址列/);
  assert.match(installGuide(true, UA.iosLine)!.steps[0], /App 內建/);          // 內建瀏覽器就算有事件也不能裝
  assert.match(installGuide(false, UA.samsung)!.steps[1], /主畫面/);
  assert.match(installGuide(false, UA.androidFirefox)!.steps[0], /⋮/);
  assert.equal(installGuide(false, UA.macFirefox), null);
});
