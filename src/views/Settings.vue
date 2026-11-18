<script setup lang="ts">
import { settings } from '../store.ts';
</script>

<template>
  <section class="browse settings">
    <div class="page-head"><h1>設定</h1></div>
    <p class="muted">設定只存在這個瀏覽器，匯出備份檔時會一起帶走。</p>
    <h2>播放</h2>
    <label class="opt">
      <span>
        <strong>自動播放下一集</strong>
        <small>一集播完後倒數 5 秒接著播下一集，倒數時可以取消。關閉時播完就停在原地。</small>
      </span>
      <input v-model="settings.autoplay" type="checkbox" role="switch" class="switch" />
    </label>
  </section>
</template>
