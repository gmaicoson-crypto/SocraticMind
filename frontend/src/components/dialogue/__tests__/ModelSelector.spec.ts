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
    vi.restoreAllMocks()
  })

  it('keeps the selector visible and opens a centered form', async () => {
    vi.mocked(getLLMModels).mockResolvedValue([])
    const wrapper = mount(ModelSelector)
    await flushPromises()

    expect(wrapper.find('select').exists()).toBe(true)
    expect(wrapper.find('option[value=""]').text()).toBe('选择模型')
    expect(wrapper.findAll('option')).toHaveLength(2)

    await wrapper.get('select').setValue('__add__')
    await flushPromises()
    expect(document.querySelector('.model-dialog h2')?.textContent).toBe('添加模型')
    expect(document.querySelector('.model-overlay')).not.toBeNull()
    const cancelButton = document.querySelector('.secondary-button') as HTMLButtonElement
    cancelButton.click()
    await flushPromises()
    expect(document.querySelector('.model-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('groups environment and user models and switches between them', async () => {
    vi.mocked(getLLMModels).mockResolvedValue([
      { id: 'env:first', name: '系统模型 A', model: 'official-a', source: 'environment' },
      {
        id: 'custom:second',
        name: '个人模型',
        model: 'official-b',
        base_url: 'https://b.test/v1',
        source: 'custom',
      },
    ])
    const wrapper = mount(ModelSelector)
    await flushPromises()

    expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
      '选择模型',
      '系统模型 A',
      '个人模型',
      '添加模型',
    ])
    expect(wrapper.findAll('optgroup').map((group) => group.attributes('label'))).toEqual([
      '系统模型',
      '我的模型',
    ])
    expect(useModelsStore().selectedModelId).toBe('env:first')
    await wrapper.get('select').setValue('custom:second')
    expect(useModelsStore().selectedModelId).toBe('custom:second')
    expect(wrapper.find('option[value="__manage__"]').exists()).toBe(true)
    await wrapper.get('select').setValue('env:first')
    expect(useModelsStore().selectedModelId).toBe('env:first')
    expect(wrapper.find('option[value="__manage__"]').exists()).toBe(false)
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

    await wrapper.get('select').setValue('custom:mine')
    await wrapper.get('select').setValue('__manage__')
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

    await wrapper.get('select').setValue('__manage__')
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
    await wrapper.get('select').setValue('__add__')
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
