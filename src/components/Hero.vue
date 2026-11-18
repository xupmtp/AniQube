<script setup lang="ts">
import type { Season } from '../types.ts';
import { metaLine, posterOf } from '../catalog.ts';

defineProps<{ season: Season }>();
</script>

<template>
  <section class="hero" :style="{ backgroundImage: `url(${posterOf(season)})` }">
    <div class="shade">
      <h1>{{ season.title }}</h1>
      <p class="meta">{{ metaLine(season) }}<template v-if="season.score"> · ★ {{ (season.score / 10).toFixed(1) }}</template></p>
      <p class="chips"><span v-for="g in [...season.genres, ...season.tags].slice(0, 5)" :key="g">{{ g }}</span></p>
      <div class="actions">
        <RouterLink class="btn primary" :to="`/watch/${encodeURIComponent(season.id)}`">▶ 播放</RouterLink>
        <RouterLink class="btn" :to="`/title/${encodeURIComponent(season.id)}`">詳細資訊</RouterLink>
      </div>
    </div>
  </section>
</template>
