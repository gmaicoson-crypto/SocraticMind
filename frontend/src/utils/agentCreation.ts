import { createRequestId } from './requestId'

/** Keep an uncertain creation request stable across a reload in the same tab. */
export function pendingCreation(kind: string, input: unknown) {
  const key = `sm_agent_creation_${kind}`
  const payload = JSON.stringify(input)
  let id: string | undefined
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (saved?.payload === payload && typeof saved.id === 'string') id = saved.id
  } catch {
    /* Storage is optional; server-side recovery remains available. */
  }
  id ??= createRequestId('agent-create')
  try {
    sessionStorage.setItem(key, JSON.stringify({ payload, id }))
  } catch {
    /* optional */
  }
  return {
    id,
    complete() {
      try {
        if (JSON.parse(sessionStorage.getItem(key) ?? 'null')?.id === id)
          sessionStorage.removeItem(key)
      } catch {
        /* optional */
      }
    },
  }
}
