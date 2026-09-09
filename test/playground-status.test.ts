import { expect, it } from 'vitest'
import { playgroundStatus } from '../docs/.vitepress/theme/playground-status'

it.each([null, '', '.card {}'])('tracks failure and recovery with retained output %j', (output) => {
  expect(playgroundStatus(true, false, output)).toEqual({ title: 'empty', stale: output !== null })
  expect(playgroundStatus(false, true, output)).toEqual({ title: 'failed', stale: output !== null })
  expect(playgroundStatus(false, false, output)).toEqual({ title: 'output', stale: false })
})

it('prioritizes an active compilation over a previous failure', () => {
  expect(playgroundStatus(true, true, '.card {}')).toEqual({ title: 'empty', stale: true })
})
