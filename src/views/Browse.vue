<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { LocationQueryValue } from 'vue-router';
import { FORMATS, ORIGINS, SORTS, STATUS, filterWorks, sortWorks, topGenres } from '../catalog.ts';
import type { Filters, SortKey } from '../catalog.ts';
import { loadCatalog } from '../data.ts';
import type { Catalog } from '../types.ts';
import Card from '../components/Card.vue';

const route = useRoute();
const router = useRouter();
const cat = ref<Catalog | null>(null);
const err = ref('');
const limit = ref(60);
const open = ref(false); // 篩選面板；平常收起來，只留搜尋、排序與已選條件
// 點面板以外的地方或按 Esc 收起（點「篩選」按鈕本身由按鈕切換）
const panelEl = ref<HTMLElement | null>(null), toggleEl = ref<HTMLElement | null>(null);
const onDoc = (e: Event) => { if (open.value && !panelEl.value?.contains(e.target as Node) && !toggleEl.value?.contains(e.target as Node)) open.value = false; };
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open.value = false; };
onMounted(async () => {
  document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey);
  try { cat.value = await loadCatalog(); } catch (e) { err.value = e instanceof Error ? e.message : String(e); }
});
onUnmounted(() => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); });

const str = (v: LocationQueryValue | LocationQueryValue[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const filters = computed<Filters>(() => ({
  q: str(route.query.q), genres: str(route.query.genre) ? str(route.query.genre).split(',') : [],
  origin: str(route.query.origin), year: str(route.query.year),
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

// 已選條件：顯示成可以點 × 移除的標籤
const picked = computed(() => {
  const f = filters.value;
  return [
    ...f.genres.map((g) => ({ key: `g:${g}`, label: g, clear: () => toggleGenre(g) })),
    ...(f.origin ? [{ key: 'origin', label: ORIGINS[f.origin] ?? f.origin, clear: () => set({ origin: '' }) }] : []),
    ...(f.year ? [{ key: 'year', label: `${f.year} 年`, clear: () => set({ year: '' }) }] : []),
    ...(f.status ? [{ key: 'status', label: STATUS[f.status] ?? f.status, clear: () => set({ status: '' }) }] : []),
    ...(f.format ? [{ key: 'format', label: FORMATS[f.format] ?? f.format, clear: () => set({ format: '' }) }] : []),
  ];
});
const clearAll = () => router.replace({ query: filters.value.q ? { q: filters.value.q } : {} });

watch(() => route.query, () => { limit.value = 60; });
const works = computed(() => cat.value?.works ?? []);
const result = computed(() => sortWorks(filterWorks(works.value, filters.value), sort.value));
// 題材一列（AniList 的題材與標籤合在一起，觀看者不需要分）：依作品數由多到少，平常只列前 12 個與已選的，其餘收在「更多」
const allGenres = computed(() => topGenres(works.value, Infinity));
const moreGenres = ref(false);
const genreChips = computed(() => (moreGenres.value ? allGenres.value : allGenres.value.filter((g, i) => i < 12 || filters.value.genres.includes(g))));
const hiddenGenres = computed(() => allGenres.value.length - genreChips.value.length);
const origins = computed(() => Object.keys(ORIGINS).filter((k) => works.value.some((w) => w.origin === k)));
const years = computed(() => [...new Set(works.value.map((s) => s.year).filter((y): y is number => y != null))].sort((a, b) => b - a));
</script>

<template>
  <section class="browse">
    <p v-if="err" class="state">{{ err }}</p>
    <p v-else-if="!cat" class="state">載入中…</p>
    <template v-else>
      <div class="toolbar">
        <input class="q" type="search" placeholder="搜尋作品、日文、英文名" :value="filters.q" aria-label="搜尋" @input="set({ q: ($event.target as HTMLInputElement).value })" />
        <label class="sort"><span class="sr-only">排序</span>
          <select :value="sort" aria-label="排序" @change="set({ sort: ($event.target as HTMLSelectElement).value })">
            <option v-for="(label, k) in SORTS" :key="k" :value="k">{{ label }}</option>
          </select>
        </label>
        <button ref="toggleEl" class="toggle" :class="{ on: open || picked.length }" :aria-expanded="open" aria-controls="filter-panel" @click="open = !open">
          篩選<template v-if="picked.length"> · {{ picked.length }}</template>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" /></svg>
        </button>
      </div>

      <div v-if="open" id="filter-panel" ref="panelEl" class="panel">
        <div class="lane">
          <span class="lane-label">題材</span>
          <div class="chips genre-chips">
            <button :class="{ on: !filters.genres.length }" @click="set({ genre: '' })">全部</button>
            <button v-for="g in genreChips" :key="g" :class="{ on: filters.genres.includes(g) }" :aria-pressed="filters.genres.includes(g)" @click="toggleGenre(g)">{{ g }}</button>
            <button v-if="moreGenres || hiddenGenres" class="genre-more" :aria-expanded="moreGenres" @click="moreGenres = !moreGenres">{{ moreGenres ? '收起 ▴' : `更多 ${hiddenGenres} ▾` }}</button>
          </div>
        </div>
        <div class="lane">
          <span class="lane-label">國家</span>
          <div class="lane-scroll chips">
            <button :class="{ on: !filters.origin }" @click="set({ origin: '' })">全部</button>
            <button v-for="k in origins" :key="k" :class="{ on: filters.origin === k }" :aria-pressed="filters.origin === k" @click="set({ origin: filters.origin === k ? '' : k })">{{ ORIGINS[k] }}</button>
          </div>
        </div>
        <div class="lane">
          <span class="lane-label">進階</span>
          <div class="advanced">
            <select :value="filters.year" aria-label="年份" @change="set({ year: ($event.target as HTMLSelectElement).value })">
              <option value="">年份：全部</option><option v-for="y in years" :key="y" :value="String(y)">{{ y }}</option>
            </select>
            <select :value="filters.status" aria-label="狀態" @change="set({ status: ($event.target as HTMLSelectElement).value })">
              <option value="">狀態：全部</option><option v-for="(label, k) in { RELEASING: STATUS.RELEASING, FINISHED: STATUS.FINISHED }" :key="k" :value="k">{{ label }}</option>
            </select>
            <select :value="filters.format" aria-label="類型" @change="set({ format: ($event.target as HTMLSelectElement).value })">
              <option value="">類型：全部</option><option v-for="(label, k) in FORMATS" :key="k" :value="k">{{ label }}</option>
            </select>
          </div>
        </div>
      </div>

      <div class="status-line">
        <button v-for="p in picked" :key="p.key" class="picked" :aria-label="`移除 ${p.label}`" @click="p.clear()">
          {{ p.label }}<span aria-hidden="true">×</span>
        </button>
        <button v-if="picked.length" class="link" @click="clearAll">清除全部</button>
        <span class="count">{{ result.length }} 部作品</span>
      </div>

      <div v-if="result.length" class="grid">
        <Card v-for="w in result.slice(0, limit)" :key="w.id" :work="w" />
      </div>
      <p v-else class="state">沒有符合的作品。換個關鍵字，或清除篩選看看。</p>
      <button v-if="result.length > limit" class="btn more" @click="limit += 60">顯示更多</button>
    </template>
  </section>
</template>
