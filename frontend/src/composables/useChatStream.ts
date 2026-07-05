export function useChatStream() {
  let controller: AbortController | null = null

  function beginRequest() {
    controller?.abort()
    controller = new AbortController()
    return controller
  }

  function abortRequest() {
    controller?.abort()
    controller = null
  }

  return {
    beginRequest,
    abortRequest,
    get controller() {
      return controller
    },
  }
}
