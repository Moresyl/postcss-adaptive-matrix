import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import adaptiveMatrix from '../src/index.js'
import { optionsSchema } from '../docs/.vitepress/schema.js'
import { resolveOptions } from '../src/core/options.js'

/**
 * The published schema, checked against the compiler and against the prose.
 *
 * `tsc` already guarantees the schema describes exactly the options that exist,
 * because its property tables are typed over the real interfaces. What it
 * cannot check is the part a reader relies on most: that the default written in
 * the configuration reference is the default the compiler actually applies.
 * Three sources — the code, the schema and the two reference tables — agree
 * here or the suite fails.
 */
const root = new URL('../', import.meta.url)

interface Subschema {
  description?: string
  'x-description-zh'?: string
  default?: unknown
  properties?: Record<string, Subschema>
  [keyword: string]: unknown
}

const schema = JSON.parse(optionsSchema('https://example.test/')) as Subschema
// `$schema` is a key a JSON config file carries so an editor can complete it;
// it is not an option, and the configuration reference is right not to list it.
const options = Object.fromEntries(
  Object.entries(schema.properties!).filter(([name]) => !name.startsWith('$')),
)

/** Every described subschema, however deeply nested, with a path to name it. */
function described(node: unknown, path: string): [string, Subschema][] {
  if (!node || typeof node !== 'object') return []
  const found: [string, Subschema][] = []
  const subschema = node as Subschema
  if (typeof subschema.description === 'string') found.push([path, subschema])
  for (const [key, value] of Object.entries(subschema)) {
    if (key === 'default' || key === 'examples' || key === 'const' || key === 'enum') continue
    if (Array.isArray(value)) {
      value.forEach((item, index) => found.push(...described(item, `${path}.${key}[${index}]`)))
    } else if (value && typeof value === 'object') {
      found.push(...described(value, `${path}.${key}`))
    }
  }
  return found
}

/**
 * The rows of the top-level options table, as name and default-cell pairs.
 *
 * The section is cut at the first `###` as well as at the next `##`: the
 * subsections under it document individual options and carry tables of their
 * own, whose first column holds values rather than option names.
 */
function optionRows(file: string): [string, string][] {
  const text = readFileSync(new URL(file, root), 'utf8')
  const section = text.split(/^## /m).find((part) => /^(Top-level options|顶层配置)/.test(part))
  expect(section, `${file} has no top-level options table`).toBeTypeOf('string')

  const rows: [string, string][] = []
  for (const line of section!.split(/^### /m)[0]!.split(/\r?\n/)) {
    const cells = line.split('|').slice(1, -1)
    if (cells.length < 3 || !cells[0]!.includes('`')) continue
    for (const match of cells[0]!.matchAll(/`([A-Za-z][A-Za-z0-9]*)`/g)) {
      rows.push([match[1]!, cells[1]!.trim()])
    }
  }
  return rows
}

/**
 * The default column, by option name, for the rows that spell a value.
 *
 * Only whole-cell code spans count. `App/PC preset` and `font-related
 * properties` describe a default rather than spelling one, and reading them as
 * literals would compare prose against a value.
 */
function documentedDefaults(file: string): Map<string, unknown> {
  const defaults = new Map<string, unknown>()
  for (const [name, cell] of optionRows(file)) {
    const literal = /^`([^`]+)`$/.exec(cell)
    if (!literal) continue
    let value: unknown
    try {
      // `'auto'` and `['*']` are JavaScript as a reader would write them.
      value = JSON.parse(literal[1]!.replace(/'/g, '"'))
    } catch {
      // A bare word in the table, such as `warn`, means the string.
      value = literal[1]
    }
    defaults.set(name, value)
  }
  return defaults
}

const REFERENCES = ['docs/configuration.md', 'docs/configuration.zh-CN.md']

describe('the published options schema', () => {
  it.each(REFERENCES)('compiles the minimal configuration examples in %s', async (file) => {
    const text = readFileSync(new URL(file, root), 'utf8')
    const examples = [...text.matchAll(/`(adaptiveMatrix\([^`]*\))`/g)].map((match) => match[1]!)
    const unique = [...new Set(examples)]
    expect(unique).toHaveLength(4)
    const widths: string[] = []
    for (const example of unique) {
      // Evaluate only this checkout's documented calls, never downloaded content.
      // Construct options in this realm so plain-object validation remains real.
      let plugin: ReturnType<typeof adaptiveMatrix> | undefined
      runInNewContext(
        example,
        {
          adaptiveMatrix: (options: unknown) => {
            plugin = adaptiveMatrix(
              options === undefined ? undefined : JSON.parse(JSON.stringify(options)),
            )
          },
        },
        { timeout: 1000 },
      )
      expect(plugin).toBeDefined()
      const result = await postcss([plugin!]).process('.card { width: 24px }', { from: undefined })
      expect(result.warnings()).toEqual([])
      const repeated = await postcss([plugin!]).process(result.css, { from: undefined })
      expect(repeated.css).toBe(result.css)
      result.root.walkDecls('width', (declaration) => {
        if (declaration.parent?.type === 'rule' && declaration.parent.selector === '.card') {
          widths.push(declaration.value)
        }
      })
    }
    expect(widths).toEqual([
      'clamp(20.48px, 6.4vw, 30.72px)',
      'calc(6.4vw)',
      'min(6.4vw, 38.4px)',
      'max(6.4vw, 20.48px)',
    ])
  })

  it('offers independently optional fluid-bound examples without inventing defaults', () => {
    const profile = ((options.profiles!.additionalProperties as Subschema).oneOf as Subschema[])[1]!
    const fluid = profile.properties!.fluid!
    const examples = fluid.examples as Array<{ minWidth?: number; maxWidth?: number }>
    expect(examples).toEqual([
      {},
      { minWidth: 320 },
      { maxWidth: 600 },
      { minWidth: 320, maxWidth: 600 },
    ])
    for (const example of examples) {
      const resolved = resolveOptions({ profiles: { app: { designWidth: 375, fluid: example } } })
      expect(resolved.profiles.app!.fluid).toEqual(example)
    }
    for (const name of ['minWidth', 'maxWidth']) {
      expect(fluid.properties![name]!.default).toBeUndefined()
      expect(fluid.properties![name]!.description).toContain('Optional')
      expect(fluid.properties![name]!['x-description-zh']).toContain('可选')
    }
  })

  it('rejects blank query conditions without requiring an optional query', () => {
    const profile = ((options.profiles!.additionalProperties as Subschema).oneOf as Subschema[])[1]!
    const variants = profile.properties!.query!.oneOf as Subschema[]
    const patterns = [variants[0]!.pattern, variants[1]!.properties!.condition!.pattern]
    for (const condition of ['', ' ', '\t\r\n', '\u00a0', '(width > 1px)', ' \n(width > 1px) ']) {
      const valid = condition.trim().length > 0
      for (const pattern of patterns) {
        expect(new RegExp(pattern as string).test(condition)).toBe(valid)
      }
      for (const query of [condition, { condition }]) {
        const resolve = () => resolveOptions({ profiles: { app: { designWidth: 375, query } } })
        if (valid) expect(resolve).not.toThrow()
        else expect(resolve).toThrow(/empty string/)
      }
    }
    expect(
      resolveOptions({ profiles: { app: { designWidth: 375 } } }).profiles.app!.query,
    ).toBeUndefined()
    expect(
      resolveOptions({ profiles: { app: { designWidth: 375, query: false } } }).profiles.app!.query,
    ).toBe(false)
  })

  it('describes every option in both languages, at every depth', () => {
    const entries = described(schema, '$')

    expect(entries.length).toBeGreaterThan(50)
    for (const [path, subschema] of entries) {
      expect(subschema['x-description-zh'], `${path} has no Chinese description`).toBeTypeOf(
        'string',
      )
      expect(subschema.description!.length, `${path} description is empty`).toBeGreaterThan(0)
      expect((subschema['x-description-zh'] as string).length).toBeGreaterThan(0)
    }
  })

  it('names the same options the configuration reference does', () => {
    for (const file of REFERENCES) {
      const documented = optionRows(file).map(([name]) => name)

      // Both directions: an option missing from the table is undiscoverable,
      // and one listed in the table but gone from the code is a lie in print.
      expect(`${file}\n${documented.sort().join('\n')}`).toBe(
        `${file}\n${Object.keys(options).sort().join('\n')}`,
      )
    }
  })

  it('publishes the defaults the compiler applies, and the ones the docs promise', () => {
    for (const file of REFERENCES) {
      const documented = documentedDefaults(file)

      // Enough of the table has a literal default that a silent regression
      // cannot hide in the part that does not.
      expect(documented.size, `${file} yielded too few literal defaults`).toBeGreaterThanOrEqual(18)
      for (const [name, value] of documented) {
        expect(
          options[name]?.default,
          `${file} documents ${name} as ${JSON.stringify(value)}`,
        ).toEqual(value)
      }
    }
  })

  it('is a self-describing document an agent can resolve', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.$id).toBe('https://example.test/schema/options.json')
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toBeUndefined()
    expect(schema['x-description-zh']).toContain('x-description-zh')
    // Only the canvas measurement is irreducible. Bounds are optional: no
    // bounds means a viewport expression, and either side can stand alone.
    const profileInput = options.profiles!.additionalProperties as Subschema
    const profile = (profileInput.oneOf as Subschema[])[1]!
    expect(profileInput.oneOf).toEqual(
      expect.arrayContaining([{ type: 'number', exclusiveMinimum: 0 }]),
    )
    expect(options.profiles!.minProperties).toBeUndefined()
    expect((options.profiles!.propertyNames as Subschema).pattern).toBeTypeOf('string')
    expect(profile.required).toEqual(['designWidth'])
    expect(profile.properties!.fluid!.required).toBeUndefined()
    expect(profile.properties!.fluid!.description).toContain('viewport strategy ignores')
    expect(profile.properties!.fluid!['x-description-zh']).toContain('viewport 策略忽略')
    const rootObject = (options.root!.oneOf as Subschema[])[0]!
    expect(rootObject.required).toBeUndefined()
    expect(rootObject.properties!.selector!.default).toBe(':root')
    expect(rootObject.not).toEqual({
      required: ['containerName', 'container'],
      properties: { container: { const: false } },
    })
    expect(options.root!.oneOf).toEqual(expect.arrayContaining([{ const: true }, { const: false }]))
    const route = (options.routes!.oneOf as Subschema[])[0]!
    expect(route.required).toEqual(['profile'])
    expect((route.properties!.profile!.oneOf as Subschema[])[0]!.pattern).toBeTypeOf('string')
    expect(route.anyOf).toEqual([
      { required: ['file'] },
      { required: ['selector'] },
      { required: ['property'] },
      { required: ['media'] },
    ])
    for (const field of ['file', 'selector', 'property', 'media']) {
      expect((route.properties![field]!.oneOf as Subschema[])[1]!.minItems).toBe(1)
    }
    expect((route.properties!.property!.oneOf as Subschema[])[0]!.pattern).toBeTypeOf('string')
    const libraryArray = (options.libraries!.oneOf as Subschema[])[2]!
    const libraryObject = ((libraryArray.items as Subschema).oneOf as Subschema[])[1]!
    expect(libraryObject.anyOf).toEqual([
      { required: ['extends'] },
      { required: ['name', 'designWidth'] },
    ])
    for (const field of ['prefix', 'tokenPrefix', 'file']) {
      expect((libraryObject.properties![field]!.oneOf as Subschema[])[1]!.minItems).toBe(1)
    }
    expect(libraryObject.not).toEqual(
      expect.objectContaining({
        anyOf: expect.arrayContaining([
          {
            required: ['designWidth', 'basedOn'],
            properties: { designWidth: { const: false } },
          },
        ]),
      }),
    )
    expect(libraryObject.allOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          then: expect.objectContaining({
            anyOf: expect.arrayContaining([
              {
                required: ['prefix'],
                properties: { prefix: { not: { type: 'array', maxItems: 0 } } },
              },
            ]),
          }),
        }),
      ]),
    )
    expect(libraryObject.properties!.extends!.enum).toEqual(expect.arrayContaining(['vant']))
    expect(((libraryArray.items as Subschema).oneOf as Subschema[])[0]!.enum).toEqual(
      expect.arrayContaining(['vant', 'element-plus']),
    )
    const query = (profile.properties!.query!.oneOf as Subschema[])[1]!
    expect(query.required).toEqual(['condition'])
    expect(query.additionalProperties).toBe(false)
    expect(query.properties!.name!.pattern).toBeTypeOf('string')
    expect(query.allOf).toEqual([
      {
        if: { required: ['name'] },
        then: { properties: { type: { const: 'container' } } },
      },
    ])
    expect(options.unitToConvert!.oneOf).toEqual(
      expect.arrayContaining([expect.objectContaining({ pattern: expect.any(String) })]),
    )
    expect(options.minPixelValue!.description).toContain('below')
    expect(options.minPixelValue!['x-description-zh']).toContain('小于')
    expect(options.minPixelValue!['x-description-zh']).not.toContain('等于')
    expect(options.rootValue!['x-also']).toBe('(context: { file: string }) => number')
    for (const field of ['textProperties', 'selectorExclude', 'valueExclude']) {
      expect(options[field]!.oneOf).toEqual(expect.arrayContaining([expect.any(Object)]))
    }
    for (const field of ['include', 'exclude']) {
      expect((options[field]!.oneOf as Subschema[])[1]!.minItems).toBe(1)
    }
    for (const field of [
      'include',
      'exclude',
      'selectorExclude',
      'valueExclude',
      'propList',
      'textProperties',
    ]) {
      const alternatives = options[field]!.oneOf as Subschema[]
      const expression = new RegExp(alternatives[0]!.pattern as string)
      for (const blank of ['', ' ', '\t\r\n', '\u00a0']) {
        expect(expression.test(blank), `${field} must reject blank strings`).toBe(false)
        expect(() => resolveOptions({ [field]: blank })).toThrow()
      }
      expect(expression.test(' src/ ')).toBe(true)
      expect((alternatives[1]!.items as Subschema).pattern).toBe(alternatives[0]!.pattern)
    }
    expect(
      ((options.root!.oneOf as Subschema[])[0]!.properties!.injectTo!.oneOf as Subschema[])[1]!
        .minItems,
    ).toBe(1)
    expect(options.propList!.oneOf).toEqual(
      expect.arrayContaining([{ type: 'string', pattern: String.raw`\S` }]),
    )
    expect((options.textProperties!.oneOf as Subschema[])[1]!.minItems).toBeUndefined()
    expect(resolveOptions({ textProperties: [] }).textProperties).toEqual([])
    expect(() => resolveOptions({ propList: [] })).toThrow('propList cannot be empty')
  })
})
