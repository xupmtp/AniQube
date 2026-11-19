<script setup lang="ts">
// 劇場版與特別篇（含合集）的列表：作品頁與播放頁的季選單選到這一項時顯示。
// 配音在列表上方統一選（lang）；那一部沒有這個配音就播原聲，並標出有的配音
import { fmtDur } from '../catalog.ts';
import { isWatched } from '../store.ts';
import type { Season } from '../types.ts';

const props = defineProps<{ id: string; items: { x: Season; s: number }[]; cur?: string; lang?: string }>();
const enc = encodeURIComponent;
const dubOf = (x: Season) => x.dubs.find((d) => d.lang === props.lang) ?? x.dubs[0];
</script>

<template>
  <ol class="eps">
    <li v-for="sp in items" :key="sp.s">
      <RouterLink :to="`/watch/${enc(id)}/${dubOf(sp.x).episodes[0].id}`" :class="{ cur: sp.x.dubs.some((d) => d.episodes.some((e) => e.id === cur)) }">
        <b>▶</b><span :title="dubOf(sp.x).episodes[0].title"><i v-if="sp.x.type" class="sp-type">{{ sp.x.type }}</i>{{ sp.x.name }}</span>
        <small><span v-if="isWatched(id, dubOf(sp.x).episodes[0].id)" class="tick" aria-label="看過">✓</span><template v-if="dubOf(sp.x).episodes.length > 1">{{ dubOf(sp.x).episodes.length }} 集</template><template v-else>{{ fmtDur(dubOf(sp.x).episodes[0].sec) }}</template><template v-if="lang && dubOf(sp.x).lang !== lang"> · 僅{{ [...new Set(sp.x.dubs.map((d) => d.lang))].join('／') }}</template></small>
      </RouterLink>
    </li>
  </ol>
</template>
