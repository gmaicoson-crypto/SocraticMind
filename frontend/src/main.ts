import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'

// 创建 Vue 应用实例，挂载 Pinia 状态管理和路由
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
