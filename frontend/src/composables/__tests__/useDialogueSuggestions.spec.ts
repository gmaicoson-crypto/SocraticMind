import { effectScope, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSuggestions } from '../../api/chat'
import { useDialogueSuggestions } from '../useDialogueSuggestions'

vi.mock('../../api/chat', () => ({ getSuggestions: vi.fn() }))

const learningContext = {
  mode: 'socratic' as const,
  topicId: 7,
  topicTitle: 'RAG',
  sessionId: 'rag-session',
  nodeKey: 'retrieval',
  nodeLabel: '检索器',
  completedTurns: 1,
}
const questions = (subject: string) =>
  Array.from({ length: 12 }, (_, index) => `${subject}的问题${index}？`)
const scopes: ReturnType<typeof effectScope>[] = []

function start(initial: Parameters<typeof useDialogueSuggestions>[0], canLoad = true) {
  const enabled = ref(canLoad)
  const scope = effectScope()
  scopes.push(scope)
  const result = scope.run(() => useDialogueSuggestions(initial, () => enabled.value))!
  return { ...result, enabled, scope }
}

describe('dialogue suggestions by conversation context', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(getSuggestions).mockReset()
    vi.mocked(getSuggestions).mockResolvedValue({ suggestions: questions('RAG'), source: 'ai' })
  })

  afterEach(() => {
    for (const scope of scopes.splice(0)) scope.stop()
  })

  it('recommends topics for new dialogues and ignores the old mixed learning cache', async () => {
    localStorage.setItem('sm_chips_socratic', JSON.stringify(questions('旧主题')))
    const suggestions = start(() => ({ mode: 'socratic' }))
    expect(suggestions.chips.value[0]).toBe('我想学 Python')
    expect(getSuggestions).not.toHaveBeenCalled()

    suggestions.refreshSuggestions(['我想学 Python'])
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledWith('socratic', ['我想学 Python'])
  })

  it('automatically requests questions for the bound topic and current node', async () => {
    const suggestions = start(() => learningContext)
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledWith('socratic', [], {
      topicId: 7,
      sessionId: 'rag-session',
      nodeKey: 'retrieval',
    })
    expect(suggestions.chips.value).toEqual(questions('RAG'))
    expect(localStorage.getItem('sm_chips_socratic')).toBeNull()
  })

  it('refreshes for node changes and reuses each matching context cache', async () => {
    const context = ref(learningContext)
    const suggestions = start(() => context.value)
    await flushPromises()

    vi.mocked(getSuggestions).mockResolvedValue({ suggestions: questions('生成器'), source: 'ai' })
    context.value = { ...learningContext, nodeKey: 'generator', nodeLabel: '生成器' }
    await flushPromises()
    expect(suggestions.chips.value).toEqual(questions('生成器'))
    expect(vi.mocked(getSuggestions).mock.calls.at(-1)?.[2]?.nodeKey).toBe('generator')

    context.value = { ...context.value, completedTurns: 2 }
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(2)

    context.value = learningContext
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(2)
    expect(suggestions.chips.value).toEqual(questions('RAG'))

    context.value = { ...learningContext, sessionId: 'another-rag-session' }
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(3)
  })

  it('waits for the answer to finish before requesting updated questions', async () => {
    const context = ref(learningContext)
    const suggestions = start(() => context.value, false)
    context.value = { ...learningContext, completedTurns: 2 }
    await flushPromises()
    expect(getSuggestions).not.toHaveBeenCalled()
    context.value = { ...learningContext, completedTurns: 3 }
    suggestions.enabled.value = true
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(1)
  })

  it('discards late responses after switching topics and preserves the active loading state', async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof getSuggestions>>) => void
    let resolveNew!: (value: Awaited<ReturnType<typeof getSuggestions>>) => void
    vi.mocked(getSuggestions)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve
          }),
      )
    const context = ref(learningContext)
    const suggestions = start(() => context.value)
    context.value = {
      ...learningContext,
      topicId: 8,
      topicTitle: 'Python',
      sessionId: 'python-session',
      nodeKey: 'functions',
      nodeLabel: '函数',
    }
    await flushPromises()
    resolveOld({ suggestions: questions('RAG'), source: 'ai' })
    await flushPromises()
    expect(suggestions.chipsLoading.value).toBe(true)
    resolveNew({ suggestions: questions('函数'), source: 'ai' })
    await flushPromises()
    expect(suggestions.chips.value).toEqual(questions('函数'))
    expect(suggestions.chipsLoading.value).toBe(false)
  })

  it('rotates relevant fallback questions when the recommendation service is unavailable', async () => {
    vi.mocked(getSuggestions).mockRejectedValue(new Error('offline'))
    const suggestions = start(() => learningContext)
    await flushPromises()
    const previous = [...suggestions.chips.value]
    expect(previous[0]).toBe('检索器的核心原理是什么？')
    suggestions.refreshSuggestions(previous)
    await flushPromises()
    expect(suggestions.chips.value).toHaveLength(12)
    expect(suggestions.chips.value.every((value) => !previous.includes(value))).toBe(true)
    expect(suggestions.chips.value.every((value) => value.endsWith('？'))).toBe(true)
    expect(suggestions.chips.value).not.toContain('我想学 Python')
  })

  it('keeps everyday openers separate from follow-ups and restores them for new normal chats', async () => {
    const openers = Array.from({ length: 12 }, (_, index) => `聊聊日常话题${index}`)
    localStorage.setItem('sm_chips_normal', JSON.stringify(openers))
    const context = ref({
      mode: 'normal' as const,
      hasConversation: false,
      sessionId: 'beach-session',
    })
    const suggestions = start(() => context.value)
    expect(suggestions.chips.value).toEqual(openers)
    expect(getSuggestions).not.toHaveBeenCalled()

    vi.mocked(getSuggestions).mockResolvedValue({
      suggestions: questions('海边露营'),
      source: 'ai',
    })
    context.value = { ...context.value, hasConversation: true }
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledWith('normal', [], { sessionId: 'beach-session' })
    expect(suggestions.chips.value).toEqual(questions('海边露营'))
    expect(JSON.parse(localStorage.getItem('sm_chips_normal')!)).toEqual(openers)

    context.value = { ...context.value, hasConversation: false, sessionId: 'new-session' }
    await flushPromises()
    expect(suggestions.chips.value).toEqual(openers)
    expect(getSuggestions).toHaveBeenCalledTimes(1)
  })

  it('refreshes follow-ups every three completed turns and isolates them between sessions', async () => {
    const initial = {
      mode: 'normal' as const,
      hasConversation: true,
      sessionId: 'beach-session',
      completedTurns: 1,
    }
    const context = ref(initial)
    vi.mocked(getSuggestions).mockResolvedValue({
      suggestions: questions('海边露营'),
      source: 'ai',
    })
    const suggestions = start(() => context.value)
    await flushPromises()

    vi.mocked(getSuggestions).mockResolvedValue({
      suggestions: questions('露营装备'),
      source: 'ai',
    })
    context.value = { ...initial, completedTurns: 2 }
    await flushPromises()
    expect(suggestions.chips.value).toEqual(questions('海边露营'))
    context.value = { ...initial, completedTurns: 3 }
    await flushPromises()
    expect(suggestions.chips.value).toEqual(questions('海边露营'))
    expect(getSuggestions).toHaveBeenCalledTimes(1)
    context.value = { ...initial, completedTurns: 4 }
    await flushPromises()
    expect(suggestions.chips.value).toEqual(questions('露营装备'))

    vi.mocked(getSuggestions).mockResolvedValue({ suggestions: questions('晚餐'), source: 'ai' })
    context.value = { ...initial, sessionId: 'dinner-session' }
    await flushPromises()
    expect(suggestions.chips.value).toEqual(questions('晚餐'))

    context.value = { ...initial, completedTurns: 4 }
    await flushPromises()
    expect(suggestions.chips.value).toEqual(questions('露营装备'))
    expect(getSuggestions).toHaveBeenCalledTimes(3)
  })

  it('keeps current chips through streaming and background refresh, replacing them when ready', async () => {
    const context = ref(learningContext)
    const suggestions = start(() => context.value)
    await flushPromises()
    const previous = suggestions.chips.value

    // Sending a message or regenerating its answer does not complete another turn.
    suggestions.enabled.value = false
    await flushPromises()
    expect(suggestions.chips.value).toBe(previous)
    suggestions.enabled.value = true
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(1)

    let resolveRefresh!: (value: Awaited<ReturnType<typeof getSuggestions>>) => void
    vi.mocked(getSuggestions).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRefresh = resolve)),
    )
    suggestions.enabled.value = false
    context.value = { ...learningContext, completedTurns: 4 }
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(1)
    expect(suggestions.chips.value).toBe(previous)

    suggestions.enabled.value = true
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(2)
    expect(suggestions.chipsLoading.value).toBe(true)
    expect(suggestions.chips.value).toBe(previous)
    resolveRefresh({ suggestions: questions('新追问'), source: 'ai' })
    await flushPromises()
    expect(suggestions.chips.value).toEqual(questions('新追问'))
    expect(suggestions.chipsLoading.value).toBe(false)

    context.value = { ...learningContext, completedTurns: 6 }
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(2)
    context.value = { ...learningContext, completedTurns: 7 }
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(3)
  })

  it('keeps automatic failures quiet and lets manual refresh restart the turn interval', async () => {
    const context = ref(learningContext)
    const suggestions = start(() => context.value)
    await flushPromises()
    const previous = suggestions.chips.value
    vi.mocked(getSuggestions).mockRejectedValue(new Error('offline'))
    context.value = { ...learningContext, completedTurns: 4 }
    await flushPromises()
    expect(suggestions.chips.value).toEqual(previous)
    context.value = { ...learningContext, completedTurns: 5 }
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(2)

    vi.mocked(getSuggestions).mockResolvedValue({
      suggestions: questions('手动刷新'),
      source: 'ai',
    })
    suggestions.refreshSuggestions(previous)
    await flushPromises()
    expect(suggestions.chips.value).toEqual(questions('手动刷新'))
    context.value = { ...learningContext, completedTurns: 7 }
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(3)
    context.value = { ...learningContext, completedTurns: 8 }
    await flushPromises()
    expect(getSuggestions).toHaveBeenCalledTimes(4)
  })

  it('uses conversational fallbacks instead of unrelated daily topics after normal chat starts', async () => {
    vi.mocked(getSuggestions).mockRejectedValue(new Error('offline'))
    const suggestions = start(() => ({
      mode: 'normal',
      hasConversation: true,
      sessionId: 'beach-session',
    }))
    await flushPromises()
    const previous = [...suggestions.chips.value]
    expect(previous[0]).toBe('能展开说说刚才的内容吗？')
    suggestions.refreshSuggestions(previous)
    await flushPromises()
    expect(suggestions.chips.value).toHaveLength(12)
    expect(suggestions.chips.value.every((value) => !previous.includes(value))).toBe(true)
    expect(suggestions.chips.value).not.toContain('今天天气怎么样')
    expect(suggestions.chips.value).not.toContain('推荐一部电影')
  })
})
