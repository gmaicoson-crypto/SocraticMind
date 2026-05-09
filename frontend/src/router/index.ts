import { createRouter, createWebHistory } from 'vue-router'
import { isLoggedIn } from '../utils/token'

// 路由懒加载：每个 view 独立成 chunk，登录页不再带上 Home/Profile 的依赖
// （Home 引入 KnowledgeGraph、Profile 引入热力图等），首屏体积明显下降
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
