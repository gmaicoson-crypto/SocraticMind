import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { updateMe } from '../../../api/auth'
import { useLearningStore } from '../../../stores/learning'
import { aiAvatarPresets, userAvatarPresets } from '../../../utils/avatarPresets'
import EditProfileModal from '../EditProfileModal.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../../../api/auth', () => ({
  updateMe: vi.fn(),
  uploadAvatar: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
}))

const originalUser = {
  id: 1,
  username: '学习者',
  email: 'learner@example.test',
  avatar_url: userAvatarPresets[0],
  ai_avatar_url: aiAvatarPresets[0],
  bio: '学习中',
  daily_goal: 5,
  ai_style: '标准',
}

describe('EditProfileModal avatar save', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    setActivePinia(createPinia())
    useLearningStore().setUserInfo({ ...originalUser })
    vi.clearAllMocks()
  })

  function mountModal() {
    return mount(EditProfileModal, {
      global: {
        stubs: {
          BaseModal: { template: '<div><slot /></div>' },
          DeleteAccountModal: true,
        },
      },
    })
  }

  it('saves the user portrait without changing a conversation avatar', async () => {
    const updated = {
      ...originalUser,
      avatar_url: userAvatarPresets[1],
    }
    vi.mocked(updateMe).mockResolvedValue(updated)
    const wrapper = mountModal()
    expect(wrapper.text()).not.toContain('头像颜色')
    expect(wrapper.text()).not.toContain('AI 头像')
    expect(wrapper.findAll('.swatch')).toHaveLength(0)

    await wrapper.get('[aria-label="用户头像 2"]').trigger('click')
    await wrapper.get('.modal-footer .save-btn').trigger('click')
    await flushPromises()

    expect(updateMe).toHaveBeenCalledWith(
      expect.objectContaining({ avatar_url: userAvatarPresets[1] }),
    )
    expect(vi.mocked(updateMe).mock.calls[0][0]).not.toHaveProperty('ai_avatar_url')
    expect(useLearningStore().userInfo?.avatar_url).toBe(userAvatarPresets[1])
    wrapper.unmount()
  })

  it('selects another portrait from the 20-image pool', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const wrapper = mountModal()

    await wrapper.get('.avatar-action-btn.ghost').trigger('click')

    expect(wrapper.get('[aria-label="用户头像 2"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[aria-label="用户头像 7"]').attributes('aria-pressed')).toBe('false')
    wrapper.unmount()
    random.mockRestore()
  })

  it('shows an error if an outdated API ignores the avatar fields', async () => {
    vi.mocked(updateMe).mockResolvedValue({ ...originalUser })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountModal()

    await wrapper.get('[aria-label="用户头像 2"]').trigger('click')
    await wrapper.get('.modal-footer .save-btn').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('头像未保存')
    expect(useLearningStore().userInfo?.avatar_url).toBe(userAvatarPresets[0])
    wrapper.unmount()
    consoleError.mockRestore()
  })
})
