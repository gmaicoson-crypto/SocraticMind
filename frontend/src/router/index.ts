import { createRouter, createWebHistory } from 'vue-router'
import { isLoggedIn } from '../utils/token'

// 路由懒加载：每个页面独立 chunk，减少首屏体积
const Login = () => import('../views/Login.vue')
const Home = () => import('../views/Home.vue')
const Profile = () => import('../views/Profile.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: Login,
    },
    {
      path: '/',
      name: 'home',
      component: Home,
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: Profile,
      meta: { requiresAuth: true },
    },
  ],
})

// 导航守卫：未登录跳登录页，已登录不再进入登录页
router.beforeEach((to) => {
  const loggedIn = isLoggedIn()
  if (to.meta.requiresAuth && !loggedIn) {
    return { name: 'login' }
  }
  if (to.name === 'login' && loggedIn) {
    return { name: 'home' }
  }
})

export default router
