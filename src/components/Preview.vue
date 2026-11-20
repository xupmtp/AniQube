<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { membersNote, metaLine, posterOf, tagLink } from '../catalog.ts';
import { preview, close, keep } from '../preview.ts';
import { clearProgress, hasNew, inList, progress, toggleList } from '../store.ts';
import { pageUrl, share } from '../share.ts';

const route = useRoute();
const w = computed(() => preview.work);
const enc = encodeURIComponent;

// 桌面：以卡片為中心放大約 1.5 倍，貼齊視窗左右邊，不蓋到導覽列
const box = computed(() => {
  const r = preview.rect;
  if (!r) return {};
  const width = Math.max(r.width * 1.5, 320);
  const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), innerWidth - width - 8);
  const top = Math.max(72, r.top - r.height * 0.25);
  return { width: `${width}px`, left: `${left}px`, top: `${top}px` };
});
const pct = computed(() => {
  const p = w.value && progress[w.value.id];
  return p?.d ? Math.min(100, Math.round((p.t / p.d) * 100)) : 0;
});

function removeResume() { if (w.value) clearProgress(w.value.id); close(); }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
// 捲動就收起預覽卡：capture 才收得到橫列自己的水平捲動（不會冒泡到 window）
const onScroll = () => { if (!preview.sheet) close(); };
onMounted(() => { addEventListener('keydown', onKey); addEventListener('scroll', onScroll, { passive: true, capture: true }); });
onUnmounted(() => { removeEventListener('keydown', onKey); removeEventListener('scroll', onScroll, { capture: true }); });
watch(() => route.fullPath, close);
</script>

<template>
  <template v-if="w">
    <!-- 觸控：底部面板 -->
    <div v-if="preview.sheet" class="sheet-back" @click.self="close">
      <section class="sheet" role="dialog" aria-modal="true" :aria-label="w.title">
        <button class="sheet-x" aria-label="關閉" @click="close">✕</button>
        <div class="sheet-head">
          <img :src="posterOf(w)" alt="" />
          <div>
            <h3>{{ w.title }}</h3>
            <p class="meta">{{ metaLine(w) }}<template v-if="w.score"> · ★ {{ (w.score / 10).toFixed(1) }}</template></p>
            <p class="pv-g"><template v-for="(g, i) in [...w.genres, ...w.tags].slice(0, 3)" :key="g">{{ i ? ' · ' : '' }}<RouterLink :to="tagLink(g)">{{ g }}</RouterLink></template></p>
            <p v-if="w.memberEps" class="pv-lock"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" /></svg>{{ membersNote(w) }}</p>
          </div>
        </div>
        <div v-if="pct" class="pv-bar"><i :style="{ width: `${pct}%` }"></i></div>
        <RouterLink class="btn primary sheet-play" :to="`/watch/${enc(w.id)}`">▶ {{ progress[w.id] ? '繼續觀看' : '播放' }}</RouterLink>
        <div class="sheet-acts">
          <button @click="toggleList(w.id)"><span class="pv-ico">{{ inList(w.id) ? '✓' : '＋' }}</span>我的片單</button>
          <button v-if="preview.resume" @click="removeResume"><span class="pv-ico">✕</span>移除</button>
          <button @click="share(`${w.title}｜動漫立方`, pageUrl(`/title/${enc(w.id)}`))"><span class="pv-ico">↗</span>分享</button>
          <RouterLink :to="`/title/${enc(w.id)}`"><span class="pv-ico">ⓘ</span>集數與資訊</RouterLink>
        </div>
      </section>
    </div>

    <!-- 桌面：預覽卡 -->
    <article v-else-if="preview.rect" class="pv" :style="box" @mouseenter="keep" @mouseleave="close">
      <RouterLink class="pv-thumb" :to="`/title/${enc(w.id)}`" tabindex="-1">
        <img :src="posterOf(w)" :alt="w.title" />
        <span v-if="hasNew(w)" class="badge new">有新集</span>
      </RouterLink>
      <div v-if="pct" class="pv-bar"><i :style="{ width: `${pct}%` }"></i></div>
      <div class="pv-body">
        <div class="pv-btns">
          <RouterLink class="pv-btn play" :to="`/watch/${enc(w.id)}`" :aria-label="progress[w.id] ? '繼續觀看' : '播放'" :title="progress[w.id] ? '繼續觀看' : '播放'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>
          </RouterLink>
          <button class="pv-btn" :aria-label="inList(w.id) ? '從片單移除' : '加入我的片單'" :title="inList(w.id) ? '從片單移除' : '加入我的片單'" @click="toggleList(w.id)">
            <svg v-if="inList(w.id)" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
          </button>
          <button v-if="preview.resume" class="pv-btn" aria-label="從繼續觀看移除" title="從繼續觀看移除" @click="removeResume">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
          </button>
          <RouterLink class="pv-btn pv-more" :to="`/title/${enc(w.id)}`" aria-label="集數與資訊" title="集數與資訊">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </RouterLink>
        </div>
        <strong class="pv-title">{{ w.title }}</strong>
        <p class="pv-meta"><span v-if="w.score" class="pv-score">★ {{ (w.score / 10).toFixed(1) }}</span>{{ metaLine(w) }}</p>
        <p class="pv-g"><template v-for="(g, i) in [...w.genres, ...w.tags].slice(0, 3)" :key="g">{{ i ? ' · ' : '' }}<RouterLink :to="tagLink(g)">{{ g }}</RouterLink></template></p>
        <p v-if="w.memberEps" class="pv-lock"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" /></svg>{{ membersNote(w) }}</p>
      </div>
    </article>
  </template>
</template>
