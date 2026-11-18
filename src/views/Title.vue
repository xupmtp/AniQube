<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { epTitle, fmtDur, metaLine, posterOf } from '../catalog.ts';
import { loadCatalog, loadDetail } from '../data.ts';
import { inList, progress, toggleList } from '../store.ts';
import type { Detail, Season } from '../types.ts';

const route = useRoute();
const id = computed(() => String(route.params.id));
const season = ref<Season | null>(null);
const detail = ref<Detail | null>(null);
const state = ref<'load' | 'ok' | 'missing'>('load');

watch(id, async (v) => {
  state.value = 'load'; season.value = null; detail.value = null;
  try {
    season.value = (await loadCatalog()).seasons.find((s) => s.id === v) ?? null;
    if (!season.value) { state.value = 'missing'; return; }
    detail.value = await loadDetail(v);
    state.value = 'ok';
  } catch { state.value = 'missing'; }
}, { immediate: true });

const resumeEp = computed(() => detail.value?.episodes.find((e) => e.id === progress[id.value]?.ep));
const enc = encodeURIComponent;
</script>

<template>
  <p v-if="state === 'load'" class="state">載入中…</p>
  <p v-else-if="state === 'missing' || !season" class="state">找不到這部作品，它可能已經下架。<RouterLink to="/browse">回瀏覽頁</RouterLink></p>
  <article v-else class="title-page">
    <div class="backdrop" :style="{ backgroundImage: `url(${posterOf(season)})` }"></div>
    <div class="body">
      <h1>{{ season.title }}</h1>
      <p class="meta">{{ metaLine(season) }}<template v-if="season.score"> · ★ {{ (season.score / 10).toFixed(1) }}</template></p>
      <p class="chips"><span v-for="g in [...season.genres, ...season.tags]" :key="g">{{ g }}</span></p>
      <p v-if="detail?.desc" class="desc" lang="en">{{ detail.desc }}</p>
      <div class="actions">
        <RouterLink class="btn primary" :to="`/watch/${enc(season.id)}`">▶ {{ resumeEp ? '繼續觀看' : '播放' }}</RouterLink>
        <button class="btn" @click="toggleList(season.id)">{{ inList(season.id) ? '✓ 已在片單' : '＋ 加入片單' }}</button>
      </div>
      <h2>集數</h2>
      <ol class="eps">
        <li v-for="e in detail?.episodes" :key="e.id">
          <RouterLink :to="`/watch/${enc(season.id)}/${e.id}`" :class="{ cur: e.id === resumeEp?.id }">
            <b>{{ e.n }}</b><span>{{ epTitle(e.title) }}</span>
            <small>{{ fmtDur(e.sec) }}<template v-if="e.ext"> · 在 YouTube 觀看</template></small>
          </RouterLink>
        </li>
      </ol>
    </div>
  </article>
</template>
