import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

describe('documentation print styles', () => {
  it('scopes readable code and layout overrides to print media', () => {
    const css = postcss.parse(
      readFileSync(new URL('../docs/.vitepress/theme/custom.css', import.meta.url), 'utf8'),
    )
    const print = css.nodes.find(
      (node) => node.type === 'atrule' && node.name === 'media' && node.params === 'print',
    )
    if (!print || print.type !== 'atrule') throw new Error('Missing print media rules')
    const declarations = new Map<string, Map<string, string>>()
    print.walkRules((rule) => {
      for (const selector of rule.selectors) {
        const values = declarations.get(selector) ?? new Map<string, string>()
        rule.walkDecls((decl) => {
          values.set(decl.prop, decl.value)
        })
        declarations.set(selector, values)
      }
    })
    expect(declarations.get('.VPDoc .content-container')?.get('max-width')).toBe('none')
    expect(declarations.get('.vp-doc pre code')?.get('white-space')).toBe('pre-wrap')
    expect(declarations.get('.vp-doc pre span')?.get('color')).toBe('#111827')
    expect(declarations.get(".vp-doc div[class*='language-']")?.get('background')).toBe('#f8fafc')
    expect(declarations.get('.vp-doc td')?.get('overflow-wrap')).toBe('anywhere')
    for (const selector of ['.VPNav', '.VPSidebar', '.copy-page', '.vp-doc button.copy']) {
      expect(declarations.get(selector)?.get('display')).toBe('none')
    }
    css.walkDecls('background', (decl) => {
      if (decl.value === '#f8fafc') expect(decl.parent?.parent).toBe(print)
    })
  })
})
