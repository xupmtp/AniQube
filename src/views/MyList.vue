<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { sortWorks } from '../catalog.ts';
import { loadCatalog } from '../data.ts';
import { myList } from '../store.ts';
import type { Catalog, Work } from '../types.ts';
import Card from '../components/Card.vue';

const cat = ref<Catalog | null>(null);
const err = ref('');
const order = ref<'added' | 'updated'>('added');
onMounted(async () => {
  try { cat.value = await loadCatalog(); } catch (e) { err.value = e instanceof Error ? e.message : String(e); }
});

// 片單依加入時間新到舊（toggleList 把新加的放最前面）；已下架的作品略過
const works = computed(() => {
  const byId = new Map((cat.value?.works ?? []).map((w) => [w.id, w]));
  const list = myList.map((id) => byId.get(id)).filter((w): w is Work => !!w);
  return order.value === 'updated' ? sortWorks(list, 'updated') : list;
});
</script>

<template>
  <section class="browse">
    <p v-if="err" class="state">{{ err }}</p>
    <p v-else-if="!cat" class="state">載入中…</p>
    <template v-else>
      <div class="page-head">
        <h1>我的片單</h1>
        <label v-if="works.length" class="sort"><span class="sr-only">排序</span>
          <select v-model="order" aria-label="排序">
            <option value="added">加入時間</option>
            <option value="updated">最近更新</option>
          </select>
        </label>
      </div>
      <div v-if="works.length" class="grid">
        <Card v-for="w in works" :key="w.id" :work="w" />
      </div>
      <div v-else class="empty">
        <p>還沒有收藏的作品。在卡片上按「＋」就會加到這裡。</p>
        <RouterLink class="btn primary" to="/browse">去瀏覽作品</RouterLink>
      </div>
    </template>
  </section>
</template>
