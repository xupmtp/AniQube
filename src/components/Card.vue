<script setup lang="ts">
import type { Season } from '../types.ts';
import { metaLine, posterOf } from '../catalog.ts';

defineProps<{ season: Season; resume?: boolean }>();
</script>

<template>
  <RouterLink class="card" :to="`/title/${encodeURIComponent(season.id)}`">
    <div class="thumb">
      <img :src="posterOf(season)" :alt="season.title" loading="lazy" />
      <span v-if="season.score" class="badge">★ {{ (season.score / 10).toFixed(1) }}</span>
      <span v-if="resume" class="badge resume">繼續觀看</span>
    </div>
    <div class="info">
      <strong>{{ season.title }}</strong>
      <small>{{ metaLine(season) }}</small>
      <small class="g">{{ [...season.genres, ...season.tags].slice(0, 3).join(' · ') }}</small>
    </div>
  </RouterLink>
</template>
