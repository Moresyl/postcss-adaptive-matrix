import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { evaluateLength } from '../src/core/evaluate.js'
import { adaptiveMatrix } from '../src/postcss/plugin.js'

/**
 * Properties that must hold for every canvas, not just the ones with fixtures.
 *
 * The conformance suite pins chosen inputs to chosen outputs, which is what
 * makes it readable — and also what bounds it: it can only speak about the
 * design widths someone thought to write down. These cases instead state the
 * promises the compiler makes and check them against a few hundred generated
 * canvases, using `evaluateLength` as the oracle. A regression in the maths
 * shows up here even at a design width nobody chose.
 *
 * The generator is a seeded LCG so a failure is reproducible and CI does not
 * flake.
 */
const CONTEXT = { height: 800, rootFontSize: 16 }
const TOLERANCE = 0.02

function generator(seed: number): <T>(choices: readonly T[]) => T {
  let state = seed
  return <T,>(choices: readonly T[]): T => {
    state = (state * 1103515245 + 12345) % 2147483648
    return choices[Math.floor((state / 2147483648) * choices.length)]!
  }
}

async function compile(
  css: string,
  profile: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const plugin = adaptiveMatrix({
    defaultProfile: 'x',
    profiles: { x: profile } as never,
    libraries: false,
    ...extra,
  })
  const result = await postcss([plugin]).process(css, { from: 'a.css' })
  return result.css
}

/** The compiled value of the single declaration, or null when it was left alone. */
function converted(css: string): string | null {
  const value = /\.a \{ [\w-]+: (.*) \}/.exec(css)?.[1]
  if (!value) return null
  return value.includes('clamp') || value.includes('vw') || value.includes('vi')
    ? value
    : null
}

const DESIGN_WIDTHS = [320, 375, 414, 750, 828, 1024, 1440, 1920, 2560]
const MIN_WIDTHS = [280, 320, 360, 768, 1024]
const SPANS = [120, 200, 480, 896, 1536]
const VALUES = [1, 2, 4, 12, 16, 20, 32, 48, 100, 187.5, 375]
const PROPERTIES = ['width', 'font-size', 'margin-top', 'letter-spacing', 'border-radius']

interface Generated {
  designWidth: number
  minWidth: number
  maxWidth: number
  value: number
  property: string
  compiled: string
  label: string
}

/** Compiles `count` generated canvases, dropping the ones left as authored. */
async function sample(seed: number, count: number): Promise<Generated[]> {
  const pick = generator(seed)
  const rows: Generated[] = []
  for (let index = 0; index < count; index += 1) {
    const designWidth = pick(DESIGN_WIDTHS)
    const minWidth = pick(MIN_WIDTHS)
    const maxWidth = minWidth + pick(SPANS)
    const value = pick(VALUES)
    const property = pick(PROPERTIES)
    const profile = { designWidth, fluid: { minWidth, maxWidth } }
    const compiled = converted(await compile(`.a { ${property}: ${value}px }`, profile))
    // Hairlines and sub-`minPixelValue` lengths are meant to survive untouched.
    if (!compiled) continue
    rows.push({
      designWidth,
      minWidth,
      maxWidth,
      value,
      property,
      compiled,
      label:
        `${property}: ${value}px on designWidth ${designWidth}, ` +
        `fluid ${minWidth}-${maxWidth} → ${compiled}`,
    })
  }
  expect(rows.length).toBeGreaterThan(100)
  return rows
}

describe('properties that hold for every canvas', () => {
  it('renders an authored pixel as that same pixel at the design width', async () => {
    // The whole premise: measure 16px in the design file, write 16px, and at the
    // width that design file was drawn for the browser lays out 16px. Everything
    // else the compiler does is a way of choosing what happens either side.
    for (const row of await sample(12345, 400)) {
      if (row.designWidth < row.minWidth || row.designWidth > row.maxWidth) continue
      const actual = evaluateLength(row.compiled, { ...CONTEXT, width: row.designWidth })
      expect(actual, row.label).not.toBeNull()
      expect(Math.abs(actual! - row.value), row.label).toBeLessThan(TOLERANCE)
    }
  })

  it('never gets smaller as the viewport gets wider', async () => {
    // The breakpoint-continuity check is only complete because of this: if no
    // single formula can shrink, a shrinking length must come from crossing
    // into a canvas that disagrees. That reasoning is worth checking rather
    // than assuming.
    for (const row of await sample(2024, 250)) {
      let previous = Number.NEGATIVE_INFINITY
      for (let width = 200; width <= 3000; width += 25) {
        const actual = evaluateLength(row.compiled, { ...CONTEXT, width })
        expect(actual, `${row.label} at ${width}px`).not.toBeNull()
        expect(actual!, `${row.label} at ${width}px`).toBeGreaterThanOrEqual(
          previous - 0.001,
        )
        previous = actual!
      }
    }
  })

  it('holds flat below the fluid window instead of running to nothing', async () => {
    for (const row of await sample(777, 250)) {
      const atFloor = evaluateLength(row.compiled, { ...CONTEXT, width: row.minWidth })
      const wellBelow = evaluateLength(row.compiled, {
        ...CONTEXT,
        width: Math.max(1, row.minWidth - 100),
      })
      expect(Math.abs(atFloor! - wellBelow!), row.label).toBeLessThan(TOLERANCE)
    }
  })

  it('scales a plain length exactly linearly inside the fluid window', async () => {
    for (const row of await sample(4242, 300)) {
      // Text uses the `rem + vw` hybrid so that browser zoom still moves it;
      // that curve is deliberately not the plain linear one.
      if (row.property === 'font-size' || row.property === 'letter-spacing') continue
      if (row.designWidth < row.minWidth || row.designWidth > row.maxWidth) continue
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const width = row.minWidth + (row.maxWidth - row.minWidth) * fraction
        const actual = evaluateLength(row.compiled, { ...CONTEXT, width })
        const expected = (row.value * width) / row.designWidth
        expect(Math.abs(actual! - expected), `${row.label} at ${width}px`).toBeLessThan(
          TOLERANCE,
        )
      }
    }
  })

  it('changes nothing when its own output is compiled again', async () => {
    const pick = generator(31337)
    for (let index = 0; index < 200; index += 1) {
      const designWidth = pick(DESIGN_WIDTHS)
      const minWidth = pick(MIN_WIDTHS)
      const profile = {
        designWidth,
        fluid: { minWidth, maxWidth: minWidth + pick(SPANS) },
      }
      const source = `.a { ${pick(PROPERTIES)}: ${pick(VALUES)}px }`
      const once = await compile(source, profile)
      expect(await compile(once, profile), source).toBe(once)
    }
  })

  it('keeps the design-width identity under every strategy and unit', async () => {
    const pick = generator(8080)
    for (let index = 0; index < 150; index += 1) {
      const designWidth = pick(DESIGN_WIDTHS)
      const minWidth = pick(MIN_WIDTHS)
      const maxWidth = minWidth + pick(SPANS)
      if (designWidth < minWidth || designWidth > maxWidth) continue
      const value = pick(VALUES)
      const property = pick(PROPERTIES)
      const profile = { designWidth, fluid: { minWidth, maxWidth } }

      for (const extra of [{ strategy: 'viewport' }, { unit: 'vi' }]) {
        const compiled = converted(
          await compile(`.a { ${property}: ${value}px }`, profile, extra),
        )
        if (!compiled) continue
        // `vi` is `vw` in a horizontal writing mode, which is what the evaluator
        // assumes; swapping lets one oracle serve both.
        const actual = evaluateLength(compiled.replaceAll('vi', 'vw'), {
          ...CONTEXT,
          width: designWidth,
        })
        if (actual === null) continue
        const label = `${JSON.stringify(extra)} ${property}: ${value}px on ${designWidth} → ${compiled}`
        expect(Math.abs(actual - value), label).toBeLessThan(TOLERANCE)
      }
    }
  })
})
