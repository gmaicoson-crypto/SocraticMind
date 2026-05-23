// index 路由模块，维护页面访问规则。

import { createRouter, createWebHistory } from 'vue-router'
import { isLoggedIn } from '../utils/token'

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
