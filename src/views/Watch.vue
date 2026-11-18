<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { epTitle, fmtDur, ytUrl } from '../catalog.ts';
import { loadCatalog, loadDetail } from '../data.ts';
import { loadYT } from '../player.ts';
import type { YTPlayer } from '../player.ts';
import { clearProgress, progress, setProgress } from '../store.ts';
import type { Detail } from '../types.ts';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const title = ref('');
const detail = ref<Detail | null>(null);
const missing = ref(false);
const failed = ref(false);
const wrap = ref<HTMLElement | null>(null);
let player: YTPlayer | null = null;

watch(id, async (v) => {
  detail.value = null; missing.value = false;
  try {
    title.value = (await loadCatalog()).seasons.find((s) => s.id === v)?.title ?? '';
    detail.value = await loadDetail(v);
  } catch { missing.value = true; }
}, { immediate: true });

// 要播哪一集：網址指定 > 上次看到的 > 第一集；指到已經不存在的集就退回第一集
const epId = computed(() => {
  const eps = detail.value?.episodes ?? [];
  const want = String(route.params.ep ?? '') || progress[id.value]?.ep;
  return (eps.find((e) => e.id === want) ?? eps[0])?.id ?? '';
});
const idx = computed(() => detail.value?.episodes.findIndex((e) => e.id === epId.value) ?? -1);
const ep = computed(() => detail.value?.episodes[idx.value]);
const prev = computed(() => detail.value?.episodes[idx.value - 1]);
const next = computed(() => detail.value?.episodes[idx.value + 1]);
const external = computed(() => !!ep.value?.ext || failed.value);

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
  // 先取出下一集：網址沒帶集數時 epId 跟著進度走，setProgress 之後 next 就會變成再下一集
  const n = next.value;
  if (n) { setProgress(id.value, n.id, 0); router.replace(`/watch/${encodeURIComponent(id.value)}/${n.id}`); }
  else clearProgress(id.value);
}

watch(epId, (v) => { if (v) void start(); });
// 每 5 秒記一次進度；前 3 秒不記，避免剛開始就把上次的位置洗成 0
const timer = window.setInterval(() => {
  if (!player || !ep.value || ep.value.ext) return;
  try { const t = player.getCurrentTime(); if (t > 3) setProgress(id.value, ep.value.id, t); } catch { /* 播放器還沒就緒 */ }
}, 5000);
onUnmounted(() => { clearInterval(timer); stop(); });

const enc = encodeURIComponent;
</script>

<template>
  <p v-if="missing" class="state">找不到這部作品。<RouterLink to="/browse">回瀏覽頁</RouterLink></p>
  <p v-else-if="!detail" class="state">載入中…</p>
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
          <h1>第 {{ ep?.n }} 集 <small>{{ ep ? fmtDur(ep.sec) : '' }}</small></h1>
          <p class="ept">{{ ep && epTitle(ep.title) }}</p>
        </div>
        <div class="actions">
          <RouterLink v-if="prev" class="btn" :to="`/watch/${enc(id)}/${prev.id}`">上一集</RouterLink>
          <RouterLink v-if="next" class="btn primary" :to="`/watch/${enc(id)}/${next.id}`">下一集</RouterLink>
        </div>
      </div>
    </div>
    <ol class="eps side">
      <li v-for="e in detail.episodes" :key="e.id">
        <RouterLink :to="`/watch/${enc(id)}/${e.id}`" :class="{ cur: e.id === epId }">
          <b>{{ e.n }}</b><span>{{ epTitle(e.title) }}</span>
          <small>{{ fmtDur(e.sec) }}<template v-if="e.ext"> · YouTube</template></small>
        </RouterLink>
      </li>
    </ol>
  </section>
</template>
