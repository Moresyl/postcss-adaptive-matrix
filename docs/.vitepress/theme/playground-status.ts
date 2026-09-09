/** Keep the current task status separate from the retained successful output. */
export function playgroundStatus(compiling: boolean, failed: boolean, output: string | null) {
  return {
    title: compiling ? 'empty' : failed ? 'failed' : 'output',
    stale: output !== null && (compiling || failed),
  } as const
}
