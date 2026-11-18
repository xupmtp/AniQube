<script setup lang="ts">
import type { Work } from '../types.ts';
import { metaLine, posterOf } from '../catalog.ts';
import { hasNew } from '../store.ts';

defineProps<{ work: Work; resume?: boolean; rank?: number }>();
</script>

<template>
  <RouterLink class="card" :to="`/title/${encodeURIComponent(work.id)}`">
    <span v-if="rank" class="rank" aria-hidden="true">{{ rank }}</span>
    <div class="thumb">
      <img :src="posterOf(work)" :alt="work.title" loading="lazy" />
      <span v-if="work.score" class="badge">★ {{ (work.score / 10).toFixed(1) }}</span>
      <span v-if="resume" class="badge resume">繼續觀看</span>
      <span v-if="hasNew(work)" class="badge new">有新集</span>
    </div>
    <div class="info">
      <strong>{{ work.title }}</strong>
      <small>{{ metaLine(work) }}</small>
      <small class="g">{{ [...work.genres, ...work.tags].slice(0, 3).join(' · ') }}</small>
    </div>
  </RouterLink>
</template>
