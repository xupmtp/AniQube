<script setup lang="ts">
// 劇場版與特別篇（含合集）的列表：作品頁與播放頁的季選單選到這一項時顯示
import { fmtDur } from '../catalog.ts';
import { isWatched } from '../store.ts';
import type { Season } from '../types.ts';
import { sourcesOf } from '../work.ts';

defineProps<{ id: string; items: { x: Season; s: number }[]; labels: Record<string, string>; cur?: string }>();
const enc = encodeURIComponent;
</script>

<template>
  <ol class="eps">
    <li v-for="sp in items" :key="sp.s">
      <RouterLink :to="`/watch/${enc(id)}/${sp.x.dubs[0].episodes[0].id}`" :class="{ cur: sp.x.dubs.some((d) => d.episodes.some((e) => e.id === cur)) }">
        <b>▶</b><span :title="sp.x.dubs[0].episodes[0].title"><i v-if="sp.x.type" class="sp-type">{{ sp.x.type }}</i>{{ sp.x.name }}</span>
        <small><span v-if="isWatched(id, sp.x.dubs[0].episodes[0].id)" class="tick" aria-label="看過">✓</span><template v-if="sp.x.dubs[0].episodes.length > 1">{{ sp.x.dubs[0].episodes.length }} 集</template><template v-else>{{ fmtDur(sp.x.dubs[0].episodes[0].sec) }}</template><template v-if="sp.x.dubs.length > 1"> · {{ sp.x.dubs[0].lang }}<template v-if="sourcesOf(sp.x).length > 1"> · {{ labels[sp.x.dubs[0].ch ?? ''] }}</template></template></small>
      </RouterLink>
      <RouterLink v-for="d in sp.x.dubs.slice(1)" :key="d.lang + d.ch" class="alt-dub" :to="`/watch/${enc(id)}/${d.episodes[0].id}`">
        <b></b><span>{{ d.lang }}配音<template v-if="sourcesOf(sp.x).length > 1"> · {{ labels[d.ch ?? ''] }}</template></span><small>{{ fmtDur(d.episodes[0].sec) }}</small>
      </RouterLink>
    </li>
  </ol>
</template>
