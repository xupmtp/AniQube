<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { REPO_URL } from '../config.ts';
import { loadCatalog } from '../data.ts';

const updated = ref('');
onMounted(async () => {
  try { updated.value = new Date((await loadCatalog()).generatedAt).toLocaleString('zh-TW'); } catch { /* 沒有片庫就不顯示 */ }
});
</script>

<template>
  <article class="about">
    <h1>關於動漫立方</h1>
    <p>動漫立方是一個非營利、非官方的動畫瀏覽網站。站上所有影片都由 YouTube 官方授權頻道公開，本站只負責整理與嵌入播放，不儲存、不轉載任何影片。</p>
    <h2>版權</h2>
    <p>影片版權屬於各片源頻道與原版權方。本站沒有與它們合作，也不隸屬於它們。你在這裡看到的影片會顯示 YouTube 播放器，廣告與會員權益由 YouTube 決定；使用 YouTube Premium 並在同一個瀏覽器登入，就不會看到廣告。</p>
    <p>版權方或頻道經營者若希望下架，請到 <a :href="`${REPO_URL}/issues`" target="_blank" rel="noopener noreferrer">GitHub issues</a> 留言，我們會盡快處理。</p>
    <h2>資料來源</h2>
    <p>影片清單來自 YouTube Data API。作品的題材、評分與首播時間來自 <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">AniList</a>，名稱對照使用 <a href="https://github.com/manami-project/anime-offline-database" target="_blank" rel="noopener noreferrer">anime-offline-database</a>（ODbL-1.0 授權）。作品簡介為 AniList 的英文原文。</p>
    <h2>隱私</h2>
    <p>本站沒有帳號、不使用流量分析，也不寫入任何 cookie。「繼續觀看」與「我的片單」只存在你這個瀏覽器的本機儲存空間，清除瀏覽資料就會消失。播放時由 YouTube 載入播放器，適用 YouTube 的隱私政策。</p>
    <p v-if="updated" class="muted">片庫最後更新：{{ updated }}</p>
  </article>
</template>
