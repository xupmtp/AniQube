import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.ts';
import './install.ts'; // 安裝事件要在頁面載入時就接住
import './style.css';

createApp(App).use(router).mount('#app');
