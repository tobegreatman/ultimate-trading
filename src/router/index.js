import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue'), meta: { public: true } },
  { path: '/', name: 'Dashboard', component: () => import('../views/Dashboard.vue') },
  { path: '/watchlist', name: 'Watchlist', component: () => import('../views/Watchlist.vue') },
  { path: '/stock-analysis', name: 'StockAnalysis', component: () => import('../views/StockAnalysis.vue') },
  { path: '/analysis', name: 'Analysis', component: () => import('../views/MarketAnalysis.vue') },
  { path: '/screener', name: 'Screener', component: () => import('../views/Screener.vue') },
  { path: '/position', name: 'Position', component: () => import('../views/Position.vue') },
  { path: '/journal', name: 'Journal', component: () => import('../views/Journal.vue') },
  { path: '/guide', name: 'Guide', component: () => import('../views/Guide.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 全局前置守卫：未登录时仅可访问公开页面
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
  // 已登录访问登录页则回到首页
  if (to.name === 'Login' && auth.isAuthenticated) {
    return { path: '/' }
  }
  return true
})

export default router
