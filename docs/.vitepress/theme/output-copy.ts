export type CopyState = 'idle' | 'copying' | 'copied' | 'failed'

/** Invalidating a pending copy suppresses stale feedback and keeps writes serialized. */
export function createOutputCopy(
  write: (text: string) => Promise<void>,
  update: (state: CopyState) => void,
) {
  let generation = 0
  let pending = false
  function reset() {
    generation++
    update(pending ? 'copying' : 'idle')
  }
  async function copy(output: string | null, unavailable: boolean) {
    if (output === null || unavailable || pending) return
    const current = ++generation
    pending = true
    update('copying')
    try {
      await write(output)
      if (current === generation) update('copied')
    } catch {
      if (current === generation) update('failed')
    } finally {
      pending = false
      if (current !== generation) update('idle')
    }
  }
  return { copy, reset }
}
