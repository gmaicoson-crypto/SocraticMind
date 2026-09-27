// token 工具模块，提供可复用的纯函数。
const TOKEN_KEY = 'sm_token'
const LOGGED_IN_KEY = 'sm_logged_in'
const USER_KEY = 'sm_user'

function getStorage(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

export function setAuth(token: string, user: unknown, remember: boolean) {
  const s = getStorage(remember)
  s.setItem(TOKEN_KEY, token)
  s.setItem(LOGGED_IN_KEY, 'true')
  s.setItem(USER_KEY, JSON.stringify(user))

  const other = getStorage(!remember)
  other.removeItem(TOKEN_KEY)
  other.removeItem(LOGGED_IN_KEY)
  other.removeItem(USER_KEY)
}

export function clearAuth() {
  for (const s of [localStorage, sessionStorage]) {
    s.removeItem(TOKEN_KEY)
    s.removeItem(LOGGED_IN_KEY)
    s.removeItem(USER_KEY)
  }

  const sessionKeys = [
    'sm_socratic_sessions',
    'sm_normal_sessions',
    'sm_socratic_cur',
    'sm_normal_cur',
    'sm_chips_socratic',
    'sm_chips_normal',
  ]
  for (const k of sessionKeys) {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  }

  for (const storage of [localStorage, sessionStorage]) {
    const recoveryKeys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter((key): key is string => Boolean(key?.startsWith('sm_agent_runs_')))
    recoveryKeys.forEach((key) => storage.removeItem(key))
  }
}

export function loadUser(): unknown | null {
  const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function updateUser(user: unknown) {
  const raw = JSON.stringify(user)
  if (sessionStorage.getItem(USER_KEY) !== null) {
    sessionStorage.setItem(USER_KEY, raw)
  }
  if (localStorage.getItem(USER_KEY) !== null) {
    localStorage.setItem(USER_KEY, raw)
  }
}
