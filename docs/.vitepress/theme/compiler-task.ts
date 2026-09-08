export interface CompilerResponse {
  css?: string
  warnings?: { text: string }[]
  duration?: number
  error?: string
}

/** Owns one disposable Worker, including startup failures and its deadline. */
export function createCompilerTask(
  createWorker: () => Worker,
  receive: (result: CompilerResponse) => void,
  fail: (reason: 'timeout' | 'worker' | Error) => void,
) {
  let worker: Worker | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined

  function stop() {
    const previous = worker
    worker = undefined
    clearTimeout(deadline)
    deadline = undefined
    previous?.terminate()
  }

  function run(input: { css: string; options: string }) {
    stop()
    try {
      const current = createWorker()
      worker = current
      current.onmessage = (event: MessageEvent<CompilerResponse>) => {
        if (worker !== current) return
        stop()
        receive(event.data)
      }
      current.onerror = () => {
        if (worker !== current) return
        stop()
        fail('worker')
      }
      current.onmessageerror = () => {
        if (worker !== current) return
        stop()
        fail('worker')
      }
      deadline = setTimeout(() => {
        if (worker !== current) return
        stop()
        fail('timeout')
      }, 5000)
      current.postMessage(input)
    } catch (error) {
      stop()
      fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  return { run, stop }
}
