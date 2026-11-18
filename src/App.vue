<script setup lang="ts">
import Navbar from './components/Navbar.vue';
import Preview from './components/Preview.vue';
import { toast } from './share.ts';

// 彈出的小視窗（<details class="pop">：分享、快捷鍵）：點外面或按 Esc 就關閉
const shut = (keep?: Node) => document.querySelectorAll('details.pop[open]').forEach((d) => { if (!keep || !d.contains(keep)) d.removeAttribute('open'); });
document.addEventListener('pointerdown', (e) => shut(e.target as Node));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); });
addEventListener('blur', () => shut()); // 點進 YouTube 播放器（iframe）收不到 pointerdown，焦點離開頁面時一併關閉
</script>

<template>
  <Navbar />
  <main><RouterView /></main>
  <Preview />
  <p class="toast" :class="{ on: toast.text }" role="status" aria-live="polite">{{ toast.text }}</p>
  <footer class="foot">
    <span>動漫立方 AniQube · 非官方網站，影片版權屬各片源頻道</span>
    <RouterLink to="/about">關於與版權</RouterLink>
  </footer>
</template>
