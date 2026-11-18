<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { epTitle, fmtDur, ytUrl } from '../catalog.ts';
import { loadCatalog, loadDetail } from '../data.ts';
import { loadYT } from '../player.ts';
import type { YTPlayer } from '../player.ts';
import { clearProgress, progress, setProgress } from '../store.ts';
import type { Detail } from '../types.ts';
import { epAt, episodeRows, firstSpot, locate, nextSpot, switchDub } from '../work.ts';
import type { Spot } from '../work.ts';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const title = ref('');
const detail = ref<Detail | null>(null);
const failed = ref(false);
const wrap = ref<HTMLElement | null>(null);
let player: YTPlayer | null = null;

watch(id, async (v) => {
  detail.value = null;
  try {
    title.value = (await loadCatalog()).works.find((w) => w.id === v)?.title ?? '';
    detail.value = await loadDetail(v);
  } catch { router.replace('/'); } // 已下架，或舊版以季為單位的網址
}, { immediate: true });

// 要播哪一集：網址指定 > 上次看到的 > 從頭；指到已經不存在的集就從頭
const spot = computed<Spot | null>(() => {
  const det = detail.value;
  if (!det) return null;
  const want = String(route.params.ep ?? '') || progress[id.value]?.ep || '';
  return locate(det, want) ?? firstSpot(det);
});
const ep = computed(() => (detail.value && spot.value ? epAt(detail.value, spot.value) : undefined));
const season = computed(() => (detail.value && spot.value ? detail.value.seasons[spot.value.s] : undefined));
const rows = computed(() => (season.value && spot.value ? episodeRows(season.value, spot.value.d) : []));
const next = computed(() => (detail.value && spot.value ? nextSpot(detail.value, spot.value) : null));
const prev = computed(() => (detail.value && spot.value && spot.value.i > 0 ? { ...spot.value, i: spot.value.i - 1 } : null));
const seasons = computed(() => detail.value?.seasons.map((x, s) => ({ x, s })).filter(({ x }) => x.kind !== 'special') ?? []);
const external = computed(() => !!ep.value?.ext || failed.value);

const enc = encodeURIComponent;
const linkTo = (p: Spot) => `/watch/${enc(id.value)}/${epAt(detail.value!, p).id}`;

function pickDub(d: number) { if (spot.value) router.replace(linkTo(switchDub(detail.value!, spot.value, d))); }
// 換季沿用目前的配音版，那一季沒有就用原聲
function pickSeason(s: number) {
  const lang = season.value?.dubs[spot.value!.d].lang;
  router.push(linkTo({ s, d: Math.max(0, detail.value!.seasons[s].dubs.findIndex((x) => x.lang === lang)), i: 0 }));
}

function stop() { player?.destroy(); player = null; if (wrap.value) wrap.value.innerHTML = ''; }

async function start() {
  failed.value = false;
  const e = ep.value;
  if (!e || e.ext) { stop(); return; }
  const at = progress[id.value]?.ep === e.id ? progress[id.value].t : 0;
  try {
    const YT = await loadYT();
    if (player) { player.loadVideoById({ videoId: e.id, startSeconds: at }); return; }
    await nextTick();
    if (!wrap.value) return;
    const target = document.createElement('div');
    wrap.value.appendChild(target);
    player = new YT.Player(target, {
      videoId: e.id, width: '100%', height: '100%',
      playerVars: { autoplay: 1, start: at, rel: 0, playsinline: 1, origin: location.origin },
      events: { onStateChange: (ev: { data: number }) => { if (ev.data === 0) ended(); }, onError: () => { failed.value = true; } },
    });
  } catch { failed.value = true; }
}

function ended() {
  // 先取出下一集：網址沒帶集數時位置跟著進度走，setProgress 之後 next 就會變成再下一集
  const n = next.value;
  if (n) { const v = epAt(detail.value!, n).id; setProgress(id.value, v, 0); router.replace(`/watch/${enc(id.value)}/${v}`); }
  else clearProgress(id.value);
}

watch(() => ep.value?.id, (v) => { if (v) void start(); });
// 每 5 秒記一次進度；前 3 秒不記，避免剛開始就把上次的位置洗成 0
const timer = window.setInterval(() => {
  if (!player || !ep.value || ep.value.ext) return;
  try { const t = player.getCurrentTime(); if (t > 3) setProgress(id.value, ep.value.id, t); } catch { /* 播放器還沒就緒 */ }
}, 5000);
onUnmounted(() => { clearInterval(timer); stop(); });
</script>

<template>
  <p v-if="!detail || !spot || !season" class="state">載入中…</p>
  <section v-else class="watch">
    <div class="stage">
      <div v-show="!external" ref="wrap" class="player"></div>
      <div v-if="external" class="player ext">
        <p>{{ failed ? '播放器無法載入這一集。' : '這一集無法在站內播放。' }}</p>
        <a v-if="ep" class="btn primary" :href="ytUrl(ep.id)" target="_blank" rel="noopener noreferrer">前往 YouTube 觀看</a>
      </div>
      <div class="bar">
        <div>
          <RouterLink :to="`/title/${enc(id)}`" class="back">‹ {{ title }}</RouterLink>
          <h1>{{ season.kind === 'special' ? season.name : `第 ${ep?.n} 集` }} <small>{{ ep ? fmtDur(ep.sec) : '' }}</small></h1>
          <p class="ept">{{ season.kind === 'special' ? '' : `${season.name} · ` }}{{ ep && epTitle(ep.title) }}</p>
        </div>
        <div class="actions">
          <RouterLink v-if="prev" class="btn" :to="linkTo(prev)">上一集</RouterLink>
          <RouterLink v-if="next" class="btn primary" :to="linkTo(next)">下一集</RouterLink>
        </div>
      </div>
    </div>
    <div class="side">
      <div class="pickers">
        <select v-if="seasons.length > 1 && season.kind !== 'special'" :value="spot.s" aria-label="選擇季" @change="pickSeason(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="m in seasons" :key="m.s" :value="m.s">{{ m.x.name }}{{ m.x.kind === 'collection' ? '（合輯）' : '' }}</option>
        </select>
        <select v-if="season.dubs.length > 1" :value="spot.d" aria-label="選擇配音" @change="pickDub(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="(d, i) in season.dubs" :key="d.lang" :value="i">{{ d.lang }}配音</option>
        </select>
      </div>
      <ol class="eps">
        <li v-for="r in rows" :key="r.n">
          <RouterLink v-if="r.ep" :to="`/watch/${enc(id)}/${r.ep.id}`" :class="{ cur: r.ep.id === ep?.id }">
            <b>{{ r.n }}</b><span :title="epTitle(r.ep.title)">{{ epTitle(r.ep.title, season.name) }}</span>
            <small>{{ fmtDur(r.ep.sec) }}<template v-if="r.ep.ext"> · YouTube</template></small>
          </RouterLink>
          <div v-else class="none"><b>{{ r.n }}</b><span>無此配音</span></div>
        </li>
      </ol>
    </div>
  </section>
</template>
