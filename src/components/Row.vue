<script setup lang="ts">
import { ref } from 'vue';
import type { Season } from '../types.ts';
import Card from './Card.vue';

defineProps<{ title: string; seasons: Season[]; more?: string; resume?: boolean }>();
const el = ref<HTMLElement | null>(null);
const go = (dir: number) => el.value?.scrollBy({ left: dir * el.value.clientWidth * 0.85, behavior: 'smooth' });
</script>

<template>
  <section v-if="seasons.length" class="row">
    <h2>{{ title }}<RouterLink v-if="more" :to="more">查看全部 ›</RouterLink></h2>
    <div class="wrap">
      <button class="arrow l" aria-label="向左" @click="go(-1)">‹</button>
      <div ref="el" class="scroller"><Card v-for="s in seasons" :key="s.id" :season="s" :resume="resume" /></div>
      <button class="arrow r" aria-label="向右" @click="go(1)">›</button>
    </div>
  </section>
</template>
