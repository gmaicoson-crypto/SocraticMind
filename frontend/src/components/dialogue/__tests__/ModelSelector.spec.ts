import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  createCustomModel,
  deleteCustomModel,
  getLLMModels,
  updateCustomModel,
} from '../../../api/models'
import { useModelsStore } from '../../../stores/models'
import ModelSelector from '../ModelSelector.vue'

vi.mock('../../../api/models', () => ({
  getLLMModels: vi.fn(),
  createCustomModel: vi.fn(),
  updateCustomModel: vi.fn(),
  deleteCustomModel: vi.fn(),
}))

describe('ModelSelector', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the selector visible and opens a centered form', async () => {
    vi.mocked(getLLMModels).mockResolvedValue([])
    const wrapper = mount(ModelSelector)
    await flushPromises()

    expect(wrapper.get('.model-selector').text()).toBe('选择模型')
    await wrapper.get('.model-selector').trigger('click')
    expect(wrapper.findAll('.model-option')).toHaveLength(0)
    expect(wrapper.get('.model-actions button:disabled').text()).toBe('编辑模型')

    await wrapper.get('.model-actions button').trigger('click')
    await flushPromises()
    expect(document.querySelector('.model-dialog h2')?.textContent).toBe('添加模型')
    expect(document.querySelector('.model-overlay')).not.toBeNull()
    expect(document.querySelectorAll('.model-form input')).toHaveLength(4)
    expect(document.querySelector('.model-form select')).toBeNull()
    expect(document.querySelector('.model-form')?.textContent).not.toContain('token')
    const cancelButton = document.querySelector('.secondary-button') as HTMLButtonElement
    cancelButton.click()
    await flushPromises()
    expect(document.querySelector('.model-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('shows one list of model names with separate actions and switches models', async () => {
    vi.mocked(getLLMModels).mockResolvedValue([
      { id: 'default', name: '默认模型', model: 'official-a', source: 'environment' },
      { id: 'env:second', name: 'official-b', model: 'official-b', source: 'environment' },
      {
        id: 'custom:second',
        name: '个人模型',
        model: 'custom-model',
        base_url: 'https://b.test/v1',
        source: 'custom',
      },
    ])
    const wrapper = mount(ModelSelector)
    await flushPromises()

    const trigger = wrapper.get('.model-selector')
    await trigger.trigger('click')
    expect(wrapper.findAll('.model-option').map((option) => option.text())).toEqual([
      'official-a',
      'official-b',
      '个人模型',
    ])
    expect(wrapper.findAll('.model-actions button').map((button) => button.text())).toEqual([
      '添加模型',
      '编辑模型',
    ])
    expect(wrapper.get('.model-option[aria-pressed="true"]').text()).toBe('official-a')
    expect(wrapper.get('.model-actions button:disabled').text()).toBe('编辑模型')
    expect(useModelsStore().selectedModelId).toBe('default')
    expect(trigger.attributes('title')).toBe('official-a')
    await wrapper.get('.model-option[title="official-b"]').trigger('click')
    expect(useModelsStore().selectedModelId).toBe('env:second')
    expect(trigger.attributes('title')).toBe('official-b')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    await wrapper.get('.model-option[title="个人模型"]').trigger('click')
    expect(useModelsStore().selectedModelId).toBe('custom:second')
    expect(trigger.attributes('title')).toBe('个人模型')
    await trigger.trigger('click')
    expect(wrapper.find('.model-actions button:disabled').exists()).toBe(false)
    wrapper.unmount()
  })

  it('supports keyboard navigation, Escape and outside dismissal', async () => {
    vi.mocked(getLLMModels).mockResolvedValue([
      { id: 'default', name: '默认模型', model: 'official-a', source: 'environment' },
    ])
    const wrapper = mount(ModelSelector, { attachTo: document.body })
    await flushPromises()
    const trigger = wrapper.get<HTMLButtonElement>('.model-selector')
    trigger.element.focus()
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    const selected = wrapper.get('.model-option[aria-pressed="true"]')
    expect(document.activeElement).toBe(selected.element)
    await selected.trigger('keydown', { key: 'ArrowDown' })
    const addButton = wrapper.get('.model-actions button')
    expect(document.activeElement).toBe(addButton.element)
    await addButton.trigger('keydown', { key: 'Escape' })
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger.element)

    await trigger.trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(trigger.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('opens to the right on mouse hover and stays open across the pointer gap', async () => {
    vi.mocked(getLLMModels).mockResolvedValue([])
    const wrapper = mount(ModelSelector, { attachTo: document.body })
    await flushPromises()
    vi.useFakeTimers()
    const root = wrapper.get('.model-selector-wrap')
    const trigger = wrapper.get<HTMLButtonElement>('.model-selector')
    vi.spyOn(trigger.element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 350, 120, 24),
    )
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()

    await root.trigger('pointerenter', { pointerType: 'mouse' })
    const panel = wrapper.get<HTMLElement>('.model-panel')
    expect(panel.element.style.left).toBe('226px')
    expect(document.activeElement).toBe(outside)
    await root.trigger('pointerleave', { pointerType: 'mouse' })
    vi.advanceTimersByTime(90)
    await root.trigger('pointerenter', { pointerType: 'mouse' })
    vi.advanceTimersByTime(180)
    expect(wrapper.find('.model-panel').exists()).toBe(true)

    await root.trigger('pointerleave', { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(180)
    expect(wrapper.find('.model-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the panel in the viewport and opens on tap for touch input', async () => {
    vi.mocked(getLLMModels).mockResolvedValue([])
    const wrapper = mount(ModelSelector)
    await flushPromises()
    const trigger = wrapper.get<HTMLButtonElement>('.model-selector')
    vi.spyOn(trigger.element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(window.innerWidth - 124, 350, 120, 24),
    )
    await wrapper.get('.model-selector-wrap').trigger('pointerenter', { pointerType: 'touch' })
    expect(wrapper.find('.model-panel').exists()).toBe(false)

    await trigger.trigger('click')
    const panel = wrapper.get<HTMLElement>('.model-panel')
    expect(panel.element.style.left).toBe(`${window.innerWidth - 228}px`)
    expect(panel.element.style.bottom).toBe(`${window.innerHeight - 344}px`)
    wrapper.unmount()
  })

  it('manages a selected user model from the home selector', async () => {
    vi.mocked(getLLMModels).mockResolvedValue([
      { id: 'env:first', name: '系统模型 A', model: 'official-a', source: 'environment' },
      {
        id: 'custom:mine',
        name: '我的模型',
        model: 'official-b',
        base_url: 'https://b.test/v1',
        source: 'custom',
      },
    ])
    vi.mocked(updateCustomModel).mockResolvedValue({
      id: 'custom:mine',
      name: '更新后的模型',
      model: 'official-b',
      base_url: 'https://b.test/v1',
      source: 'custom',
    })
    vi.mocked(deleteCustomModel).mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mount(ModelSelector)
    await flushPromises()

    await wrapper.get('.model-selector').trigger('click')
    await wrapper.get('.model-option[title="我的模型"]').trigger('click')
    await wrapper.get('.model-selector').trigger('click')
    await wrapper.get('.model-actions button:last-child').trigger('click')
    await flushPromises()
    expect(document.querySelector('.model-dialog h2')?.textContent).toBe('编辑模型')
    expect((document.querySelector('.model-form input') as HTMLInputElement).value).toBe(
      'official-b',
    )

    const nameInput = document.querySelectorAll<HTMLInputElement>('.model-form input')[3]
    nameInput.value = '更新后的模型'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    document
      .querySelector('.model-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(updateCustomModel).toHaveBeenCalledWith('custom:mine', {
      name: '更新后的模型',
      api_key: undefined,
      base_url: 'https://b.test/v1',
      model: 'official-b',
    })
    expect(useModelsStore().selectedModel?.name).toBe('更新后的模型')

    await wrapper.get('.model-selector').trigger('click')
    await wrapper.get('.model-actions button:last-child').trigger('click')
    await flushPromises()
    const deleteButton = document.querySelector('.delete-button') as HTMLButtonElement
    deleteButton.click()
    await flushPromises()
    expect(deleteCustomModel).toHaveBeenCalledWith('custom:mine')
    expect(useModelsStore().selectedModelId).toBe('env:first')
    expect(document.querySelector('.model-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('adds a model from the home selector and selects it immediately', async () => {
    vi.mocked(getLLMModels).mockResolvedValue([])
    vi.mocked(createCustomModel).mockResolvedValue({
      id: 'custom:new',
      name: '我的模型',
      model: 'official-model',
      base_url: 'https://provider.test/v1',
      source: 'custom',
    })
    const wrapper = mount(ModelSelector)
    await flushPromises()
    await wrapper.get('.model-selector').trigger('click')
    await wrapper.get('.model-actions button').trigger('click')
    await flushPromises()

    const fields = [...document.querySelectorAll<HTMLInputElement>('.model-form input')]
    for (const [index, value] of [
      'official-model',
      'secret-key',
      'https://provider.test/v1',
      '我的模型',
    ].entries()) {
      fields[index].value = value
      fields[index].dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flushPromises()
    document
      .querySelector('.model-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(createCustomModel).toHaveBeenCalledWith({
      name: '我的模型',
      api_key: 'secret-key',
      base_url: 'https://provider.test/v1',
      model: 'official-model',
    })
    expect(useModelsStore().selectedModelId).toBe('custom:new')
    expect(document.querySelector('.model-dialog')).toBeNull()
    wrapper.unmount()
  })
})
