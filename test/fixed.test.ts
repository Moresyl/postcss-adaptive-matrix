import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import { adaptiveMatrix } from '../src/postcss/plugin.js'
import { correctFixedDeclaration, isFixedPositionValue } from '../src/core/fixed.js'
import { appPcPreset } from '../src/core/presets.js'
import type { AdaptiveMatrixOptions } from '../src/core/types.js'

const CONFIG = {
  defaultProfile: 'app',
  libraries: false as const,
  profiles: {
    app: {
      designWidth: 375,
      fluid: { minWidth: 320, maxWidth: 480 },
      query: '(max-width: 767.98px)',
    },
    pc: {
      designWidth: 1440,
      fluid: { minWidth: 768, maxWidth: 1920 },
      query: '(min-width: 768px)',
      rootMaxWidth: 600,
    },
  },
  root: { selector: '#app', fixedContainingBlock: true, safeAreaVariables: false },
}

async function run(css: string, options: AdaptiveMatrixOptions = CONFIG): Promise<string> {
  const result = await postcss([adaptiveMatrix(options)]).process(css, {
    from: '/src/app.css',
  })
  return result.css
}

describe('correctFixedDeclaration', () => {
  it('replaces a zero inset outright rather than wrapping it', () => {
    expect(correctFixedDeclaration('left', '0')).toBe('var(--adaptive-root-gutter)')
    expect(correctFixedDeclaration('right', '0px')).toBe('var(--adaptive-root-gutter)')
    expect(correctFixedDeclaration('left', '.0px')).toBe('var(--adaptive-root-gutter)')
    expect(correctFixedDeclaration('left', '+0')).toBe('var(--adaptive-root-gutter)')
    expect(correctFixedDeclaration('left', '0e3rem')).toBe('var(--adaptive-root-gutter)')
    expect(correctFixedDeclaration('left', '0svw')).toBe('var(--adaptive-root-gutter)')
    expect(correctFixedDeclaration('left', '0cqmax')).toBe('var(--adaptive-root-gutter)')
    expect(correctFixedDeclaration('left', '0cm')).toBe('var(--adaptive-root-gutter)')
  })

  it('adds the gutter to a non-zero inset', () => {
    expect(correctFixedDeclaration('left', '12px')).toBe('calc(12px + var(--adaptive-root-gutter))')
  })

  it('leaves auto alone, having no length to offset', () => {
    expect(correctFixedDeclaration('left', 'auto')).toBeNull()
    expect(correctFixedDeclaration('left', 'auto/**/')).toBeNull()
  })

  it('does not put CSS-wide keywords into an invalid calc expression', () => {
    for (const keyword of ['inherit', 'initial', 'unset', 'revert', 'revert-layer']) {
      expect(correctFixedDeclaration('left', keyword), keyword).toBeNull()
      expect(correctFixedDeclaration('inset-inline-end', `${keyword}/**/`), keyword).toBeNull()
    }
  })

  it('ignores the block axis, which the column does not constrain', () => {
    expect(correctFixedDeclaration('top', '0')).toBeNull()
    expect(correctFixedDeclaration('bottom', '0')).toBeNull()
  })

  it('caps a viewport-wide width at the column', () => {
    expect(correctFixedDeclaration('width', '100%')).toBe('min(100%, var(--adaptive-root-width))')
    expect(correctFixedDeclaration('width', '100.0%')).toBe('min(100%, var(--adaptive-root-width))')
    expect(correctFixedDeclaration('width', '1e2%')).toBe('min(100%, var(--adaptive-root-width))')
  })

  it('leaves an explicit width alone', () => {
    expect(correctFixedDeclaration('width', '200px')).toBeNull()
    expect(correctFixedDeclaration('width', '100.01%')).toBeNull()
  })

  it('is idempotent, so a second pass cannot stack gutters', () => {
    const once = correctFixedDeclaration('left', '0')!
    expect(correctFixedDeclaration('left', once)).toBeNull()
  })

  it('recognises only the fixed keyword', () => {
    expect(isFixedPositionValue(' Fixed ')).toBe(true)
    expect(isFixedPositionValue('fixed/**/')).toBe(true)
    expect(isFixedPositionValue('/**/ FIXED /**/')).toBe(true)
    expect(isFixedPositionValue('sticky')).toBe(false)
    expect(isFixedPositionValue('fixed /* open')).toBe(false)
  })
})

describe('fixed containing block', () => {
  it('offsets a fixed bar into the column', async () => {
    const css = await run('.bar { position: fixed; left: 0; right: 0; bottom: 0 }')
    expect(css).toContain('left: var(--adaptive-root-gutter)')
    expect(css).toContain('right: var(--adaptive-root-gutter)')
    expect(css).toContain('bottom: 0')
  })

  it('publishes a gutter that collapses until a profile constrains the root', async () => {
    const css = await run('.bar { position: fixed; left: 0 }')
    expect(css).toContain('--adaptive-root-width: 100vw;')
    expect(css).toContain(
      '--adaptive-root-gutter: max(0px, (100vw - var(--adaptive-root-width)) / 2);',
    )
    expect(css).toContain('--adaptive-root-width: 600px;')
  })

  it('composes with unit conversion instead of replacing it', async () => {
    const css = await run('.bar { position: fixed; left: 20px }')
    expect(css).toContain(
      'left: calc(clamp(17.06667px, 5.33333vw, 25.6px) + var(--adaptive-root-gutter))',
    )
  })

  it('leaves rules that are not fixed untouched', async () => {
    const css = await run('.bar { position: absolute; left: 0 }')
    expect(css).toContain('left: 0')
    expect(css).not.toContain('--adaptive-root-gutter)')
  })

  it('preserves CSS-wide insets on a fixed rule instead of emitting invalid calc()', async () => {
    const css = await run(
      '.bar { position: fixed/**/; left: inherit; right: revert-layer; inset-inline-start: unset }',
    )
    expect(css).toContain('left: inherit')
    expect(css).toContain('right: revert-layer')
    expect(css).toContain('inset-inline-start: unset')
    expect(css).not.toContain('calc(inherit')
    expect(css).not.toContain('calc(revert-layer')
    expect(css).not.toContain('calc(unset')
  })

  it('uses the winning position declaration instead of any earlier fixed fallback', async () => {
    const overridden = await run('.bar { position: fixed; position: static; left: 0 }')
    expect(overridden).toContain('left: 0')
    expect(overridden).not.toContain('left: var(--adaptive-root-gutter)')

    const winning = await run('.bar { position: static; position: fixed; left: 0 }')
    expect(winning).toContain('left: var(--adaptive-root-gutter)')
  })

  it('honours declaration importance when resolving the effective position', async () => {
    const importantFixed = await run(
      '.bar { position: fixed !important; position: absolute; left: 0 }',
    )
    expect(importantFixed).toContain('left: var(--adaptive-root-gutter)')

    const importantStatic = await run(
      '.bar { position: fixed; position: static !important; left: 0 }',
    )
    expect(importantStatic).toContain('left: 0')
    expect(importantStatic).not.toContain('left: var(--adaptive-root-gutter)')

    const laterImportant = await run(
      '.bar { position: fixed !important; position: absolute !important; left: 0 }',
    )
    expect(laterImportant).toContain('left: 0')
    expect(laterImportant).not.toContain('left: var(--adaptive-root-gutter)')
  })

  it('stays off unless asked for', async () => {
    const css = await run('.bar { position: fixed; left: 0 }', {
      ...CONFIG,
      root: { selector: '#app', safeAreaVariables: false, fixedContainingBlock: false },
    })
    expect(css).toContain('left: 0')
  })

  it('is on by default in the preset that creates the column', async () => {
    const css = await run(
      '.bar { position: fixed; left: 0 }',
      appPcPreset({ rootSelector: '#app' }),
    )
    expect(css).toContain('left: var(--adaptive-root-gutter)')
  })

  it('can still be turned off there', async () => {
    const css = await run(
      '.bar { position: fixed; left: 0 }',
      appPcPreset({ rootSelector: '#app', fixedContainingBlock: false }),
    )
    expect(css).toContain('left: 0')
  })

  it('honours the rule-level ignore comment', async () => {
    const css = await run('/* adaptive-ignore-rule */\n.bar { position: fixed; left: 0 }')
    expect(css).toContain('left: 0')
  })
})
