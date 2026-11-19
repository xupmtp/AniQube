<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { epLabel, fmtDur, ytUrl } from '../catalog.ts';
import { loadCatalog, loadDetail } from '../data.ts';
import { loadYT } from '../player.ts';
import type { YTPlayer } from '../player.ts';
import { clearProgress, isWatched, markSeen, markWatched, progress, setProgress, settings } from '../store.ts';
import { KEY_HELP, isTyping, keyAction } from '../keys.ts';
import { clock, pageUrl, share } from '../share.ts';
import type { Detail } from '../types.ts';
import { dubIndex, epAt, episodeRows, firstSpot, locate, nextSpot, sourceIndex, sourcesOf, switchDub } from '../work.ts';
import type { Spot } from '../work.ts';
import SpecialList from '../components/SpecialList.vue';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const title = ref('');
const detail = ref<Detail | null>(null);
const failed = ref(false);
const wrap = ref<HTMLElement | null>(null);
const labels = ref<Record<string, string>>({}); // 片源頻道的短名稱
let player: YTPlayer | null = null;

watch(id, async (v) => {
  detail.value = null;
  try {
    const cat = await loadCatalog();
    const to = cat.moved?.[v];
    if (to) { router.replace({ path: `/watch/${enc(to)}/${String(route.params.ep ?? '')}`, query: route.query }); return; } // 作品合併後的舊網址
    labels.value = Object.fromEntries(cat.channels.map((c) => [c.key, c.label ?? c.name]));
    const w = cat.works.find((x) => x.id === v);
    title.value = w?.title ?? '';
    if (w) markSeen(v, w.updated);
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
const rows = computed(() => { const r = season.value && spot.value ? episodeRows(season.value, spot.value.d) : []; return settings.newestFirst ? [...r].reverse() : r; });
const count = computed(() => rows.value.filter((r) => r.ep).length);
const next = computed(() => (detail.value && spot.value ? nextSpot(detail.value, spot.value) : null));
const prev = computed(() => (detail.value && spot.value && spot.value.i > 0 ? { ...spot.value, i: spot.value.i - 1 } : null));
const indexed = computed(() => detail.value?.seasons.map((x, s) => ({ x, s })) ?? []);
const specials = computed(() => indexed.value.filter(({ x }) => x.kind === 'special'));
// 季選單：各季，最後一項是劇場版與特別篇（s = -1）
const options = computed(() => [...indexed.value.filter(({ x }) => x.kind !== 'special').map((m) => ({ s: m.s, name: m.x.name })), ...(specials.value.length ? [{ s: -1, name: '劇場版與特別篇' }] : [])]);
const external = computed(() => !!ep.value?.ext || failed.value);

const enc = encodeURIComponent;
const linkTo = (p: Spot) => `/watch/${enc(id.value)}/${epAt(detail.value!, p).id}`;

function pickDub(d: number) { if (spot.value) router.replace(linkTo(switchDub(detail.value!, spot.value, d))); }
// 換季沿用目前的片源與配音版，那一季沒有就用原聲
function pickSeason(s: number) {
  if (s < 0) { router.push(linkTo({ s: specials.value[0].s, d: 0, i: 0 })); return; }
  const cur = season.value?.dubs[spot.value!.d];
  router.push(linkTo({ s, d: dubIndex(detail.value!.seasons[s], cur?.lang, cur?.ch), i: 0 }));
}
// 片源：換頻道時跳到同一集數；配音選單只列目前片源的
const sources = computed(() => (season.value ? sourcesOf(season.value) : []));
const dubOpts = computed(() => season.value?.dubs.map((d, i) => ({ d, i })).filter(({ d }) => d.ch === season.value!.dubs[spot.value!.d].ch) ?? []);
function pickSource(ch: string) { pickDub(sourceIndex(season.value!, spot.value!.d, ch)); }

function stop() { player?.destroy(); player = null; if (wrap.value) wrap.value.innerHTML = ''; }

async function start() {
  failed.value = false;
  const e = ep.value;
  if (!e || e.ext) { stop(); return; }
  // 分享連結帶的 ?t= 優先（只對網址指定的那一集有效），其次是自己的續播進度
  const qt = Number(route.query.t);
  const at = qt > 0 && route.params.ep === e.id ? Math.floor(qt) : progress[id.value]?.ep === e.id ? progress[id.value].t : 0;
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

// 一集播完：自動播放開著就在資訊列倒數 5 秒（不能疊在 YouTube 播放器上），關著就停住並提示「下一集」
const countdown = ref<number | null>(null);
const endedHere = ref(false);
let tick = 0;
function cancelCountdown() { clearInterval(tick); countdown.value = null; }
function ended() {
  // 先取出下一集：網址沒帶集數時位置跟著進度走，setProgress 之後 next 就會變成再下一集
  const n = next.value;
  if (!n) { clearProgress(id.value); return; }
  const e = epAt(detail.value!, n);
  if (!settings.autoplay) { endedHere.value = true; return; }
  cancelCountdown(); // YouTube 偶爾連送兩次「播完」，不然會有兩個計時器、倒數快一倍
  countdown.value = 5;
  tick = window.setInterval(() => {
    if (countdown.value! > 1) { countdown.value!--; return; }
    cancelCountdown();
    setProgress(id.value, e.id, 0, e.sec);
    router.replace(`/watch/${enc(id.value)}/${e.id}`);
  }, 1000);
}

// 分享這一集：可選擇從目前秒數開始（像 YouTube），預設不帶時間
const shareAt = ref(0);
const withTime = ref(false);
function onShareToggle(e: Event) {
  if (!(e.target as HTMLDetailsElement).open) return;
  try { shareAt.value = Math.floor(player?.getCurrentTime() ?? 0); } catch { shareAt.value = 0; }
  withTime.value = false;
}
function shareEp(e: Event) {
  if (!ep.value) return;
  const t = withTime.value && shareAt.value > 0 ? `?t=${shareAt.value}` : '';
  const name = season.value?.bundle ? `${title.value} 合集 ${season.value.name}` : season.value?.kind === 'special' ? season.value.name : `${title.value} 第 ${ep.value.n} 集`;
  void share(`${name}｜動漫立方`, pageUrl(`/watch/${enc(id.value)}/${ep.value.id}${t}`));
  (e.target as HTMLElement).closest('details')?.removeAttribute('open');
}

// 快捷鍵：焦點在頁面上（不在 YouTube 播放器、也不在輸入框）時才有作用
function onKey(ev: KeyboardEvent) {
  const a = keyAction(ev);
  if (!a || isTyping(ev.target)) return;
  if (a.do === 'next' || a.do === 'prev') {
    const p = a.do === 'next' ? next.value : prev.value;
    if (p) router.push(linkTo(p));
    return;
  }
  if (!player) return;
  ev.preventDefault(); // 空白鍵、方向鍵不要捲動頁面
  try {
    if (a.do === 'toggle') { if (player.getPlayerState() === 1) player.pauseVideo(); else player.playVideo(); }
    else if (a.do === 'seek') player.seekTo(Math.max(0, player.getCurrentTime() + a.by), true);
    else if (a.do === 'jump') player.seekTo(player.getDuration() * a.frac, true);
    else if (a.do === 'mute') { if (player.isMuted()) player.unMute(); else player.mute(); }
    else if (a.do === 'fullscreen') { if (document.fullscreenElement) void document.exitFullscreen(); else void wrap.value?.requestFullscreen(); }
  } catch { /* 播放器還沒就緒 */ }
}
window.addEventListener('keydown', onKey);

watch(() => ep.value?.id, (v) => { cancelCountdown(); endedHere.value = false; if (v) void start(); });
// 每 5 秒記一次進度；前 3 秒不記，避免剛開始就把上次的位置洗成 0
const timer = window.setInterval(() => {
  if (!player || !ep.value || ep.value.ext) return;
  try {
    const t = player.getCurrentTime();
    if (t > 3) setProgress(id.value, ep.value.id, t, ep.value.sec);
    if (t > 30) markWatched(id.value, ep.value.id); // 播超過 30 秒算看過
  } catch { /* 播放器還沒就緒 */ }
}, 5000);
onUnmounted(() => { clearInterval(timer); cancelCountdown(); window.removeEventListener('keydown', onKey); stop(); });
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
          <h1>{{ season.bundle ? `合集 ${season.name}` : season.kind === 'special' ? season.name : `第 ${ep?.n} 集` }} <small>{{ ep ? fmtDur(ep.sec) : '' }}</small></h1>
          <p class="ept">{{ season.kind === 'special' ? (season.type ?? '') : `${season.name} · ${ep ? epLabel(ep, season.name) : ''}` }}</p>
        </div>
        <div class="actions">
          <details class="share-pop pop" @toggle="onShareToggle">
            <summary class="btn">分享</summary>
            <div class="share-box">
              <label v-if="shareAt > 0"><input v-model="withTime" type="checkbox" /> 從 {{ clock(shareAt) }} 開始</label>
              <button class="btn primary" @click="shareEp">分享這一集</button>
            </div>
          </details>
          <RouterLink v-if="prev" class="btn" :to="linkTo(prev)">上一集</RouterLink>
          <RouterLink v-if="next" class="btn primary" :class="{ pulse: endedHere }" :to="linkTo(next)">下一集</RouterLink>
        </div>
      </div>
      <div v-if="countdown" class="countdown" role="status">
        <span><b>{{ countdown }}</b> 秒後播放下一集<template v-if="next"> · 第 {{ epAt(detail, next).n }} 集</template></span>
        <button class="btn" @click="cancelCountdown">取消</button>
      </div>
      <div class="watch-tools">
        <label class="mini-switch"><input v-model="settings.autoplay" type="checkbox" role="switch" class="switch" />自動播放下一集</label>
        <details class="keys pop">
          <summary>快捷鍵</summary>
          <dl><template v-for="[k, v] in KEY_HELP" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
        </details>
      </div>
    </div>
    <div class="side">
      <div class="pickers">
        <select v-if="options.length > 1" :value="season.kind === 'special' ? -1 : spot.s" aria-label="選擇季" @change="pickSeason(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="o in options" :key="o.s" :value="o.s">{{ o.name }}</option>
        </select>
        <select v-if="sources.length > 1" :value="season.dubs[spot.d].ch" aria-label="選擇片源" @change="pickSource(($event.target as HTMLSelectElement).value)">
          <option v-for="c in sources" :key="c" :value="c">{{ labels[c] ?? c }}</option>
        </select>
        <select v-if="dubOpts.length > 1" :value="spot.d" aria-label="選擇配音" @change="pickDub(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="o in dubOpts" :key="o.i" :value="o.i">{{ o.d.lang }}配音</option>
        </select>
      </div>
      <div v-if="season.kind !== 'special'" class="ep-bar"><span>共 {{ count }} 集</span><button class="link" :aria-label="`排序：${settings.newestFirst ? '新到舊' : '舊到新'}，點一下切換`" @click="settings.newestFirst = !settings.newestFirst">{{ settings.newestFirst ? '新到舊' : '舊到新' }} ⇅</button></div>
      <SpecialList v-if="season.kind === 'special'" :id="id" :items="specials" :labels="labels" :cur="ep?.id" />
      <ol v-else class="eps">
        <li v-for="r in rows" :key="r.n">
          <RouterLink v-if="r.ep" :to="`/watch/${enc(id)}/${r.ep.id}`" :class="{ cur: r.ep.id === ep?.id, seen: isWatched(id, r.ep.id) }">
            <b>{{ r.n }}</b><span :title="r.ep.title">{{ epLabel(r.ep, season.name) }}</span>
            <small><span v-if="isWatched(id, r.ep.id)" class="tick" aria-label="看過">✓</span>{{ fmtDur(r.ep.sec) }}<template v-if="r.ep.ext"> · YouTube</template></small>
          </RouterLink>
          <div v-else class="none"><b>{{ r.n }}</b><span>無此配音</span></div>
        </li>
      </ol>
    </div>
  </section>
</template>
