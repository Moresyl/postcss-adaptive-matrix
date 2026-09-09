import { createOutputCopy, type CopyState } from './output-copy'

/** Download cancellation and clipboard serialization have distinct lifetimes. */
export function createMarkdownCopy(
  read: (url: string, signal: AbortSignal) => Promise<string>,
  write: (text: string) => Promise<void>,
  update: (state: CopyState) => void,
) {
  let controller: AbortController | undefined
  const task = createOutputCopy(async (url) => {
    const current = new AbortController()
    controller = current
    try {
      const markdown = await read(url, current.signal)
      if (!current.signal.aborted) await write(markdown)
    } finally {
      if (controller === current) controller = undefined
    }
  }, update)
  function reset() {
    controller?.abort()
    task.reset()
  }
  function dispose() {
    controller?.abort()
    task.dispose()
  }
  return { copy: (url: string) => task.copy(url, false), reset, dispose }
}
