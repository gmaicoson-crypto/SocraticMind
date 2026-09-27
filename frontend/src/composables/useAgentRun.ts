import { useAgentStore } from '../stores/agent'

type RecoveryIndex = Record<string, string>

function storageKey(userId: number) {
  return `sm_agent_runs_${userId}`
}

function readIndex(userId: number): RecoveryIndex {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as RecoveryIndex)
      : {}
  } catch {
    return {}
  }
}

export function useAgentRun(userId: number) {
  function rememberRun(sessionId: string, runId: string) {
    const index = readIndex(userId)
    index[sessionId] = runId
    localStorage.setItem(storageKey(userId), JSON.stringify(index))
  }

  function getRunId(sessionId: string) {
    return readIndex(userId)[sessionId] ?? null
  }

  function forgetRun(sessionId: string) {
    const index = readIndex(userId)
    delete index[sessionId]
    if (Object.keys(index).length === 0) localStorage.removeItem(storageKey(userId))
    else localStorage.setItem(storageKey(userId), JSON.stringify(index))
  }

  async function restoreRun(sessionId: string) {
    const runId = getRunId(sessionId)
    if (!runId) return null
    const restored = await useAgentStore().restoreRun(runId)
    if (!restored || restored.status === 'completed' || restored.status === 'cancelled') {
      forgetRun(sessionId)
    }
    return restored
  }

  return { rememberRun, getRunId, forgetRun, restoreRun }
}
