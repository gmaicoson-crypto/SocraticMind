import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SocraticDialogue from '../SocraticDialogue.vue'
import MessageList from '../dialogue/MessageList.vue'
import DialogueInputBar from '../dialogue/DialogueInputBar.vue'
import DialogueHistoryPanel from '../dialogue/DialogueHistoryPanel.vue'
import { createDefaultSession } from '../../composables/useChatSessions'
import { useAgentStore } from '../../stores/agent'
import { useLearningStore } from '../../stores/learning'
import * as agentApi from '../../api/agent'
import { chatStream, deleteChatSession } from '../../api/chat'
import { getNodes, getTopics } from '../../api/topic'
import { getTodayPlan } from '../../api/plans'
import { getStreak, recordToday } from '../../api/progress'
import { getAttachmentCapabilities } from '../../api/attachments'
import { attachmentCapabilities } from '../../test/fixtures/attachments'
import type { AgentRun, AssessmentResult } from '../../types/learningAgent'
import { setAuth } from '../../utils/token'

vi.mock('../../api/agent', () => ({
  startAssessment: vi.fn(),
  answerAgentRun: vi.fn(),
  cancelAgentRun: vi.fn(),
  getAgentRun: vi.fn(),
  retryAgentRun: vi.fn(),
  getNodeAssessmentHistory: vi.fn(),
}))
vi.mock('../../api/chat', () => ({
  chatStream: vi.fn(),
  cancelChatStream: vi.fn().mockResolvedValue(undefined),
  deleteChatSession: vi.fn(),
  deleteMessages: vi.fn(),
  getAllMessages: vi.fn().mockResolvedValue([]),
  getSuggestions: vi.fn().mockResolvedValue({ suggestions: [], source: 'ai' }),
}))
vi.mock('../../api/topic', () => ({ getNodes: vi.fn(), getTopics: vi.fn() }))
vi.mock('../../api/plans', () => ({ getTodayPlan: vi.fn() }))
vi.mock('../../api/sessionTitles', () => ({
  getSessionTitles: vi.fn().mockResolvedValue([]),
  requestSessionTitle: vi.fn(async (sessionId: string) => ({
    session_id: sessionId,
    title: 'Redis',
    status: 'ready',
    retry_pending: false,
  })),
  renameSessionTitle: vi.fn(),
}))
vi.mock('../../api/attachments', () => ({
  getAttachmentCapabilities: vi.fn(),
}))
vi.mock('../../api/models', () => ({ getLLMModels: vi.fn().mockResolvedValue([]) }))
vi.mock('../../api/progress', () => ({
  getStreak: vi.fn().mockResolvedValue({ streak: 0, total_days: 0, recent: [] }),
  recordToday: vi.fn().mockResolvedValue(undefined),
}))

const run: AgentRun = {
  run_id: 'redis-assessment',
  type: 'assessment',
  status: 'assessing',
  version: 1,
  step: {
    step_id: 'q1',
    prompt: '请用自己的话说明 Redis 是什么。',
    input_type: 'text',
    choices: [],
    current: 1,
    total: 3,
  },
  preview: null,
  result: null,
  error: null,
}
const result: AssessmentResult = {
  node_id: 20,
  node_label: 'Redis',
  scores: [{ question_id: 'q1', score: 2, rationale: '需要补充应用场景' }],
  total_score: 8,
  evaluation_confidence: 0.8,
  critical_misconception: false,
  evidence: '理解基础概念',
  weaknesses: ['应用场景'],
  passed: false,
  professional_review_required: false,
  threshold: {
    minimum_score: 9,
    minimum_confidence: 0.7,
    requires_no_critical_misconception: true,
  },
  next_actions: ['continue_learning'],
}
const wrappers: ReturnType<typeof mount>[] = []

function signInLearner() {
  const user = {
    id: 1,
    username: 'learner',
    email: 'learner@example.com',
    avatar_url: '',
    ai_avatar_url: '',
    bio: '',
    daily_goal: 30,
    ai_style: '',
  }
  setAuth('test-token', user, false)
  useLearningStore().setUserInfo(user)
}

async function mountDialogue(previousResult = false) {
  const learning = useLearningStore()
  learning.topics = [{ id: '7', title: 'Redis', emoji: '', nodes: 1, mastered: 0 }]
  learning.activeTopicId = '7'
  learning.nodes = [
    {
      id: 'redis',
      dbId: 20,
      label: 'Redis',
      sub: '用途与应用',
      x: 0,
      y: 0,
      state: 'available',
      assessmentResult: previousResult ? result : null,
    },
  ]
  learning.activeNode = learning.nodes[0]
  const session = { ...createDefaultSession('socratic'), topicId: 7, topicTitle: 'Redis' }
  session.messages.push(
    { role: 'user', text: 'Redis 是什么？', time: '10:00', db_id: 10 },
    { role: 'ai', text: 'Redis 是内存数据库。', time: '10:01', db_id: 11 },
  )
  const otherSession = { ...createDefaultSession('socratic'), topicId: 7, topicTitle: 'Redis' }
  localStorage.setItem('sm_socratic_sessions', JSON.stringify([session, otherSession]))
  localStorage.setItem('sm_socratic_cur', session.id)
  const wrapper = mount(SocraticDialogue)
  wrappers.push(wrapper)
  await flushPromises()
  return {
    wrapper,
    learning,
    session,
    otherSession,
    list: wrapper.findComponent(MessageList),
    input: wrapper.findComponent(DialogueInputBar),
    history: wrapper.findComponent(DialogueHistoryPanel),
  }
}

async function mountAssessment(previousResult = false) {
  const mounted = await mountDialogue(previousResult)
  await mounted.wrapper.get('.mastery-actions .primary').trigger('click')
  await flushPromises()
  return mounted
}

async function openHistoryResult(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('.mastery-history').trigger('click')
  await flushPromises()
  document.querySelector<HTMLButtonElement>('.history-record')!.click()
  await flushPromises()
}

describe('persistent assessment overlay', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })
    vi.mocked(agentApi.startAssessment).mockResolvedValue(run)
    vi.mocked(agentApi.getNodeAssessmentHistory).mockResolvedValue({
      items: [
        {
          id: 1,
          run_id: run.run_id,
          assessed_at: '2026-10-15T10:00:00Z',
          total_score: 8,
          max_score: 12,
          passed: false,
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
    })
    vi.mocked(agentApi.getAgentRun).mockResolvedValue({
      ...run,
      status: 'completed',
      step: null,
      result,
    })
    vi.mocked(getAttachmentCapabilities).mockResolvedValue(attachmentCapabilities)
    vi.mocked(getTopics).mockResolvedValue([
      { id: 7, title: 'Redis', emoji: '', total_nodes: 1, mastered_nodes: 0 },
    ])
    vi.mocked(getNodes).mockResolvedValue([
      {
        id: 20,
        node_key: 'redis',
        label: 'Redis',
        sub: '用途与应用',
        state: 'available',
        x: 0,
        y: 0,
        parent_keys: '',
        estimated_minutes: 10,
        mastery_source: null,
        mastery_confidence: null,
        assessment_result: result,
      },
    ])
    vi.mocked(getTodayPlan).mockResolvedValue({
      date: '2026-10-14',
      effective_timezone: 'UTC',
      replan_suggested: false,
      today: [],
      overdue: [],
      upcoming: [],
    })
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    sessionStorage.clear()
  })

  it('opens historical results only from the node card and closes them when the node changes', async () => {
    const { wrapper, learning } = await mountDialogue(true)
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    const historyButton = wrapper.get('.mastery-footer .mastery-history')
    expect(historyButton.text()).toBe('查看历史评估结果')
    expect(agentApi.getNodeAssessmentHistory).not.toHaveBeenCalled()
    await openHistoryResult(wrapper)
    expect(document.querySelector('.assessment-result-dialog')?.textContent).toContain(
      result.evidence,
    )
    expect(agentApi.startAssessment).not.toHaveBeenCalled()

    learning.setActiveNode({ ...learning.nodes[0], id: 'lists', dbId: 21, assessmentResult: null })
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    expect(wrapper.find('.mastery-history').exists()).toBe(false)
    learning.setActiveNode(learning.nodes[0])
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    await openHistoryResult(wrapper)
    expect(document.querySelector('.assessment-result-dialog')).not.toBeNull()
  })

  it('does not open results when a completed run is restored', async () => {
    const { wrapper } = await mountDialogue(true)
    vi.mocked(agentApi.getAgentRun).mockResolvedValueOnce({
      ...run,
      status: 'completed',
      step: null,
      result,
    })
    await useAgentStore().restoreRun(run.run_id)
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    await openHistoryResult(wrapper)
    expect(document.querySelector('.assessment-result-dialog')?.textContent).toContain(
      result.evidence,
    )
  })

  it('keeps the assessment outside scrolling history without a hide or collapse action', async () => {
    const { wrapper, list, input } = await mountAssessment(true)
    const card = wrapper.get('.assessment-overlay .step-tool').element
    const scroll = list.get('.dlg-messages')
    expect(scroll.element.contains(card)).toBe(false)
    expect(list.get('.message-overlay').element.contains(card)).toBe(true)
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    expect(wrapper.find('.mastery-collapse').exists()).toBe(false)
    expect(wrapper.find('button[title="重新回答"]').exists()).toBe(false)
    expect(wrapper.find('button[title="引用追问"]').exists()).toBe(false)
    expect(wrapper.find('button[title="复制"]').exists()).toBe(true)
    await scroll.trigger('scroll')
    await scroll.trigger('wheel', { deltaY: -100 })
    expect(wrapper.get('.assessment-overlay .step-tool').element).toBe(card)
    expect(list.findAll('[data-message-index]')).toHaveLength(2)
    expect(input.get('.send-btn').text()).toBe('提交答案')
    expect(
      input.findAll('.mode-btn').every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true)
  })

  it('locks the session as soon as assessment starts, before its first question arrives', async () => {
    let resolveStart!: (value: AgentRun) => void
    vi.mocked(agentApi.startAssessment).mockImplementationOnce(
      () => new Promise((resolve) => (resolveStart = resolve)),
    )
    const { wrapper, history, input, session } = await mountAssessment()
    expect(wrapper.find('.assessment-overlay').exists()).toBe(true)
    expect(input.props('modeSwitchDisabled')).toBe(true)
    history.vm.$emit('newSession')
    await flushPromises()
    expect(history.props('currentSessionId')).toBe(session.id)
    resolveStart(run)
    await flushPromises()
    expect(wrapper.get('.assessment-overlay .step-prompt').text()).toBe(run.step!.prompt)
    expect(input.props('modeSwitchDisabled')).toBe(true)
  })

  it('submits input as an assessment answer and keeps the card while the next question loads', async () => {
    let resolveAnswer!: (value: AgentRun) => void
    vi.mocked(agentApi.answerAgentRun).mockImplementationOnce(
      () => new Promise((resolve) => (resolveAnswer = resolve)),
    )
    const { wrapper, list, input } = await mountAssessment()
    const card = wrapper.get('.step-tool').element
    await input.get('textarea').setValue('Redis 主要在内存中存储数据。')
    await input.get('textarea').trigger('keydown.enter')
    await flushPromises()
    expect(agentApi.answerAgentRun).toHaveBeenCalledWith(run.run_id, {
      step_id: 'q1',
      version: 1,
      answer: 'Redis 主要在内存中存储数据。',
    })
    expect(wrapper.get('.step-tool').element).toBe(card)
    expect(wrapper.get('.step-footer button').attributes('disabled')).toBeDefined()
    expect(chatStream).not.toHaveBeenCalled()
    resolveAnswer({
      ...run,
      version: 2,
      step: { ...run.step!, step_id: 'q2', current: 2, prompt: '举一个应用场景。' },
    })
    await flushPromises()
    expect(wrapper.get('.step-tool').element).toBe(card)
    expect(wrapper.get('.step-prompt').text()).toBe('举一个应用场景。')
    expect(list.props('messages').at(-1)?.messageType).toBe('agent_answer')
    expect(input.props('input')).toBe('')
  })

  it.each(['assessment', 'onboarding'] as const)(
    'submits all %s answers with one daily progress sync',
    async (type) => {
      signInLearner()
      const { input } = type === 'assessment' ? await mountAssessment() : await mountDialogue()
      const current: AgentRun = type === 'assessment' ? run : { ...run, type, status: 'diagnosing' }
      if (type === 'onboarding') useAgentStore().run = current

      for (let question = 1; question <= 3; question++) {
        vi.mocked(agentApi.answerAgentRun).mockResolvedValueOnce({
          ...current,
          version: question + 1,
          ...(question < 3
            ? { step: { ...run.step!, step_id: `q${question + 1}`, current: question + 1 } }
            : { step: null, status: 'completed', result: type === 'assessment' ? result : null }),
        })
        await input.get('textarea').setValue(`第 ${question} 题的答案`)
        await input.get('textarea').trigger('keydown.enter')
        await flushPromises()
      }
      expect(agentApi.answerAgentRun).toHaveBeenCalledTimes(3)
      expect(recordToday).toHaveBeenCalledOnce()
      expect(getStreak).toHaveBeenCalledOnce()
    },
  )

  it('restores an onboarding run when returning from the saved normal mode', async () => {
    signInLearner()
    const session = createDefaultSession('socratic')
    const onboarding = { ...run, type: 'onboarding', status: 'diagnosing' } as const
    localStorage.setItem('sm_socratic_sessions', JSON.stringify([session]))
    localStorage.setItem('sm_socratic_cur', session.id)
    localStorage.setItem('sm_chat_mode', 'normal')
    localStorage.setItem('sm_agent_runs_1', JSON.stringify({ [session.id]: onboarding.run_id }))
    vi.mocked(agentApi.getAgentRun).mockResolvedValue(onboarding)
    const wrapper = mount(SocraticDialogue)
    wrappers.push(wrapper)
    const input = wrapper.getComponent(DialogueInputBar)
    await flushPromises()
    expect(input.props('chatMode')).toBe('normal')
    expect(agentApi.getAgentRun).not.toHaveBeenCalled()

    input.vm.$emit('update:chatMode', 'socratic')
    await flushPromises()
    expect(agentApi.getAgentRun).toHaveBeenLastCalledWith(onboarding.run_id)
    expect(wrapper.get('.step-prompt').text()).toBe(onboarding.step!.prompt)
  })

  it('records a new learning day when a dialogue stays open past server midnight', async () => {
    signInLearner()
    const dayEnds = Date.now() + 60_000
    const now = vi.spyOn(Date, 'now').mockReturnValue(dayEnds - 1)
    vi.mocked(recordToday)
      .mockResolvedValueOnce(dayEnds)
      .mockResolvedValueOnce(dayEnds + 86_400_000)
    try {
      const { input } = await mountDialogue()
      const send = async (text: string) => {
        await input.get('textarea').setValue(text)
        await input.get('textarea').trigger('keydown.enter')
        await flushPromises()
        const callbacks = vi.mocked(chatStream).mock.calls.at(-1)![1]
        callbacks.onChunk('回复')
        callbacks.onDone()
        await flushPromises()
      }

      await send('午夜前的问题')
      await send('同一天的问题')
      expect(recordToday).toHaveBeenCalledOnce()
      expect(getStreak).toHaveBeenCalledOnce()

      now.mockReturnValue(dayEnds)
      await send('新一天的问题')
      expect(recordToday).toHaveBeenCalledTimes(2)
      expect(getStreak).toHaveBeenCalledTimes(2)
    } finally {
      now.mockRestore()
    }
  })

  it('prevents mode, session, retry and graph actions from dismissing an unfinished assessment', async () => {
    const { wrapper, list, input, history, learning, session, otherSession } =
      await mountAssessment()
    input.vm.$emit('update:chatMode', 'normal')
    history.vm.$emit('switch', otherSession.id)
    history.vm.$emit('newSession')
    history.vm.$emit('delete', session.id)
    list.vm.$emit('retry', 2)
    list.vm.$emit('select-choice', 'A. 历史选项')
    input.vm.$emit('sendSuggestion', '继续普通对话')
    learning.requestNodeDialogue(learning.nodes[0])
    await flushPromises()
    expect(input.props('chatMode')).toBe('socratic')
    expect(history.props('currentSessionId')).toBe(session.id)
    expect(wrapper.find('.assessment-overlay').exists()).toBe(true)
    expect(useAgentStore().run?.run_id).toBe(run.run_id)
    expect(chatStream).not.toHaveBeenCalled()
    expect(agentApi.answerAgentRun).not.toHaveBeenCalled()
    expect(deleteChatSession).not.toHaveBeenCalled()

    learning.activeTopicId = '8'
    await flushPromises()
    expect(learning.activeTopicId).toBe('7')
    expect(history.props('currentSessionId')).toBe(session.id)
    expect(useAgentStore().run?.run_id).toBe(run.run_id)
  })

  it.each(['scoring failure', 'lost response'])(
    'retries the same assessment after a third-answer %s',
    async (failure) => {
      const thirdQuestion: AgentRun = {
        ...run,
        version: 3,
        step: { ...run.step!, step_id: 'q3', current: 3 },
      }
      const failed: AgentRun = {
        ...run,
        version: 5,
        status: 'failed',
        step: null,
        error: { code: 'AI_OUTPUT_LIMIT', retryable: true },
      }
      vi.mocked(agentApi.startAssessment).mockResolvedValueOnce(thirdQuestion)
      if (failure === 'lost response') {
        vi.mocked(agentApi.answerAgentRun).mockRejectedValueOnce(new Error('Network error'))
        vi.mocked(agentApi.getAgentRun).mockResolvedValueOnce({
          ...failed,
          version: 4,
          status: 'assessing',
          error: null,
        })
        vi.mocked(agentApi.getAgentRun).mockResolvedValueOnce(failed)
      } else {
        vi.mocked(agentApi.answerAgentRun).mockResolvedValueOnce(failed)
      }
      vi.mocked(agentApi.retryAgentRun).mockResolvedValueOnce({
        ...failed,
        version: 8,
        status: 'completed',
        result,
        error: null,
      })
      const { wrapper, input } = await mountAssessment()
      await input.get('textarea').setValue('第三题答案')
      await input.get('textarea').trigger('keydown.enter')
      await flushPromises()
      if (failure === 'lost response') {
        const refresh = wrapper.get('.assessment-overlay .agent-error button')
        expect(refresh.text()).toBe('刷新评估状态')
        await refresh.trigger('click')
        await flushPromises()
        expect(agentApi.retryAgentRun).not.toHaveBeenCalled()
      }
      const retry = wrapper.get('.assessment-overlay .agent-error button')
      expect(retry.text()).toBe('重试评估')
      expect(wrapper.get('.assessment-overlay').text()).toContain('放弃评估')
      expect(input.props('sendDisabled')).toBe(true)
      await retry.trigger('click')
      await flushPromises()
      expect(agentApi.retryAgentRun).toHaveBeenCalledWith(run.run_id)
      expect(agentApi.answerAgentRun).toHaveBeenCalledExactlyOnceWith(run.run_id, {
        step_id: 'q3',
        version: 3,
        answer: '第三题答案',
      })
      expect(wrapper.find('.assessment-overlay').exists()).toBe(false)
      expect(document.querySelector('.assessment-result-dialog')?.textContent).toContain(
        result.evidence,
      )
    },
  )

  it('keeps a failed assessment locked and visible until retry or explicit abandonment', async () => {
    vi.mocked(agentApi.answerAgentRun).mockResolvedValueOnce({
      ...run,
      status: 'failed',
      step: null,
      error: { code: 'AI_FAILED', retryable: true },
    })
    vi.mocked(agentApi.retryAgentRun).mockResolvedValueOnce(run)
    const { wrapper, input } = await mountAssessment()
    await input.get('textarea').setValue('我的答案')
    await input.get('textarea').trigger('keydown.enter')
    await flushPromises()
    expect(wrapper.get('.assessment-overlay').text()).toContain('放弃评估')
    expect(wrapper.find('.mastery-dock').exists()).toBe(false)
    expect(input.props('sendDisabled')).toBe(true)
    input.vm.$emit('update:input', '继续聊天')
    input.vm.$emit('send')
    await flushPromises()
    expect(chatStream).not.toHaveBeenCalled()
    await wrapper.get('.assessment-overlay .agent-error button').trigger('click')
    await flushPromises()
    expect(agentApi.retryAgentRun).toHaveBeenCalledWith(run.run_id)
    expect(wrapper.get('.assessment-overlay .step-prompt').text()).toBe(run.step!.prompt)
    expect(input.props('sendDisabled')).toBe(false)
  })

  it('retains the card when abandonment fails and unlocks chat only after server confirmation', async () => {
    vi.mocked(agentApi.cancelAgentRun).mockRejectedValueOnce(new Error('暂时无法放弃，请重试'))
    const { wrapper, input } = await mountAssessment()
    await wrapper.get('.step-footer button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.assessment-overlay .step-error').text()).toContain('暂时无法放弃')
    expect(input.props('modeSwitchDisabled')).toBe(true)

    let confirmCancel!: (value: AgentRun) => void
    vi.mocked(agentApi.cancelAgentRun).mockImplementationOnce(
      () => new Promise((resolve) => (confirmCancel = resolve)),
    )
    await wrapper.get('.step-footer button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.assessment-overlay').exists()).toBe(true)
    expect(input.props('modeSwitchDisabled')).toBe(true)
    confirmCancel({ ...run, status: 'cancelled', step: null })
    await flushPromises()
    expect(wrapper.find('.assessment-overlay').exists()).toBe(false)
    expect(input.props('modeSwitchDisabled')).toBe(false)
    await input.get('textarea').setValue('继续解释 Redis 的用途')
    await input.get('textarea').trigger('keydown.enter')
    await flushPromises()
    expect(chatStream).toHaveBeenCalledTimes(1)
  })

  it('removes the question overlay and restores normal chat when assessment completes', async () => {
    signInLearner()
    vi.mocked(agentApi.answerAgentRun).mockResolvedValueOnce({
      ...run,
      status: 'completed',
      step: null,
      result,
    })
    const { wrapper, input, list } = await mountAssessment()
    const scroll = list.get('.dlg-messages').element
    await input.get('textarea').setValue('我的最后一个答案')
    await input.get('textarea').trigger('keydown.enter')
    await flushPromises()
    expect(wrapper.find('.assessment-overlay').exists()).toBe(false)
    const dialog = document.querySelector<HTMLElement>('.assessment-result-dialog')!
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.textContent).toContain('评估完成')
    expect(wrapper.element.contains(dialog)).toBe(false)
    expect(list.find('.assessment-result').exists()).toBe(false)
    expect(list.get('.dlg-messages').element).toBe(scroll)
    expect(input.props('modeSwitchDisabled')).toBe(false)
    expect(input.get('.send-btn').text()).toBe('发送')
    dialog.querySelector<HTMLButtonElement>('[aria-label="关闭评估结果"]')!.click()
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    await input.get('textarea').setValue('再讲讲应用场景')
    await input.get('textarea').trigger('keydown.enter')
    await flushPromises()
    expect(chatStream).toHaveBeenCalledTimes(1)
    expect(recordToday).toHaveBeenCalledOnce()
    expect(getStreak).toHaveBeenCalledOnce()
  })

  it('keeps a closed result hidden after node refresh, session reentry and page reload', async () => {
    vi.mocked(agentApi.answerAgentRun).mockResolvedValueOnce({
      ...run,
      status: 'completed',
      step: null,
      result,
    })
    const { wrapper, input, learning, history, session, otherSession } = await mountAssessment()
    await input.get('textarea').setValue('最后一个答案')
    await input.get('textarea').trigger('keydown.enter')
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('[aria-label="关闭评估结果"]')!.click()
    await flushPromises()

    await learning.fetchNodes(7)
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    expect(learning.activeNode?.assessmentResult).toEqual(result)

    history.vm.$emit('switch', otherSession.id)
    await flushPromises()
    history.vm.$emit('switch', session.id)
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    await openHistoryResult(wrapper)
    expect(document.querySelector('.assessment-result-dialog')?.textContent).toContain(
      result.evidence,
    )
    document.querySelector<HTMLButtonElement>('[aria-label="关闭评估结果"]')!.click()
    await flushPromises()

    wrappers.splice(wrappers.indexOf(wrapper), 1)
    wrapper.unmount()
    const reentered = mount(SocraticDialogue)
    wrappers.push(reentered)
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    expect(reentered.get('.mastery-history').text()).toBe('查看历史评估结果')
    wrappers.splice(wrappers.indexOf(reentered), 1)
    reentered.unmount()

    setActivePinia(createPinia())
    const reloaded = await mountDialogue(true)
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    await openHistoryResult(reloaded.wrapper)
    expect(document.querySelector('.assessment-result-dialog')?.textContent).toContain(
      result.evidence,
    )
  })

  it('automatically opens the new result after another assessment completes', async () => {
    const nextResult = { ...result, evidence: '本次已能解释 Redis 应用场景' }
    vi.mocked(agentApi.answerAgentRun)
      .mockResolvedValueOnce({ ...run, status: 'completed', step: null, result })
      .mockResolvedValueOnce({ ...run, status: 'completed', step: null, result: nextResult })
    const { wrapper, input } = await mountAssessment()
    await input.get('textarea').setValue('第一次答案')
    await input.get('textarea').trigger('keydown.enter')
    await flushPromises()
    document.querySelector<HTMLButtonElement>('[aria-label="关闭评估结果"]')!.click()
    await flushPromises()

    await wrapper.get('.mastery-actions .primary').trigger('click')
    await input.get('textarea').setValue('新的答案')
    await input.get('textarea').trigger('keydown.enter')
    await flushPromises()
    expect(document.querySelector('.assessment-result-dialog')?.textContent).toContain(
      nextResult.evidence,
    )
  })

  it('opens a new assessment from the result window without adding it to chat history', async () => {
    vi.mocked(agentApi.answerAgentRun).mockResolvedValueOnce({
      ...run,
      status: 'completed',
      step: null,
      result,
    })
    const { wrapper, input, list } = await mountAssessment()
    await input.get('textarea').setValue('答案')
    await input.get('textarea').trigger('keydown.enter')
    await flushPromises()
    const dialog = document.querySelector('.assessment-result-dialog')!
    const retry = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent === '重新评估',
    )!
    retry.click()
    await flushPromises()
    expect(agentApi.startAssessment).toHaveBeenCalledTimes(2)
    expect(document.querySelector('.assessment-result-dialog')).toBeNull()
    expect(wrapper.get('.assessment-overlay .step-prompt').text()).toBe(run.step!.prompt)
    expect(list.find('.assessment-result').exists()).toBe(false)
  })

  it('closes only the mastery confirmation on Escape while preserving its result window', async () => {
    vi.mocked(agentApi.answerAgentRun).mockResolvedValueOnce({
      ...run,
      status: 'completed',
      step: null,
      result: { ...result, passed: true },
    })
    const { input } = await mountAssessment()
    await input.get('textarea').setValue('答案')
    await input.get('textarea').trigger('keydown.enter')
    await flushPromises()
    const dialog = document.querySelector('.assessment-result-dialog')!
    const revert = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent === '撤销掌握',
    )!
    revert.click()
    await flushPromises()
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(document.querySelector('.assessment-result-dialog')).toBe(dialog)
  })
})
