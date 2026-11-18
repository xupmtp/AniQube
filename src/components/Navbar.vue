<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { exportBackup, mergeBackup, parseBackup } from '../store.ts';

const router = useRouter();
const route = useRoute();
const q = ref('');
const solid = ref(false);
const onScroll = () => { solid.value = window.scrollY > 40; };
// 右上角個人選單（仿 Netflix）：片單捷徑、備份與還原
const open = ref(false);
const menuEl = ref<HTMLElement | null>(null);
const file = ref<HTMLInputElement | null>(null);
const onDoc = (e: Event) => { if (open.value && !menuEl.value?.contains(e.target as Node)) open.value = false; };
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open.value = false; };
onMounted(() => {
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
  document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey);
});
function go(path: string) { open.value = false; router.push(path); }
function download() {
  open.value = false;
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportBackup(), null, 1)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `aniqube-備份-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(url);
}
function pick() { open.value = false; file.value?.click(); }
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

function search() {
  const v = q.value.trim();
  router.push(v ? { path: '/browse', query: { q: v } } : { path: '/browse' });
}
</script>

<template>
  <header class="nav" :class="{ solid: solid || route.path !== '/' }">
    <RouterLink to="/" class="logo" aria-label="動漫立方 AniQube 首頁">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <path d="M16 3 28 9.5v13L16 29 4 22.5v-13z" style="fill: var(--shu)" /><path d="M16 3 28 9.5 16 16 4 9.5z" style="fill: var(--shu-hi)" />
      </svg>
      <span>動漫立方</span><small>AniQube</small>
    </RouterLink>
    <nav>
      <RouterLink to="/">首頁</RouterLink>
      <RouterLink to="/browse">瀏覽</RouterLink>
    </nav>
    <form class="search" role="search" @submit.prevent="search">
      <input v-model="q" type="search" placeholder="搜尋作品、日文、英文名" aria-label="搜尋" />
    </form>
    <div ref="menuEl" class="me">
      <button class="me-btn" :class="{ on: open }" aria-haspopup="menu" :aria-expanded="open" aria-label="我的" @click="open = !open">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M5 19.5c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
      <div v-if="open" class="me-menu" role="menu">
        <button role="menuitem" @click="go('/list')">我的片單</button>
        <button role="menuitem" @click="go('/history')">觀看紀錄</button>
        <button role="menuitem" @click="go('/settings')">設定</button>
        <hr />
        <p class="me-cap">備份與還原</p>
        <button role="menuitem" @click="download">匯出備份檔</button>
        <button role="menuitem" @click="pick">匯入備份檔</button>
      </div>
      <input ref="file" type="file" accept="application/json,.json" hidden @change="restore" />
    </div>
  </header>
</template>
