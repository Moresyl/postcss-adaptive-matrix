export interface CompilerResponse {
  css?: string
  warnings?: { text: string }[]
  duration?: number
  error?: string
}

function validResponse(value: unknown): value is CompilerResponse {
  if (value === null || typeof value !== 'object') return false
  const response = value as Record<string, unknown>
  if ('css' in response && response.css !== undefined && typeof response.css !== 'string')
    return false
  if ('error' in response && response.error !== undefined && typeof response.error !== 'string')
    return false
  if (
    'duration' in response &&
    response.duration !== undefined &&
    (typeof response.duration !== 'number' ||
      !Number.isFinite(response.duration) ||
      response.duration < 0)
  )
    return false
  if ('warnings' in response && response.warnings !== undefined) {
    if (!Array.isArray(response.warnings)) return false
    if (
      response.warnings.some(
        (warning) =>
          warning === null ||
          typeof warning !== 'object' ||
          typeof (warning as { text?: unknown }).text !== 'string',
      )
    )
      return false
  }
  return typeof response.css === 'string' || typeof response.error === 'string'
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
        if (!validResponse(event.data)) {
          stop()
          fail('worker')
          return
        }
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
