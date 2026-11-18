import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// base './'：搭配 hash 路由，放在 GitHub Pages 子路徑或網域根目錄都能動
export default defineConfig({ base: './', plugins: [vue()] });
