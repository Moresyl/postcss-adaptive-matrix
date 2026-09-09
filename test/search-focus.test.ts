import { afterEach, expect, it, vi } from 'vitest'
import { installSearchFocusRestore } from '../docs/.vitepress/theme/search-focus'

afterEach(() => vi.useRealTimers())

function fixture() {
  vi.useFakeTimers()
  let open = true
  const focus = vi.fn()
  const body = {}
  const doc = {
    body,
    activeElement: body,
    querySelector: vi.fn((selector: string) =>
      selector === '.VPLocalSearchBox' ? (open ? {} : null) : { focus },
    ),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const dispose = installSearchFocusRestore(doc as unknown as Document)
  const listener = doc.addEventListener.mock.calls[0]![1] as (event: { key: string }) => void
  return {
    doc,
    focus,
    dispose,
    listener,
    close: () => {
      open = false
    },
  }
}

it('restores dismissed search without scrolling', () => {
  const task = fixture()
  task.listener({ key: 'Escape' })
  task.close()
  vi.runAllTimers()
  expect(task.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
  task.dispose()
  expect(task.doc.removeEventListener).toHaveBeenCalledWith('keydown', task.listener, true)
})

it.each(['ordinary escape', 'other key', 'still open', 'focus moved', 'disposed'])(
  'does not steal focus when %s',
  (condition) => {
    const task = fixture()
    if (condition === 'ordinary escape') task.close()
    task.listener({ key: condition === 'other key' ? 'Enter' : 'Escape' })
    if (condition !== 'still open') task.close()
    if (condition === 'focus moved') task.doc.activeElement = { other: true }
    if (condition === 'disposed') task.dispose()
    vi.runAllTimers()
    expect(task.focus).not.toHaveBeenCalled()
    task.dispose()
  },
)

it('restores focus after the mobile back button or backdrop closes search', () => {
  for (const selector of ['.back-button', '.backdrop']) {
    const task = fixture()
    const click = task.doc.addEventListener.mock.calls[1]![1] as (event: {
      target: Element
    }) => void
    click({
      target: {
        closest: (value: string) => value.includes(`.VPLocalSearchBox ${selector}`),
      } as unknown as Element,
    })
    task.close()
    vi.runAllTimers()
    expect(task.focus).toHaveBeenCalledOnce()
    task.dispose()
  }
})

it('ignores result clicks and cancels pending pointer restoration on disposal', () => {
  const task = fixture()
  const click = task.doc.addEventListener.mock.calls[1]![1] as (event: { target: unknown }) => void
  click({ target: { closest: () => null } })
  expect(vi.getTimerCount()).toBe(0)
  click({ target: null })
  click({ target: {} })
  expect(vi.getTimerCount()).toBe(0)
  click({ target: { closest: () => ({}) } })
  task.close()
  task.dispose()
  vi.runAllTimers()
  expect(task.focus).not.toHaveBeenCalled()
  expect(task.doc.removeEventListener).toHaveBeenCalledWith('click', click, true)
})
