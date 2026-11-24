<script setup lang="ts">
import { computed, ref } from 'vue';
import { clearAllHistory, exportBackup, historyIds, mergeBackup, parseBackup, settings } from '../store.ts';
import { install, installGuide, isIOS, promptInstall, standalone } from '../install.ts';

// 安裝到主畫面：依瀏覽器給按鈕或步驟（installGuide）；已經用 App 開啟、或電腦上不能安裝時整區不顯示
const ios = isIOS();
const guide = computed(() => (standalone() ? null : installGuide(!!install.prompt)));

// 備份與還原：沒有帳號，換裝置靠檔案搬資料（合併匯入，不會覆蓋這台裝置較新的進度）
const file = ref<HTMLInputElement | null>(null);
function download() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportBackup(), null, 1)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `aniqube-備份-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(url);
}
async function restore(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  const b = parseBackup(await f.text());
  if (!b) { alert('這不是動漫立方的備份檔，沒有匯入任何資料。'); return; }
  const r = mergeBackup(b);
  alert(`已合併匯入：片單新增 ${r.list} 部、續播進度更新 ${r.progress} 部、看過的集新增 ${r.watched} 集。`);
}
function wipeAll() {
  const n = historyIds().length;
  if (!n) { alert('目前沒有觀看紀錄。'); return; }
  if (confirm(`清除全部 ${n} 部作品的觀看紀錄？續播進度和看過的標記都會消失，無法復原。片單不受影響。`)) clearAllHistory();
}
</script>

<template>
  <section class="browse settings">
    <div class="page-head"><h1>設定</h1></div>
    <p class="muted">設定只存在這個瀏覽器，匯出備份檔時會一起帶走。</p>
    <h2>播放</h2>
    <label class="opt">
      <span>
        <strong>自動播放下一集</strong>
        <small>一集播完後倒數 5 秒接著播下一集，倒數時可以取消。關閉時播完就停在原地。</small>
      </span>
      <input v-model="settings.autoplay" type="checkbox" role="switch" class="switch" />
    </label>
    <p class="muted hint">音量與靜音會自動記住，換集或重新整理後沿用上次的設定。</p>

    <h2>觀看紀錄</h2>
    <label class="opt">
      <span>
        <strong>暫停記錄觀看紀錄</strong>
        <small>開啟後，播放時不會記錄續播進度和看過的集，已有的紀錄保留不動。</small>
      </span>
      <input v-model="settings.pauseHistory" type="checkbox" role="switch" class="switch" />
    </label>
    <div class="opt">
      <span>
        <strong>清除全部觀看紀錄</strong>
        <small>清掉所有作品的續播進度和看過的標記，片單不受影響。只想清一部作品，可在觀看紀錄頁清除。</small>
      </span>
      <button class="btn ghost danger" @click="wipeAll">清除全部</button>
    </div>

    <h2>備份與還原</h2>
    <div class="opt">
      <span>
        <strong>匯出備份檔</strong>
        <small>把片單、續播進度、看過的集和設定存成一個檔案，可以帶到其他裝置或瀏覽器。</small>
      </span>
      <button class="btn" @click="download">匯出</button>
    </div>
    <div class="opt">
      <span>
        <strong>匯入備份檔</strong>
        <small>合併進這個瀏覽器：片單與看過的集取聯集，續播進度保留較新的那一份。</small>
      </span>
      <button class="btn" @click="file?.click()">匯入</button>
    </div>
    <input ref="file" type="file" accept="application/json,.json" hidden @change="restore" />

    <template v-if="guide">
      <h2>安裝到主畫面</h2>
      <div v-if="!guide.button" class="opt">
        <span>
          <strong>{{ guide.inApp ? '先用瀏覽器開啟' : '加到主畫面' }}</strong>
          <small><template v-for="(s, i) in guide.steps" :key="s">{{ i + 1 }}. {{ s }}<br /></template><template v-if="ios && !guide.inApp">主畫面 App 和瀏覽器的片單、觀看紀錄是分開的，可以用上面的備份檔搬過去。</template></small>
        </span>
      </div>
      <div v-else class="opt">
        <span>
          <strong>安裝動漫立方</strong>
          <small>加到主畫面或桌面後像 App 一樣全螢幕開啟，片單與觀看紀錄和瀏覽器共用。</small>
        </span>
        <button class="btn" @click="promptInstall">安裝</button>
      </div>
    </template>
  </section>
</template>
