<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { emptyFilters, filterWorks, pickHero, sortWorks, topGenres } from '../catalog.ts';
import { loadCatalog } from '../data.ts';
import { myList, progress } from '../store.ts';
import type { Catalog, Work } from '../types.ts';
import Hero from '../components/Hero.vue';
import Row from '../components/Row.vue';

const cat = ref<Catalog | null>(null);
const err = ref('');
onMounted(async () => {
  try { cat.value = await loadCatalog(); } catch (e) { err.value = e instanceof Error ? e.message : String(e); }
});

const works = computed(() => cat.value?.works ?? []);
const byId = computed(() => new Map(works.value.map((s) => [s.id, s])));
const hero = computed(() => pickHero(works.value));
const known = (ids: string[]) => ids.map((id) => byId.value.get(id)).filter((s): s is Work => !!s); // 已下架的作品靜默略過
const resume = computed(() => known(Object.entries(progress).sort((a, b) => b[1].at - a[1].at).map(([id]) => id)));
const mine = computed(() => known(myList));

const top = (list: Work[], key: Parameters<typeof sortWorks>[1]) => sortWorks(list, key).slice(0, 24);
const rows = computed(() => {
  const all = works.value;
  const by = (o: object) => filterWorks(all, { ...emptyFilters(), ...o });
  return [
    { title: '最近更新', list: top(all, 'updated'), more: '/browse?sort=updated' },
    { title: '趨勢', list: top(all, 'trending'), more: '/browse?sort=trending' },
    { title: '人氣', list: top(all, 'popularity').slice(0, 10), more: '/browse', ranked: true },
    ...topGenres(all, 6).map((g) => ({ title: g, list: top(by({ genres: [g] }), 'popularity'), more: `/browse?genre=${encodeURIComponent(g)}` })),
    { title: '日本動畫', list: top(by({ origin: 'JP' }), 'popularity'), more: '/browse?origin=JP' },
    { title: '中國動畫', list: top(by({ origin: 'CN' }), 'popularity'), more: '/browse?origin=CN' },
  ];
});
</script>

<template>
  <p v-if="err" class="state">{{ err }}</p>
  <p v-else-if="!cat" class="state">載入中…</p>
  <template v-else>
    <Hero v-if="hero" :work="hero" />
    <div class="rows" :class="{ nohero: !hero }">
      <Row title="繼續觀看" :works="resume" resume />
      <Row title="我的片單" :works="mine" />
      <Row v-for="r in rows" :key="r.title" :title="r.title" :works="r.list" :more="r.more" :ranked="'ranked' in r" />
    </div>
  </template>
</template>
