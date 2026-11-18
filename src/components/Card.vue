<script setup lang="ts">
import type { Work } from '../types.ts';
import { metaLine, posterOf } from '../catalog.ts';

defineProps<{ work: Work; resume?: boolean }>();
</script>

<template>
  <RouterLink class="card" :to="`/title/${encodeURIComponent(work.id)}`">
    <div class="thumb">
      <img :src="posterOf(work)" :alt="work.title" loading="lazy" />
      <span v-if="work.score" class="badge">★ {{ (work.score / 10).toFixed(1) }}</span>
      <span v-if="resume" class="badge resume">繼續觀看</span>
    </div>
    <div class="info">
      <strong>{{ work.title }}</strong>
      <small>{{ metaLine(work) }}</small>
      <small class="g">{{ [...work.genres, ...work.tags].slice(0, 3).join(' · ') }}</small>
    </div>
  </RouterLink>
</template>
