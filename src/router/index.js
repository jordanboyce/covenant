import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/',          name: 'Library', component: () => import('@/views/LibraryView.vue') },
  { path: '/search',    name: 'Search',  component: () => import('@/views/SearchView.vue') },
  { path: '/view/:id',  name: 'Viewer',  component: () => import('@/views/ViewerView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
