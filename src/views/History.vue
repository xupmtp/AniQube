<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { epName, posterOf } from '../catalog.ts';
import { loadCatalog, loadDetail } from '../data.ts';
import { clearHistory, historyIds, progress, settings, watched } from '../store.ts';
import type { Catalog, Detail } from '../types.ts';
import { locate } from '../work.ts';

const cat = ref<Catalog | null>(null);
const err = ref('');
const details = ref<Record<string, Detail>>({});
onMounted(async () => {
  try { cat.value = await loadCatalog(); } catch (e) { err.value = e instanceof Error ? e.message : String(e); return; }
  // 「最後看到第幾集」要靠作品詳細資料把影片 ID 換成集數；觀看紀錄通常不多，逐一載入
  for (const { id } of historyIds()) loadDetail(id).then((d) => { details.value[id] = d; }).catch(() => {});
});

const rows = computed(() => {
  const byId = new Map((cat.value?.works ?? []).map((w) => [w.id, w]));
  return historyIds().flatMap(({ id, at }) => {
    const w = byId.get(id);
    if (!w) return [];
    const last = progress[id]?.ep ?? watched[id]?.at(-1);
    const d = details.value[id], spot = d && last ? locate(d, last) : null;
    const where = spot ? `${d.seasons[spot.s].name} ${epName(d.seasons[spot.s].dubs[spot.d].episodes[spot.i])}` : '';
    return [{ w, at, where, count: watched[id]?.length ?? 0 }];
  });
});
const day = (at: number) => (at ? new Date(at).toLocaleDateString('zh-TW') : '較早');
function wipe(id: string, title: string) { if (confirm(`清除「${title}」的觀看紀錄？續播進度和看過的標記都會消失。`)) clearHistory(id); }
const enc = encodeURIComponent;
</script>

<template>
  <section class="browse">
    <p v-if="err" class="state">{{ err }}</p>
    <p v-else-if="!cat" class="state">載入中…</p>
    <template v-else>
      <div class="page-head"><h1>觀看紀錄</h1></div>
      <p v-if="settings.pauseHistory" class="note-bar">觀看紀錄已暫停，播放時不會記錄進度和看過的集。<RouterLink to="/settings">到設定恢復記錄</RouterLink></p>
      <ol v-if="rows.length" class="history">
        <li v-for="r in rows" :key="r.w.id">
          <RouterLink class="h-thumb" :to="`/title/${enc(r.w.id)}`"><img :src="posterOf(r.w)" :alt="r.w.title" loading="lazy" /></RouterLink>
          <div class="h-info">
            <RouterLink :to="`/title/${enc(r.w.id)}`"><strong>{{ r.w.title }}</strong></RouterLink>
            <small>{{ r.where ? `最後看到 ${r.where}` : '' }}{{ r.where && r.count ? ' · ' : '' }}{{ r.count ? `看過 ${r.count} 集` : '' }}</small>
            <small class="h-day">{{ day(r.at) }}</small>
          </div>
          <div class="h-acts">
            <RouterLink class="btn primary" :to="`/watch/${enc(r.w.id)}`">▶ 繼續</RouterLink>
            <button class="btn ghost" @click="wipe(r.w.id, r.w.title)">清除紀錄</button>
          </div>
        </li>
      </ol>
      <div v-else class="empty">
        <p>還沒有觀看紀錄。看任何一集超過 30 秒就會記在這裡。</p>
        <RouterLink class="btn primary" to="/browse">去瀏覽作品</RouterLink>
      </div>
    </template>
  </section>
</template>
