import { getAgentRun } from '../api/agent'
import { parseApiError, type ApiProblem } from '../api'
import type { AgentRun } from '../types/learningAgent'

/** One request at a time; all late callbacks belong to a disposable generation. */
export function createAgentPolling(
  apply: (run: AgentRun) => boolean,
  failed: (problem: ApiProblem) => void,
) {
  let generation = 0
  let identity: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | null = null
  let failures = 0

  function stop() {
    generation += 1
    identity = null
    clearTimeout(timer)
    controller?.abort()
    controller = null
  }

  function start(run: AgentRun) {
    if (!run.processing || ['completed', 'cancelled', 'failed'].includes(run.status)) {
      stop()
      return
    }
    if (identity === run.run_id) return
    stop()
    identity = run.run_id
    failures = 0
    const ownGeneration = generation
    const runId = run.run_id
    async function poll() {
      if (generation !== ownGeneration) return
      controller = new AbortController()
      try {
        const response = await getAgentRun(runId, controller.signal)
        if (generation !== ownGeneration) return
        failures = 0
        if (!apply(response)) {
          stop()
          return
        }
      } catch (cause) {
        if (generation !== ownGeneration) return
        const problem = parseApiError(cause)
        failed(problem)
        failures += 1
        if ([401, 403, 404].includes(problem.status ?? 0)) {
          stop()
          return
        }
      }
      if (generation === ownGeneration) {
        timer = setTimeout(poll, Math.min(15_000, 1000 * 2 ** Math.min(failures, 4)))
      }
    }
    timer = setTimeout(poll, 500)
  }
  return { start, stop }
}
