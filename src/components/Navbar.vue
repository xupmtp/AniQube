<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();
const q = ref('');
const solid = ref(false);
const onScroll = () => { solid.value = window.scrollY > 40; };
onMounted(() => { onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); });
onUnmounted(() => window.removeEventListener('scroll', onScroll));

function search() {
  const v = q.value.trim();
  router.push(v ? { path: '/browse', query: { q: v } } : { path: '/browse' });
}
</script>

<template>
  <header class="nav" :class="{ solid: solid || route.path !== '/' }">
    <RouterLink to="/" class="logo" aria-label="動漫立方 AniQube 首頁">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <path d="M16 3 28 9.5v13L16 29 4 22.5v-13z" fill="#6c7bff" /><path d="M16 3 28 9.5 16 16 4 9.5z" fill="#a5b0ff" />
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
  </header>
</template>
