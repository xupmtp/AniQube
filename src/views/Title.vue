<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { epLabel, fmtDur, metaLine, playlistUrl, posterOf } from '../catalog.ts';
import { loadCatalog, loadDetail } from '../data.ts';
import { clearHistory, inList, isWatched, markSeen, progress, settings, toggleList, watched } from '../store.ts';
import type { Detail, Work } from '../types.ts';
import { dubIndex, episodeRows, firstSpot, locate, sourceIndex, sourcesOf } from '../work.ts';
import { pageUrl, share } from '../share.ts';
import SpecialList from '../components/SpecialList.vue';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const work = ref<Work | null>(null);
const detail = ref<Detail | null>(null);
const sel = ref({ s: 0, d: 0 }); // 正在看哪一季、哪個配音版的集數列表；s = -1 是劇場版與特別篇
const labels = ref<Record<string, string>>({}); // 片源頻道的短名稱

watch(id, async (v) => {
  work.value = null; detail.value = null;
  try {
    const cat = await loadCatalog();
    const to = cat.moved?.[v];
    if (to) { router.replace(`/title/${encodeURIComponent(to)}`); return; } // 作品合併後的舊網址
    labels.value = Object.fromEntries(cat.channels.map((c) => [c.key, c.label ?? c.name]));
    work.value = cat.works.find((w) => w.id === v) ?? null;
    if (!work.value) throw new Error('missing');
    const det = await loadDetail(v);
    const at = locate(det, progress[v]?.ep ?? '');
    sel.value = at ? { s: det.seasons[at.s].kind === 'special' ? -1 : at.s, d: at.d } : { s: firstSpot(det).s, d: 0 };
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
// 劇場版與特別篇的配音：列表上方統一選，預設原聲（各部的第一個配音版）
const spLangs = computed(() => [...new Set(specials.value.flatMap(({ x }) => x.dubs.map((d) => d.lang)))]);
const spLang = ref('');
watch(spLangs, (l) => { if (!l.includes(spLang.value)) spLang.value = l[0] ?? ''; }, { immediate: true });
const options = computed(() => [...main.value.map((m) => ({ s: m.s, name: m.x.name })), ...(specials.value.length ? [{ s: -1, name: '劇場版與特別篇' }] : [])]);
const rows = computed(() => { const r = season.value ? episodeRows(season.value, sel.value.d) : []; return settings.newestFirst ? [...r].reverse() : r; });
const count = computed(() => rows.value.filter((r) => r.ep).length);

// 換季時沿用目前的片源與配音版，那一季沒有就用原聲
function pickSeason(s: number) {
  if (s < 0) { sel.value = { s, d: 0 }; return; }
  const cur = season.value?.dubs[sel.value.d];
  sel.value = { s, d: dubIndex(detail.value!.seasons[s], cur?.lang, cur?.ch) };
}
// 片源：同一季有好幾個頻道上傳時可以切換；配音選單只列目前片源的
const sources = computed(() => (season.value ? sourcesOf(season.value) : []));
const dubOpts = computed(() => season.value?.dubs.map((d, i) => ({ d, i })).filter(({ d }) => d.ch === season.value!.dubs[sel.value.d].ch) ?? []);
function pickSource(ch: string) { sel.value = { ...sel.value, d: sourceIndex(season.value!, sel.value.d, ch) }; }
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
        <template v-if="season && !showSp">
          <select v-if="sources.length > 1" :value="season.dubs[sel.d].ch" aria-label="選擇片源" @change="pickSource(($event.target as HTMLSelectElement).value)">
            <option v-for="c in sources" :key="c" :value="c">{{ labels[c] ?? c }}</option>
          </select>
          <select v-if="dubOpts.length > 1" v-model.number="sel.d" aria-label="選擇配音">
            <option v-for="o in dubOpts" :key="o.i" :value="o.i">{{ o.d.lang }}配音</option>
          </select>
        </template>
        <select v-else-if="spLangs.length > 1" v-model="spLang" aria-label="選擇配音">
          <option v-for="l in spLangs" :key="l" :value="l">{{ l }}配音</option>
        </select>
      </div>
      <SpecialList v-if="showSp" :id="work.id" :items="specials" :lang="spLang" :cur="progress[work.id]?.ep" />
      <template v-else-if="season">
        <div class="ep-bar"><span>共 {{ count }} 集</span><button class="link" :aria-label="`排序：${settings.newestFirst ? '新到舊' : '舊到新'}，點一下切換`" @click="settings.newestFirst = !settings.newestFirst">{{ settings.newestFirst ? '新到舊' : '舊到新' }} ⇅</button></div>
        <ol class="eps">
          <li v-for="r in rows" :key="r.n">
            <RouterLink v-if="r.ep" :to="`/watch/${enc(work.id)}/${r.ep.id}`" :class="{ cur: r.ep.id === progress[work.id]?.ep, seen: isWatched(work.id, r.ep.id) }">
              <b>{{ r.n }}</b><span :title="r.ep.title">{{ epLabel(r.ep, season.name) }}</span>
              <small><span v-if="isWatched(work.id, r.ep.id)" class="tick" aria-label="看過">✓</span>{{ fmtDur(r.ep.sec) }}<template v-if="r.ep.ext"> · 在 YouTube 觀看</template></small>
            </RouterLink>
            <div v-else class="none"><b>{{ r.n }}</b><span>無此配音</span></div>
          </li>
        </ol>
      </template>
    </div>
  </article>
</template>
