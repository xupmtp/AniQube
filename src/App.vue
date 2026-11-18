<script setup lang="ts">
import Navbar from './components/Navbar.vue';
import Preview from './components/Preview.vue';
import { toast } from './share.ts';
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
