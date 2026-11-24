<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { standalone } from '../install.ts';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();
const q = ref('');
const solid = ref(false);
const onScroll = () => { solid.value = window.scrollY > 40; };
// 右上角個人選單（仿 Netflix）：片單、觀看紀錄、設定（備份與還原在設定頁）
const open = ref(false);
const menuEl = ref<HTMLElement | null>(null);
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
// 主畫面 App 沒有瀏覽器的返回鍵：有上一頁時在最左邊補一顆
const canBack = computed(() => (route.fullPath, standalone() && !!(history.state as { back?: string } | null)?.back));
function go(path: string) { open.value = false; router.push(path); }

function search() {
  const v = q.value.trim();
  router.push(v ? { path: '/browse', query: { q: v } } : { path: '/browse' });
}
</script>

<template>
  <header class="nav" :class="{ solid: solid || route.path !== '/' }">
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
      </div>
    </div>
  </header>
</template>
