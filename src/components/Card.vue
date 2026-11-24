<script setup lang="ts">
import type { Work } from '../types.ts';
import { membersNote, metaLine, mostlyMembers, posterOf } from '../catalog.ts';
import { canHover, hoverIn, hoverOut, openSheet } from '../preview.ts';
import { hasNew, hasWatched, progress } from '../store.ts';

// seen：看過的作品標「看過」（相似作品列用）
const props = defineProps<{ work: Work; resume?: boolean; rank?: number; seen?: boolean }>();
// 點卡片直接播放（仿 Netflix）：有紀錄從上次的集數與秒數繼續，沒看過從第一季第一集。觸控裝置點卡片先開底部面板
function tap(e: MouseEvent) { if (!canHover()) { e.preventDefault(); openSheet(props.work, !!props.resume); } }
const pct = () => { const p = progress[props.work.id]; return props.resume && p?.d ? Math.min(100, Math.round((p.t / p.d) * 100)) : 0; };
</script>

<template>
  <RouterLink class="card" :to="`/watch/${encodeURIComponent(work.id)}`" @mouseenter="canHover() && hoverIn(work, $event.currentTarget as Element, !!resume)" @mouseleave="canHover() && hoverOut()" @click.capture="tap">
    <span v-if="rank" class="rank" aria-hidden="true">{{ rank }}</span>
    <div class="thumb">
      <img :src="posterOf(work)" :alt="work.title" loading="lazy" />
      <span v-if="work.score" class="badge">★ {{ (work.score / 10).toFixed(1) }}</span>
      <span v-if="resume" class="badge resume">繼續觀看</span>
      <span v-else-if="seen && hasWatched(work.id)" class="badge resume">看過</span>
      <span v-if="hasNew(work)" class="badge new">有新集</span>
      <span v-if="work.memberEps" class="badge lock" :class="{ most: mostlyMembers(work) }" :title="membersNote(work)" role="img" :aria-label="membersNote(work)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" /></svg></span>
      <div v-if="pct()" class="pv-bar on-card"><i :style="{ width: `${pct()}%` }"></i></div>
    </div>
    <div class="info">
      <strong>{{ work.title }}</strong>
      <small>{{ metaLine(work) }}</small>
      <small class="g">{{ [...work.genres, ...work.tags].slice(0, 3).join(' · ') }}</small>
    </div>
  </RouterLink>
</template>
