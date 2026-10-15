import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { login, register, sendVerificationCode } from '../../../api/auth'
import AuthenticationForm from '../AuthenticationForm.vue'

const { push, store } = vi.hoisted(() => ({
  push: vi.fn(),
  store: { setUserInfo: vi.fn(), fetchTopics: vi.fn(), recordLearning: vi.fn() },
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('../../../stores/learning', () => ({ useLearningStore: () => store }))
vi.mock('../../../api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  sendVerificationCode: vi.fn(),
}))

const user = {
  id: 1,
  username: '学习者',
  email: 'learner@example.test',
  bio: '',
  avatar_url: '',
  ai_avatar_url: '',
  daily_goal: 5,
  ai_style: '标准',
}
const wrappers: ReturnType<typeof mount>[] = []
function form() {
  const wrapper = mount(AuthenticationForm, {
    global: { stubs: { ForgotPasswordModal: true, LegalModal: true } },
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})

describe('authentication form extraction', () => {
  it('normalizes login email and restores user state before navigating', async () => {
    vi.mocked(login).mockResolvedValue({ access_token: 'login-token', user })
    const wrapper = form()
    await wrapper.get('input[type="email"]').setValue(' LEARNER@example.test ')
    await wrapper.get('input[type="password"]').setValue('Password123')
    await wrapper.get('.submit-btn').trigger('click')
    await flushPromises()
    expect(login).toHaveBeenCalledWith({ email: 'learner@example.test', password: 'Password123' })
    expect(sessionStorage.getItem('sm_token')).toBe('login-token')
    expect(store.setUserInfo).toHaveBeenCalledWith(user)
    expect(store.fetchTopics).toHaveBeenCalledOnce()
    expect(store.recordLearning).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith('/')
  })

  it('preserves registration validation and submits the verified form', async () => {
    vi.mocked(register).mockResolvedValue({ access_token: 'registered-token', user })
    const wrapper = form()
    await wrapper.findAll('.ftab')[1].trigger('click')
    await wrapper.get('input[type="email"]').setValue(user.email)
    await wrapper.get('input[placeholder="你的昵称"]').setValue(user.username)
    await wrapper.get('input[placeholder="输入密码"]').setValue('Password123')
    await wrapper.get('input[placeholder="再次输入密码"]').setValue('Different123')
    await wrapper.get('.submit-btn').trigger('click')
    expect(register).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('两次密码不一致')
    await wrapper.get('input[placeholder="再次输入密码"]').setValue('Password123')
    await wrapper.get('input[inputmode="numeric"]').setValue('123456')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('.submit-btn').trigger('click')
    await flushPromises()
    expect(register).toHaveBeenCalledWith({
      username: user.username,
      email: user.email,
      password: 'Password123',
      code: '123456',
    })
  })

  it('clears registration drafts on mode changes and releases the verification timer', async () => {
    vi.useFakeTimers()
    vi.mocked(sendVerificationCode).mockResolvedValue({ message: 'sent' })
    const wrapper = form()
    await wrapper.findAll('.ftab')[1].trigger('click')
    await wrapper.get('input[type="email"]').setValue(user.email)
    await wrapper.get('.code-send-btn').trigger('click')
    await flushPromises()
    expect(sendVerificationCode).toHaveBeenCalledWith(user.email, 'register')
    expect(wrapper.get('.code-send-btn').text()).toBe('60s')
    await wrapper.findAll('.ftab')[0].trigger('click')
    expect((wrapper.get('input[type="email"]').element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
