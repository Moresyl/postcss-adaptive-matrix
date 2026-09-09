import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { expect, it } from 'vitest'

it('wraps long reading content without imposing wrapping on code blocks or tables', () => {
  const root = postcss.parse(
    readFileSync(new URL('../docs/.vitepress/theme/custom.css', import.meta.url), 'utf8'),
  )
  const wrapping = new Set<string>()
  const balanced = new Set<string>()
  root.walkRules((rule) => {
    if (rule.parent?.type !== 'root') return
    rule.walkDecls('overflow-wrap', (declaration) => {
      if (declaration.value === 'anywhere')
        rule.selectors.forEach((selector) => wrapping.add(selector))
    })
    rule.walkDecls('text-wrap', (declaration) => {
      if (declaration.value === 'balance')
        rule.selectors.forEach((selector) => balanced.add(selector))
    })
  })
  expect([...wrapping].sort()).toEqual(
    ['.vp-doc h1', '.vp-doc h2', '.vp-doc h3', '.vp-doc p', '.vp-doc li'].sort(),
  )
  expect([...balanced]).toEqual(['.vp-doc h1', '.vp-doc h2', '.vp-doc h3'])
})
