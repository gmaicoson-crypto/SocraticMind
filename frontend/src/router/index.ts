import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Home from '../views/Home.vue'
import Profile from '../views/Profile.vue'

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
  const isLoggedIn = localStorage.getItem('sm_logged_in') === 'true'
  if (to.meta.requiresAuth && !isLoggedIn) {
    return { name: 'login' }
  }
  if (to.name === 'login' && isLoggedIn) {
    return { name: 'home' }
  }
})

export default router