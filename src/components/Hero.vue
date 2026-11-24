<script setup lang="ts">
import type { Work } from '../types.ts';
import { metaLine, posterOf, tagLink } from '../catalog.ts';

defineProps<{ work: Work }>();
</script>

<template>
  <section class="hero" :style="{ backgroundImage: `url(${posterOf(work)})` }">
    <div class="shade">
      <p class="kicker">主打推薦</p>
      <h1>{{ work.title }}</h1>
      <p class="meta">{{ metaLine(work) }}</p>
      <p class="chips"><RouterLink v-for="g in [...work.genres, ...work.tags].slice(0, 5)" :key="g" :to="tagLink(g)">{{ g }}</RouterLink></p>
      <div class="actions">
        <RouterLink class="btn primary" :to="`/watch/${encodeURIComponent(work.id)}`">▶ 播放</RouterLink>
        <RouterLink class="btn" :to="`/title/${encodeURIComponent(work.id)}`">詳細資訊</RouterLink>
      </div>
    </div>
  </section>
</template>
