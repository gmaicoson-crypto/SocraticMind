import { beforeEach, describe, expect, it } from 'vitest'
import { clearAuth } from '../../utils/token'
import { useAgentRun } from '../useAgentRun'

describe('useAgentRun local recovery index', () => {
  beforeEach(() => localStorage.clear())

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
    clearAuth()
    expect(localStorage.getItem('sm_agent_runs_1')).toBeNull()
    expect(localStorage.getItem('sm_agent_runs_2')).toBeNull()
  })
})
