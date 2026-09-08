/** Read raw documentation with bounded waiting and caller-owned cancellation. */
export async function readMarkdown(url: string, signal: AbortSignal): Promise<string> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancel = () => {}
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new Error('Markdown request cancelled.'))
      controller.abort()
    }
    signal.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => {
      reject(new Error('Markdown request timed out.'))
      controller.abort()
    }, 10_000)
  })
  try {
    if (signal.aborted) {
      cancel()
      return await interrupted
    }
    const request = async () => {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`Markdown request failed: ${response.status}`)
      if (/text\/html/i.test(response.headers.get('content-type') ?? '')) {
        throw new Error('Expected Markdown, received an HTML fallback.')
      }
      return response.text()
    }
    return await Promise.race([request(), interrupted])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}
