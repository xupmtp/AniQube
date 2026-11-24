<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { epLabel, epName, epNo, fmtDur, ytUrl } from '../catalog.ts';
import { loadCatalog, loadDetail } from '../data.ts';
import { loadYT } from '../player.ts';
import type { YTPlayer } from '../player.ts';
import { clearProgress, isWatched, markSeen, markWatched, progress, setProgress, settings, volume } from '../store.ts';
import { isTyping, keyAction } from '../keys.ts';
import { clock, pageUrl, share } from '../share.ts';
import type { Detail, Episode } from '../types.ts';
import { dubChoices, epAt, firstSpot, locate, nextSpot, prevSpot, resumeSpot, sourceChoices, unionRows } from '../work.ts';
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

// 要播哪一集：網址指定 > 上次看到的（看到片尾就接下一集）> 從第一季第一集；指到已經不存在的集就從頭
const spot = computed<Spot | null>(() => {
  const det = detail.value;
  if (!det) return null;
  const want = String(route.params.ep ?? ''), p = progress[id.value];
  return (want ? locate(det, want) : p ? resumeSpot(det, p.ep, p.t) : null) ?? firstSpot(det);
});
const ep = computed(() => (detail.value && spot.value ? epAt(detail.value, spot.value) : undefined));
const season = computed(() => (detail.value && spot.value ? detail.value.seasons[spot.value.s] : undefined));
const rows = computed(() => { const r = detail.value && spot.value ? unionRows(detail.value, spot.value.s) : []; return settings.newestFirst ? [...r].reverse() : r; });
const count = computed(() => rows.value.length);
const seenRow = (ids: string[]) => ids.some((x) => isWatched(id.value, x)); // 看過以集數為準，不管哪個配音、片源
const next = computed(() => (detail.value && spot.value ? nextSpot(detail.value, spot.value) : null));
const prev = computed(() => (detail.value && spot.value ? prevSpot(detail.value, spot.value) : null));
const indexed = computed(() => detail.value?.seasons.map((x, s) => ({ x, s })) ?? []);
const specials = computed(() => indexed.value.filter(({ x }) => x.kind === 'special'));
// 季選單：各季，最後一項是劇場版與特別篇（s = -1）
const options = computed(() => [...indexed.value.filter(({ x }) => x.kind !== 'special').map((m) => ({ s: m.s, name: m.x.name })), ...(specials.value.length ? [{ s: -1, name: '劇場版與特別篇' }] : [])]);
// 資訊區：麵包屑接季名（劇場版與特別篇寫類型），標題是集數，副標接在旁邊（沒有副標就不重複寫集數）
const crumb = computed(() => (season.value?.kind === 'special' ? season.value.type ?? '' : season.value?.name ?? ''));
const heading = computed(() => (season.value?.bundle ? `合集 ${season.value.name}` : season.value?.kind === 'special' ? season.value.name : ep.value ? epName(ep.value) : ''));
const subOf = (e: Episode) => { const s = epLabel(e, season.value?.name); return s === epName(e) ? '' : s; };
const sub = computed(() => (season.value?.kind !== 'special' && ep.value ? subOf(ep.value) : ''));
const nextSub = computed(() => (next.value && season.value?.kind !== 'special' ? subOf(epAt(detail.value!, next.value)) : ''));
const external = computed(() => !!ep.value?.ext || failed.value);

const enc = encodeURIComponent;
const linkTo = (p: Spot) => `/watch/${enc(id.value)}/${epAt(detail.value!, p).id}`;

// 換季從第一集開始
function pickSeason(s: number) { router.push(linkTo(unionRows(detail.value!, s < 0 ? specials.value[0].s : s)[0])); }
// 這一集有的配音、目前配音下有的片源；切換只換這一支（跳到同一集的那個版本），不記住、不影響列表與下一集
const dubs = computed(() => (detail.value && spot.value ? dubChoices(detail.value, spot.value) : []));
const sources = computed(() => (detail.value && spot.value ? sourceChoices(detail.value, spot.value) : []));
function choose(p: Spot) { router.replace(linkTo(p)); }

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
      events: { onReady: applyVolume, onStateChange: (ev: { data: number }) => { if (ev.data === 0) ended(); }, onError: () => { failed.value = true; } },
    });
  } catch { failed.value = true; }
}

// 音量與靜音沿用上次（換集時同一個播放器會保留，重新建立時才需要套用）
function applyVolume() {
  try { player?.setVolume(volume.level); if (volume.muted) player?.mute(); else player?.unMute(); } catch { /* 播放器還沒就緒 */ }
}

// 一集播完：自動播放開著就在資訊列倒數 5 秒（不能疊在 YouTube 播放器上），關著就停住並提示「下一集」
const countdown = ref<number | null>(null);
const endedHere = ref(false);
let tick = 0;
function cancelCountdown() { clearInterval(tick); countdown.value = null; }
function ended() {
  // 先取出下一集：網址沒帶集數時位置跟著進度走，setProgress 之後 next 就會變成再下一集
  const n = next.value;
  if (!n) { if (!settings.pauseHistory) clearProgress(id.value); return; }
  const e = epAt(detail.value!, n);
  if (!settings.autoplay) { endedHere.value = true; return; }
  cancelCountdown(); // YouTube 偶爾連送兩次「播完」，不然會有兩個計時器、倒數快一倍
  countdown.value = 5;
  tick = window.setInterval(() => {
    if (countdown.value! > 1) { countdown.value!--; return; }
    cancelCountdown();
    if (!settings.pauseHistory) setProgress(id.value, e.id, 0, e.sec);
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
  const name = season.value?.bundle ? `${title.value} 合集 ${season.value.name}` : season.value?.kind === 'special' ? season.value.name : `${title.value} ${epName(ep.value)}`;
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
// 每 5 秒記一次進度與音量；前 3 秒不記進度，避免剛開始就把上次的位置洗成 0。暫停觀看紀錄時只記音量
// （YouTube 沒有音量變動事件，只能輪詢）
const timer = window.setInterval(() => {
  if (!player || !ep.value || ep.value.ext) return;
  try {
    volume.level = player.getVolume(); volume.muted = player.isMuted();
    if (settings.pauseHistory) return;
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
        <!-- 上層：作品 · 季（劇場版與特別篇寫類型），集數＋副標 -->
        <p class="crumb"><RouterLink :to="`/title/${enc(id)}`" class="back">‹ {{ title }}</RouterLink><template v-if="crumb"> · {{ crumb }}</template></p>
        <h1>{{ heading }}<span v-if="sub" class="sub">{{ sub }}</span></h1>
        <!-- 下層：左邊是這一支的版本與分享（只換這一支，docs/adr/0010），右邊是往前往後 -->
        <div class="acts">
          <div>
            <select v-if="dubs.length > 1" class="ver" :value="season.dubs[spot.d].lang" aria-label="這一集的配音" @change="choose(dubs.find((o) => o.lang === ($event.target as HTMLSelectElement).value)!.spot)">
              <option v-for="o in dubs" :key="o.lang" :value="o.lang">{{ o.lang }}</option>
            </select>
            <select v-if="sources.length > 1" class="ver" :value="spot.d" aria-label="這一集的片源" @change="choose(sources.find((o) => o.spot.d === Number(($event.target as HTMLSelectElement).value))!.spot)">
              <option v-for="o in sources" :key="o.ch" :value="o.spot.d">{{ labels[o.ch] ?? o.ch }}</option>
            </select>
            <details class="share-pop pop" @toggle="onShareToggle">
              <summary class="btn">分享</summary>
              <div class="share-box">
                <label v-if="shareAt > 0"><input v-model="withTime" type="checkbox" /> 從 {{ clock(shareAt) }} 開始</label>
                <button class="btn primary" @click="shareEp">分享這一集</button>
              </div>
            </details>
          </div>
          <div>
            <label class="mini-switch"><input v-model="settings.autoplay" type="checkbox" role="switch" class="switch" />自動播放</label>
            <RouterLink v-if="prev" class="btn prev" :to="linkTo(prev)" aria-label="上一集">‹<span> 上一集</span></RouterLink>
            <RouterLink v-if="next" class="btn primary" :class="{ pulse: endedHere }" :to="linkTo(next)">下一集 ›</RouterLink>
          </div>
        </div>
      </div>
      <div v-if="countdown" class="countdown" role="status">
        <span><b>{{ countdown }}</b> 秒後播放<template v-if="next"> {{ epName(epAt(detail, next)) }} {{ nextSub }}</template></span>
        <button class="btn" @click="cancelCountdown">取消</button>
      </div>
    </div>
    <div class="side">
      <div class="pickers">
        <select v-if="options.length > 1" :value="season.kind === 'special' ? -1 : spot.s" aria-label="選擇季" @change="pickSeason(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="o in options" :key="o.s" :value="o.s">{{ o.name }}</option>
        </select>
      </div>
      <div v-if="season.kind !== 'special'" class="ep-bar"><span>共 {{ count }} 集</span><button class="link" :aria-label="`排序：${settings.newestFirst ? '新到舊' : '舊到新'}，點一下切換`" @click="settings.newestFirst = !settings.newestFirst">{{ settings.newestFirst ? '新到舊' : '舊到新' }} ⇅</button></div>
      <SpecialList v-if="season.kind === 'special'" :id="id" :items="specials" :cur="ep?.id" />
      <ol v-else class="eps">
        <li v-for="r in rows" :key="r.n">
          <RouterLink :to="`/watch/${enc(id)}/${r.ep.id}`" :class="{ cur: r.ids.includes(ep?.id ?? ''), seen: seenRow(r.ids) }">
            <b>{{ epNo(r.ep) }}</b><span :title="r.ep.title">{{ epLabel(r.ep, season.name) }}</span>
            <small><span v-if="seenRow(r.ids)" class="tick" aria-label="看過">✓</span>{{ fmtDur(r.ep.sec) }}<template v-if="r.ep.ext"> · YouTube</template></small>
          </RouterLink>
        </li>
      </ol>
    </div>
  </section>
</template>
