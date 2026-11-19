<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { epLabel, epNo, fmtDur, metaLine, playlistUrl, posterOf } from '../catalog.ts';
import { loadCatalog, loadDetail } from '../data.ts';
import { clearHistory, inList, isWatched, markSeen, progress, settings, toggleList, watched } from '../store.ts';
import type { Detail, Work } from '../types.ts';
import { firstSpot, locate, unionRows } from '../work.ts';
import { pageUrl, share } from '../share.ts';
import SpecialList from '../components/SpecialList.vue';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const work = ref<Work | null>(null);
const detail = ref<Detail | null>(null);
const sel = ref({ s: 0 }); // 正在看哪一季的集數列表；s = -1 是劇場版與特別篇。配音、片源只在播放頁切換（docs/adr/0010）

watch(id, async (v) => {
  work.value = null; detail.value = null;
  try {
    const cat = await loadCatalog();
    const to = cat.moved?.[v];
    if (to) { router.replace(`/title/${encodeURIComponent(to)}`); return; } // 作品合併後的舊網址
    work.value = cat.works.find((w) => w.id === v) ?? null;
    if (!work.value) throw new Error('missing');
    const det = await loadDetail(v);
    const at = locate(det, progress[v]?.ep ?? '');
    sel.value = { s: at ? (det.seasons[at.s].kind === 'special' ? -1 : at.s) : firstSpot(det).s };
    detail.value = det;
    markSeen(v, work.value.updated);
  } catch { router.replace('/'); } // 已下架，或舊版以季為單位的網址
}, { immediate: true });

const resume = computed(() => (detail.value && progress[id.value] ? locate(detail.value, progress[id.value].ep) : null));
const indexed = computed(() => detail.value?.seasons.map((x, s) => ({ x, s })) ?? []);
const main = computed(() => indexed.value.filter(({ x }) => x.kind !== 'special'));
const specials = computed(() => indexed.value.filter(({ x }) => x.kind === 'special')); // 劇場版與特別篇（含合集）
const season = computed(() => detail.value?.seasons[sel.value.s]);
const showSp = computed(() => sel.value.s === -1 || season.value?.kind === 'special');
const options = computed(() => [...main.value.map((m) => ({ s: m.s, name: m.x.name })), ...(specials.value.length ? [{ s: -1, name: '劇場版與特別篇' }] : [])]);
const rows = computed(() => { const r = season.value && !showSp.value ? unionRows(detail.value!, sel.value.s) : []; return settings.newestFirst ? [...r].reverse() : r; });
const count = computed(() => rows.value.length);
const seenRow = (ids: string[]) => ids.some((x) => isWatched(id.value, x)); // 看過以集數為準，不管哪個配音、片源

function pickSeason(s: number) { sel.value = { s }; }
// 簡介預設 4 行，長的可以展開（換作品時收回）
const more = ref(false);
watch(id, () => { more.value = false; });
const long = computed(() => { const d = detail.value?.desc ?? ''; return d.length > 140 || d.split('\n').filter(Boolean).length > 4; });
const hasHistory = computed(() => !!progress[id.value] || !!watched[id.value]?.length);
function wipe() { if (confirm('清除這部作品的觀看紀錄？續播進度和看過的標記都會消失。')) clearHistory(id.value); }
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
      <div v-if="detail.desc" class="desc-box">
        <span v-if="detail.descLang !== 'zh'" class="desc-tag">英文簡介</span>
        <p class="desc" :class="{ clamp: long && !more }" :lang="detail.descLang === 'zh' ? 'zh-Hant' : 'en'">{{ detail.desc }}</p>
        <button v-if="long" class="link" :aria-expanded="more" @click="more = !more">{{ more ? '收合' : '展開' }}</button>
      </div>
      <p v-if="detail.members" class="note">
        其餘集數為頻道會員限定，只能在 YouTube 觀看。
        <a :href="playlistUrl(detail.members)" target="_blank" rel="noopener noreferrer">前往 YouTube</a>
      </p>
      <div class="actions">
        <RouterLink class="btn primary" :to="`/watch/${enc(work.id)}`">▶ {{ resume ? '繼續觀看' : '播放' }}</RouterLink>
        <button class="btn" @click="toggleList(work.id)">{{ inList(work.id) ? '✓ 已在片單' : '＋ 加入片單' }}</button>
        <button class="btn" @click="share(`${work.title}｜動漫立方`, pageUrl(`/title/${enc(work.id)}`))">分享</button>
        <button v-if="hasHistory" class="btn ghost" @click="wipe">清除觀看紀錄</button>
      </div>

      <div class="pickers">
        <h2>{{ showSp && options.length < 2 ? '劇場版與特別篇' : '集數' }}</h2>
        <select v-if="options.length > 1" :value="showSp ? -1 : sel.s" aria-label="選擇季" @change="pickSeason(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="o in options" :key="o.s" :value="o.s">{{ o.name }}</option>
        </select>
      </div>
      <SpecialList v-if="showSp" :id="work.id" :items="specials" :cur="progress[work.id]?.ep" />
      <template v-else-if="season">
        <div class="ep-bar"><span>共 {{ count }} 集</span><button class="link" :aria-label="`排序：${settings.newestFirst ? '新到舊' : '舊到新'}，點一下切換`" @click="settings.newestFirst = !settings.newestFirst">{{ settings.newestFirst ? '新到舊' : '舊到新' }} ⇅</button></div>
        <ol class="eps">
          <li v-for="r in rows" :key="r.n">
            <RouterLink :to="`/watch/${enc(work.id)}/${r.ep.id}`" :class="{ cur: r.ids.includes(progress[work.id]?.ep ?? ''), seen: seenRow(r.ids) }">
              <b>{{ epNo(r.ep) }}</b><span :title="r.ep.title">{{ epLabel(r.ep, season.name) }}</span>
              <small><span v-if="seenRow(r.ids)" class="tick" aria-label="看過">✓</span>{{ fmtDur(r.ep.sec) }}<template v-if="r.ep.ext"> · 在 YouTube 觀看</template></small>
            </RouterLink>
          </li>
        </ol>
      </template>
    </div>
  </article>
</template>
