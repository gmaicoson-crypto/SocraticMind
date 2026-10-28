import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAgentStore } from '../../stores/agent'
import { clearAuth } from '../../utils/token'
import { useAgentRun } from '../useAgentRun'

describe('useAgentRun local recovery index', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  it('retains recovery after transient failure and clears confirmed missing runs', async () => {
    const recovery = useAgentRun(1)
    const store = useAgentStore()
    vi.spyOn(store, 'restoreActiveRun').mockResolvedValue(null)
    recovery.rememberRun('session-a', 'run-a')
    vi.spyOn(store, 'restoreRun').mockImplementation(async () => {
      store.error = { code: 'NETWORK_ERROR', message: 'offline', retryable: true }
      return null
    })
    await recovery.restoreRun('session-a')
    expect(recovery.getRunId('session-a')).toBe('run-a')

    vi.mocked(store.restoreRun).mockImplementation(async () => {
      store.error = { status: 404, code: 'RUN_NOT_FOUND', message: 'missing', retryable: false }
      return null
    })
    await recovery.restoreRun('session-a')
    expect(recovery.getRunId('session-a')).toBeNull()
  })

  it('does not erase a newer recovery entry after an older request finishes', async () => {
    const recovery = useAgentRun(1)
    const store = useAgentStore()
    recovery.rememberRun('session-a', 'old-run')
    vi.spyOn(store, 'restoreRun').mockImplementation(async () => {
      recovery.rememberRun('session-a', 'new-run')
      store.error = { status: 404, code: 'RUN_NOT_FOUND', message: 'missing', retryable: false }
      return null
    })
    await recovery.restoreRun('session-a')
    expect(recovery.getRunId('session-a')).toBe('new-run')
  })

  it('isolates sessions by user and removes completed entries', () => {
    const first = useAgentRun(1)
    const second = useAgentRun(2)
    first.rememberRun('session-a', 'run-a')
    second.rememberRun('session-a', 'run-b')
    expect(first.getRunId('session-a')).toBe('run-a')
    expect(second.getRunId('session-a')).toBe('run-b')
    first.forgetRun('session-a')
    expect(first.getRunId('session-a')).toBeNull()
  })

  it('clears every user recovery index on logout', () => {
    useAgentRun(1).rememberRun('session-a', 'run-a')
    useAgentRun(2).rememberRun('session-b', 'run-b')
    sessionStorage.setItem('sm_agent_creation_onboarding_session-a', 'pending')
    clearAuth()
    expect(localStorage.getItem('sm_agent_runs_1')).toBeNull()
    expect(localStorage.getItem('sm_agent_runs_2')).toBeNull()
    expect(sessionStorage.getItem('sm_agent_creation_onboarding_session-a')).toBeNull()
  })
})
