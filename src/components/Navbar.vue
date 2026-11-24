<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { standalone } from '../install.ts';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();
const q = ref('');
const solid = ref(false);
// 手機：往下捲收起導覽列、往上滑立刻出現（仿 Netflix 手機版）；點導覽列空白處捲回最上面
const hide = ref(false);
let lastY = 0;
const onScroll = () => {
  const y = window.scrollY;
  solid.value = y > 40;
  hide.value = matchMedia('(max-width: 900px)').matches && y > 120 && y > lastY;
  lastY = y;
};
const toTop = (e: MouseEvent) => { if (e.target === e.currentTarget) window.scrollTo({ top: 0, behavior: 'smooth' }); };
// 右上角個人選單（仿 Netflix）：片單、觀看紀錄、設定（備份與還原在設定頁）
const open = ref(false);
const menuEl = ref<HTMLElement | null>(null);
const onDoc = (e: Event) => { if (open.value && !menuEl.value?.contains(e.target as Node)) open.value = false; };
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { open.value = false; searchOpen.value = false; } };
onMounted(() => {
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
  document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey);
});
// 主畫面 App 沒有瀏覽器的返回鍵：有上一頁時在最左邊補一顆
const canBack = computed(() => (route.fullPath, standalone() && !!(history.state as { back?: string } | null)?.back));
function go(path: string) { open.value = false; router.push(path); }

// 手機：放大鏡切換開關搜尋框（搜尋框在導覽列下方展開，送出後收起）
const searchOpen = ref(false);
// 全站只有導覽列這一個搜尋框：在瀏覽頁邊打邊篩（網址的 q 跟著變），其他頁按 Enter 才到瀏覽頁搜尋。
// 搜尋框內容跟著瀏覽頁的 q；換頁時收起手機展開的搜尋框
const onBrowse = computed(() => route.path === '/browse');
watch(() => [route.path, route.query.q], () => { q.value = onBrowse.value ? String(route.query.q ?? '') : ''; }, { immediate: true });
watch(() => route.path, () => { searchOpen.value = false; });
function live() { if (onBrowse.value) router.replace({ query: { ...route.query, q: q.value || undefined } }); }
function clearQ() { q.value = ''; live(); qEl.value?.focus(); }
const qEl = ref<HTMLInputElement | null>(null);
async function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) { await nextTick(); qEl.value?.focus(); }
}
function search() {
  searchOpen.value = false;
  qEl.value?.blur(); // 手機收起鍵盤
  if (onBrowse.value) return; // 瀏覽頁已經邊打邊篩
  const v = q.value.trim();
  router.push(v ? { path: '/browse', query: { q: v } } : { path: '/browse' });
}
</script>

<template>
  <header class="nav" :class="{ solid: solid || route.path !== '/', hide }" @click="toTop">
    <button v-if="canBack" class="nav-back" aria-label="上一頁" @click="router.back()">‹</button>
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
    <form class="search" :class="{ open: searchOpen }" role="search" @submit.prevent="search">
      <svg class="s-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      <input ref="qEl" v-model="q" type="search" enterkeyhint="search" placeholder="搜尋作品、日文、英文名" aria-label="搜尋" @input="live" />
      <button v-if="q" type="button" class="s-clear" aria-label="清除搜尋" @click="clearQ">✕</button>
    </form>
    <button class="search-ico" :class="{ on: searchOpen }" :aria-expanded="searchOpen" :aria-label="searchOpen ? '關閉搜尋' : '搜尋'" @click="toggleSearch">
      <svg v-if="!searchOpen" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </button>
    <div ref="menuEl" class="me">
      <button class="me-btn" :class="{ on: open }" aria-haspopup="menu" :aria-expanded="open" aria-label="我的" @click="open = !open">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M5 19.5c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
      <div v-if="open" class="me-menu" role="menu">
        <button role="menuitem" @click="go('/list')">我的片單</button>
        <button role="menuitem" @click="go('/history')">觀看紀錄</button>
        <button role="menuitem" @click="go('/settings')">設定</button>
      </div>
    </div>
  </header>
</template>
