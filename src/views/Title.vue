<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { epTitle, fmtDur, metaLine, playlistUrl, posterOf } from '../catalog.ts';
import { loadCatalog, loadDetail } from '../data.ts';
import { inList, progress, toggleList } from '../store.ts';
import type { Detail, Work } from '../types.ts';
import { episodeRows, firstSpot, locate } from '../work.ts';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const work = ref<Work | null>(null);
const detail = ref<Detail | null>(null);
const sel = ref({ s: 0, d: 0 }); // 正在看哪一季、哪個配音版的集數列表

watch(id, async (v) => {
  work.value = null; detail.value = null;
  try {
    work.value = (await loadCatalog()).works.find((w) => w.id === v) ?? null;
    if (!work.value) throw new Error('missing');
    const det = await loadDetail(v);
    const at = locate(det, progress[v]?.ep ?? '');
    sel.value = at && det.seasons[at.s].kind !== 'special' ? { s: at.s, d: at.d } : { s: firstSpot(det).s, d: 0 };
    detail.value = det;
  } catch { router.replace('/'); } // 已下架，或舊版以季為單位的網址
}, { immediate: true });

const resume = computed(() => (detail.value && progress[id.value] ? locate(detail.value, progress[id.value].ep) : null));
const indexed = computed(() => detail.value?.seasons.map((x, s) => ({ x, s })) ?? []);
const main = computed(() => indexed.value.filter(({ x }) => x.kind !== 'special'));
const specials = computed(() => indexed.value.filter(({ x }) => x.kind === 'special'));
const season = computed(() => detail.value?.seasons[sel.value.s]);
const rows = computed(() => (season.value ? episodeRows(season.value, sel.value.d) : []));

// 換季時沿用目前的配音版，那一季沒有就用原聲
function pickSeason(s: number) {
  const lang = season.value?.dubs[sel.value.d]?.lang;
  sel.value = { s, d: Math.max(0, detail.value!.seasons[s].dubs.findIndex((d) => d.lang === lang)) };
}
const enc = encodeURIComponent;
</script>

<template>
  <p v-if="!work || !detail" class="state">載入中…</p>
  <article v-else class="title-page">
    <div class="backdrop" :style="{ backgroundImage: `url(${posterOf(work)})` }"></div>
    <div class="body">
      <div class="head">
        <img v-if="work.cover" class="poster" :src="work.cover" :alt="work.title" />
        <div>
          <h1>{{ work.title }}</h1>
          <p class="meta">{{ metaLine(work) }}<template v-if="work.score"> · ★ {{ (work.score / 10).toFixed(1) }}</template></p>
          <p class="chips"><span v-for="g in [...work.genres, ...work.tags]" :key="g">{{ g }}</span></p>
        </div>
      </div>
      <p v-if="detail.desc" class="desc" lang="en">{{ detail.desc }}</p>
      <p v-if="detail.members" class="note">
        其餘集數為頻道會員限定，只能在 YouTube 觀看。
        <a :href="playlistUrl(detail.members)" target="_blank" rel="noopener noreferrer">前往 YouTube</a>
      </p>
      <div class="actions">
        <RouterLink class="btn primary" :to="`/watch/${enc(work.id)}`">▶ {{ resume ? '繼續觀看' : '播放' }}</RouterLink>
        <button class="btn" @click="toggleList(work.id)">{{ inList(work.id) ? '✓ 已在片單' : '＋ 加入片單' }}</button>
      </div>

      <template v-if="season && season.kind !== 'special'">
        <div class="pickers">
          <h2>集數</h2>
          <select v-if="main.length > 1" :value="sel.s" aria-label="選擇季" @change="pickSeason(Number(($event.target as HTMLSelectElement).value))">
            <option v-for="m in main" :key="m.s" :value="m.s">{{ m.x.name }}{{ m.x.kind === 'collection' ? '（合輯）' : '' }}</option>
          </select>
          <select v-if="season.dubs.length > 1" v-model.number="sel.d" aria-label="選擇配音">
            <option v-for="(d, i) in season.dubs" :key="d.lang" :value="i">{{ d.lang }}配音</option>
          </select>
        </div>
        <ol class="eps">
          <li v-for="r in rows" :key="r.n">
            <RouterLink v-if="r.ep" :to="`/watch/${enc(work.id)}/${r.ep.id}`" :class="{ cur: r.ep.id === progress[work.id]?.ep }">
              <b>{{ r.n }}</b><span :title="epTitle(r.ep.title)">{{ epTitle(r.ep.title, season.name) }}</span>
              <small>{{ fmtDur(r.ep.sec) }}<template v-if="r.ep.ext"> · 在 YouTube 觀看</template></small>
            </RouterLink>
            <div v-else class="none"><b>{{ r.n }}</b><span>無此配音</span></div>
          </li>
        </ol>
      </template>

      <template v-if="specials.length">
        <h2>劇場版／特別篇</h2>
        <ol class="eps">
          <li v-for="sp in specials" :key="sp.s">
            <RouterLink :to="`/watch/${enc(work.id)}/${sp.x.dubs[0].episodes[0].id}`">
              <b>▶</b><span>{{ sp.x.name }}</span>
              <small>{{ fmtDur(sp.x.dubs[0].episodes[0].sec) }}<template v-if="sp.x.dubs.length > 1"> · {{ sp.x.dubs[0].lang }}</template></small>
            </RouterLink>
            <RouterLink v-for="d in sp.x.dubs.slice(1)" :key="d.lang" class="alt-dub" :to="`/watch/${enc(work.id)}/${d.episodes[0].id}`">
              <b></b><span>{{ d.lang }}配音</span><small>{{ fmtDur(d.episodes[0].sec) }}</small>
            </RouterLink>
          </li>
        </ol>
      </template>
    </div>
  </article>
</template>
