import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { optionsSchema } from '../docs/.vitepress/schema.js'

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
    expect(schema['x-description-zh']).toContain('x-description-zh')
    // Only the canvas measurement is irreducible. Bounds are optional: no
    // bounds means a viewport expression, and either side can stand alone.
    const profile = options.profiles!.additionalProperties as Subschema
    expect(profile.required).toEqual(['designWidth'])
    expect(profile.properties!.fluid!.required).toBeUndefined()
    const rootObject = (options.root!.oneOf as Subschema[])[0]!
    expect(rootObject.required).toBeUndefined()
    expect(rootObject.properties!.selector!.default).toBe(':root')
    expect(options.root!.oneOf).toEqual(expect.arrayContaining([{ const: true }, { const: false }]))
    const route = options.routes!.items as Subschema
    expect(route.required).toEqual(['profile'])
    expect(route.anyOf).toEqual([
      { required: ['file'] },
      { required: ['selector'] },
      { required: ['property'] },
      { required: ['media'] },
    ])
    const libraryArray = (options.libraries!.oneOf as Subschema[])[2]!
    const libraryObject = ((libraryArray.items as Subschema).oneOf as Subschema[])[1]!
    expect(libraryObject.anyOf).toEqual([
      { required: ['extends'] },
      { required: ['name', 'designWidth'] },
    ])
    expect(libraryObject.properties!.extends!.enum).toEqual(expect.arrayContaining(['vant']))
    expect(((libraryArray.items as Subschema).oneOf as Subschema[])[0]!.enum).toEqual(
      expect.arrayContaining(['vant', 'element-plus']),
    )
    const query = (profile.properties!.query!.oneOf as Subschema[])[1]!
    expect(query.required).toEqual(['condition'])
    expect(query.additionalProperties).toBe(false)
    expect(query.properties!.name!.pattern).toBeTypeOf('string')
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
    expect(options.propList!.oneOf).toEqual(expect.arrayContaining([{ type: 'string' }]))
  })
})
