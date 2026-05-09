const TOKEN_KEY = 'sm_token'
const LOGGED_IN_KEY = 'sm_logged_in'
const USER_KEY = 'sm_user'

function getStorage(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage
}

/** 读取 token：优先 sessionStorage（非记住我），其次 localStorage */
export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
}

/** 是否已登录 */
export function isLoggedIn(): boolean {
  return !!getToken()
}

/** 登录/注册成功后保存认证信息。remember=false 则写入 sessionStorage（关闭浏览器即清除） */
export function setAuth(token: string, user: unknown, remember: boolean) {
  const s = getStorage(remember)
  s.setItem(TOKEN_KEY, token)
  s.setItem(LOGGED_IN_KEY, 'true')
  s.setItem(USER_KEY, JSON.stringify(user))
  // 清除另一存储的残留，避免 getToken() 返回旧 token
  const other = getStorage(!remember)
  other.removeItem(TOKEN_KEY)
  other.removeItem(LOGGED_IN_KEY)
  other.removeItem(USER_KEY)
}

/** 清除所有认证信息（登出/注销/401） */
export function clearAuth() {
  for (const s of [localStorage, sessionStorage]) {
    s.removeItem(TOKEN_KEY)
    s.removeItem(LOGGED_IN_KEY)
    s.removeItem(USER_KEY)
  }
  // 清除会话快照缓存（固定 key，非用户隔离）
  const sessionKeys = [
    'sm_socratic_sessions', 'sm_normal_sessions',
    'sm_socratic_cur', 'sm_normal_cur',
    'sm_chips_socratic', 'sm_chips_normal',
  ]
  for (const k of sessionKeys) {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  }
}

/** 从 localStorage 或 sessionStorage 加载用户信息 */
export function loadUser(): unknown | null {
  const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** 更新已存储的用户信息（编辑资料后调用） */
export function updateUser(user: unknown) {
  const raw = JSON.stringify(user)
  if (sessionStorage.getItem(USER_KEY) !== null) {
    sessionStorage.setItem(USER_KEY, raw)
  }
  if (localStorage.getItem(USER_KEY) !== null) {
    localStorage.setItem(USER_KEY, raw)
  }
}
