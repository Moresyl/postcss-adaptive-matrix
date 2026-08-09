import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import adaptiveMatrix from '../src/index.js'
import type { AdaptiveMatrixOptions } from '../src/index.js'

const CASES_DIR = fileURLToPath(new URL('../conformance/cases', import.meta.url))
const UPDATE = process.env.UPDATE_CONFORMANCE === '1'

interface CaseFile {
  description: string
  from?: string
  options?: unknown
  warnings?: string[]
}

interface ConformanceCase {
  id: string
  dir: string
  meta: CaseFile
  input: string
  expected: string
}

/** Revives the `{ "$regex": ..., "$flags": ... }` tagged form documented in the suite README. */
function reviveOptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveOptions)
  if (value === null || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  if (typeof record.$regex === 'string') {
    return new RegExp(record.$regex, typeof record.$flags === 'string' ? record.$flags : undefined)
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, reviveOptions(entry)]),
  )
}

function normalise(css: string): string {
  return css.replace(/\r\n/g, '\n').replace(/\n$/, '')
}

function collectCases(): ConformanceCase[] {
  const cases: ConformanceCase[] = []
  for (const group of readdirSync(CASES_DIR, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    const groupDir = join(CASES_DIR, group.name)
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(groupDir, entry.name)
      const expectedPath = join(dir, 'expected.css')
      cases.push({
        id: `${group.name}/${entry.name}`,
        dir,
        meta: JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')) as CaseFile,
        input: readFileSync(join(dir, 'input.css'), 'utf8'),
        expected: existsSync(expectedPath) ? readFileSync(expectedPath, 'utf8') : '',
      })
    }
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id))
}

const cases = collectCases()

describe('conformance suite', () => {
  it('discovers cases', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  for (const testCase of cases) {
    it(`${testCase.id} — ${testCase.meta.description}`, async () => {
      const options = reviveOptions(testCase.meta.options ?? {}) as AdaptiveMatrixOptions
      const result = await postcss([adaptiveMatrix(options)]).process(testCase.input, {
        from: testCase.meta.from ?? '/project/src/app.css',
      })

      if (UPDATE) {
        writeFileSync(join(testCase.dir, 'expected.css'), `${normalise(result.css)}\n`, 'utf8')
      }

      const expectedWarnings = testCase.meta.warnings ?? []
      const actualWarnings = result.warnings().map((warning) => warning.text)
      expect(actualWarnings).toHaveLength(expectedWarnings.length)
      for (const expected of expectedWarnings) {
        expect(actualWarnings.filter((text) => text.includes(expected))).toHaveLength(1)
      }

      if (!UPDATE) {
        expect(normalise(result.css)).toBe(normalise(testCase.expected))
      }

      // Compiling the output again must return it unchanged. Stated once here
      // rather than as its own fixture, because it has to hold for every case:
      // a package that ships pre-compiled CSS goes through the consuming app's
      // pipeline a second time, and so does anything a framework preset
      // registers twice. Nothing about a second pass is announced, so the only
      // way this stays true is to check it everywhere.
      const again = await postcss([adaptiveMatrix(options)]).process(result.css, {
        from: testCase.meta.from ?? '/project/src/app.css',
      })
      expect(normalise(again.css), `${testCase.id} is not idempotent`).toBe(
        normalise(result.css),
      )
    })
  }
})
