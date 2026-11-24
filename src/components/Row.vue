<script setup lang="ts">
import { ref } from 'vue';
import type { Work } from '../types.ts';
import Card from './Card.vue';

defineProps<{ title: string; works: Work[]; more?: string; resume?: boolean; ranked?: boolean; seen?: boolean }>();
const el = ref<HTMLElement | null>(null);
const go = (dir: number) => el.value?.scrollBy({ left: dir * el.value.clientWidth * 0.85, behavior: 'smooth' });
</script>

<template>
  <section v-if="works.length" class="row">
    <h2>{{ title }}<RouterLink v-if="more" :to="more">查看全部 ›</RouterLink></h2>
    <div class="wrap">
      <button class="arrow l" aria-label="向左" @click="go(-1)">‹</button>
      <div ref="el" class="scroller" :class="{ ranked }"><Card v-for="(w, i) in works" :key="w.id" :work="w" :resume="resume" :seen="seen" :rank="ranked ? i + 1 : undefined" /></div>
      <button class="arrow r" aria-label="向右" @click="go(1)">›</button>
    </div>
  </section>
</template>
