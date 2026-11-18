import { createRouter, createWebHashHistory } from 'vue-router';

// hash 路由：靜態主機不需要任何改寫規則
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./views/Home.vue') },
    { path: '/browse', component: () => import('./views/Browse.vue') },
    { path: '/title/:id', component: () => import('./views/Title.vue') },
    { path: '/watch/:id/:ep?', component: () => import('./views/Watch.vue') },
    { path: '/about', component: () => import('./views/About.vue') },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
