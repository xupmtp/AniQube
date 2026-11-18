<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { LocationQueryValue } from 'vue-router';
import { FORMATS, ORIGINS, SORTS, STATUS, filterSeasons, sortSeasons, topGenres } from '../catalog.ts';
import type { Filters, SortKey } from '../catalog.ts';
import { loadCatalog } from '../data.ts';
import type { Catalog } from '../types.ts';
import Card from '../components/Card.vue';

const route = useRoute();
const router = useRouter();
const cat = ref<Catalog | null>(null);
const err = ref('');
const limit = ref(60);
onMounted(async () => {
  try { cat.value = await loadCatalog(); } catch (e) { err.value = e instanceof Error ? e.message : String(e); }
});

const str = (v: LocationQueryValue | LocationQueryValue[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const filters = computed<Filters>(() => ({
  q: str(route.query.q), genres: str(route.query.genre) ? str(route.query.genre).split(',') : [],
  origin: str(route.query.origin), year: str(route.query.year), channel: str(route.query.channel),
  status: str(route.query.status), format: str(route.query.format),
}));
const sort = computed<SortKey>(() => (str(route.query.sort) in SORTS ? (str(route.query.sort) as SortKey) : 'popularity'));

function set(patch: Record<string, string>) {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) { const s = str(v as LocationQueryValue); if (s) q[k] = s; }
  router.replace({ query: q });
}
const toggleGenre = (g: string) => {
  const cur = filters.value.genres;
  set({ genre: (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]).join(',') });
};

watch(() => route.query, () => { limit.value = 60; });
const seasons = computed(() => cat.value?.seasons ?? []);
const result = computed(() => sortSeasons(filterSeasons(seasons.value, filters.value), sort.value));
const genreChips = computed(() => topGenres(seasons.value, 30));
const years = computed(() => [...new Set(seasons.value.map((s) => s.year).filter((y): y is number => y != null))].sort((a, b) => b - a));
const active = computed(() => Object.keys(route.query).some((k) => k !== 'sort'));
</script>

<template>
  <section class="browse">
    <p v-if="err" class="state">{{ err }}</p>
    <p v-else-if="!cat" class="state">載入中…</p>
    <template v-else>
      <div class="filters">
        <input class="q" type="search" placeholder="搜尋作品、日文、英文名" :value="filters.q" aria-label="搜尋" @input="set({ q: ($event.target as HTMLInputElement).value })" />
        <label>排序
          <select :value="sort" @change="set({ sort: ($event.target as HTMLSelectElement).value })">
            <option v-for="(label, k) in SORTS" :key="k" :value="k">{{ label }}</option>
          </select>
        </label>
        <label>製作國
          <select :value="filters.origin" @change="set({ origin: ($event.target as HTMLSelectElement).value })">
            <option value="">全部</option><option v-for="(label, k) in ORIGINS" :key="k" :value="k">{{ label }}</option>
          </select>
        </label>
        <label>年份
          <select :value="filters.year" @change="set({ year: ($event.target as HTMLSelectElement).value })">
            <option value="">全部</option><option v-for="y in years" :key="y" :value="String(y)">{{ y }}</option>
          </select>
        </label>
        <label>片源
          <select :value="filters.channel" @change="set({ channel: ($event.target as HTMLSelectElement).value })">
            <option value="">全部</option><option v-for="c in cat.channels" :key="c.key" :value="c.key">{{ c.name }}</option>
          </select>
        </label>
        <label>狀態
          <select :value="filters.status" @change="set({ status: ($event.target as HTMLSelectElement).value })">
            <option value="">全部</option><option v-for="(label, k) in { RELEASING: STATUS.RELEASING, FINISHED: STATUS.FINISHED }" :key="k" :value="k">{{ label }}</option>
          </select>
        </label>
        <label>類型
          <select :value="filters.format" @change="set({ format: ($event.target as HTMLSelectElement).value })">
            <option value="">全部</option><option v-for="(label, k) in FORMATS" :key="k" :value="k">{{ label }}</option>
          </select>
        </label>
      </div>
      <div class="chips pick">
        <button v-for="g in genreChips" :key="g" :class="{ on: filters.genres.includes(g) }" @click="toggleGenre(g)">{{ g }}</button>
      </div>
      <p class="count">
        {{ result.length }} 部作品
        <button v-if="active" class="link" @click="router.replace({ query: {} })">清除篩選</button>
      </p>
      <div v-if="result.length" class="grid">
        <Card v-for="s in result.slice(0, limit)" :key="s.id" :season="s" />
      </div>
      <p v-else class="state">沒有符合的作品。換個關鍵字，或清除篩選看看。</p>
      <button v-if="result.length > limit" class="btn more" @click="limit += 60">顯示更多</button>
    </template>
  </section>
</template>
