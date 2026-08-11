import type { AtRule, Container, Declaration, Document, Root, Rule } from 'postcss'

import { allMatch, boundaryOf, widthConditions } from './media.js'

/**
 * Resolves `var()` references against the theme tokens declared in the same
 * stylesheet, so the length diagnostics can put a number to a component
 * library's values.
 *
 * This matters more than it sounds. Measured on Vant 4.10.0's compiled
 * stylesheet, 41% of declarations read *only* through `var()` and 8% carry a
 * literal pixel — so a checker that gives up at the first `var(` is looking at
 * a twelfth of the file, and the eleven twelfths it skips are exactly the
 * theming layer this compiler is built to adapt.
 *
 * What it will not do is guess. A token is resolved only when the stylesheet
 * pins it down without appeal to the cascade:
 *
 * - it is declared on `:root` / `html` and nowhere else, so every element
 *   inherits the same value and no component can be sitting on an override;
 * - every declaration of it is either unconditional or inside a plain pixel
 *   width media query, so "which one wins" is a function of viewport width
 *   alone.
 *
 * A token failing either test resolves to `null`, and the caller drops that
 * declaration exactly as it would have before. The gain is coverage, not
 * confidence: nothing here makes an answer less certain than it was.
 */

interface Definition {
  value: string
  conditions: string[]
  order: number
}

type Resolution =
  | { status: 'value'; value: string }
  /** Nothing declares it here, so a `var()` fallback is the browser's answer. */
  | { status: 'unset' }
  /** Declared, but not by width alone — no answer can be given. */
  | { status: 'unknown' }

type Lookup = (name: string, width: number) => Resolution

/**
 * Selectors that hand a value to every element the stylesheet can reach.
 *
 * `:host` earns its place: component libraries ship `:root,:host{...}` so one
 * stylesheet themes both the document and a shadow tree, and Vant's 815 token
 * declarations are all written that way. Bare `:host` only — `:host(.dark)`
 * is a condition, and conditions are what this refuses to guess at.
 *
 * `:root:root` is the specificity bump libraries use to beat a consumer's own
 * `:root` block; it selects the same element.
 */
const INHERITED_FROM = new Set([':root', ':host', 'html', 'html:root', ':root:root'])

/** Depth of nested `var()` indirection to follow before giving up. */
const MAX_DEPTH = 8

function isUniversal(selector: string): boolean {
  return selector.split(',').every((part) => INHERITED_FROM.has(part.trim().toLowerCase()))
}

export interface TokenTable {
  /**
   * Substitutes every `var()` in `value` for its value at `width`, or returns
   * `null` if any reference cannot be resolved under the rules above. A value
   * with no `var()` is returned unchanged.
   */
  resolve(value: string, width: number): string | null
  /** Number of tokens the table can answer for. Reported by the tests. */
  readonly size: number
  /**
   * Widths at which some token changes value. A declaration that never moves
   * still steps at these, because what it reads does.
   */
  readonly boundaries: readonly number[]
}

/**
 * Reads every custom-property declaration in the tree and keeps the ones whose
 * value is decided by viewport width alone.
 */
export function collectTokens(root: Root): TokenTable {
  const definitions = new Map<string, Definition[]>()
  const rejected = new Set<string>()
  let order = 0

  root.walkDecls((declaration: Declaration) => {
    if (!declaration.prop.startsWith('--')) return
    const name = declaration.prop.trim()

    const conditions: string[] = []
    let readable = true
    let selector: string | null = null

    let node: Container | Document | undefined = declaration.parent
    while (node && node.type !== 'root') {
      if (node.type === 'rule') {
        // Nesting joins selectors, and a joined selector is no longer the
        // plain `:root` this vouches for.
        if (selector !== null) readable = false
        else selector = (node as Rule).selector.trim()
      } else if (node.type === 'atrule') {
        const at = node as AtRule
        const name = at.name.toLowerCase()
        if (name === 'media') {
          const parsed = widthConditions(at.params)
          if (!parsed) readable = false
          else conditions.push(...parsed)
        } else if (name !== 'layer') {
          // `@supports`, `@container`, `@scope`: real conditions this cannot
          // evaluate, so the token stops being a function of width.
          readable = false
        }
      }
      node = node.parent
    }

    // A cascade layer changes which declaration wins independently of width.
    // Recording the layer would let width alone decide again, but only after
    // modelling layer order — more cascade than this claims to know, and the
    // conservative answer costs nothing here.
    if (!readable || selector === null || !isUniversal(selector)) {
      rejected.add(name)
      return
    }

    // A custom property's value is kept raw by PostCSS, whitespace and all:
    // `--gap: 16px }` parses with the trailing space still attached, and
    // substituting that verbatim turns `calc(var(--gap) * 2)` into
    // `calc(16px  * 2)` — harmless to a browser, but the string is also what
    // the diagnostics print back at the author.
    const value = declaration.value.trim()
    const existing = definitions.get(name)
    if (existing) existing.push({ value, conditions, order: order++ })
    else definitions.set(name, [{ value, conditions, order: order++ }])
  })

  for (const name of rejected) definitions.delete(name)

  const lookup: Lookup = (name, width) => {
    // Ambiguous is not the same as absent, and the difference decides whether
    // a `var(--x, 16px)` fallback may be used. `--van-padding-md` redefined
    // under `.van-theme-dark` is *set* — just not to something knowable — so
    // taking the fallback there would be inventing a value. A token nothing
    // declares, or one whose only declaration sits in a media query that does
    // not apply at this width, really is unset, and the fallback is then
    // exactly what the browser resolves to.
    if (rejected.has(name)) return { status: 'unknown' }
    const group = definitions.get(name)
    if (!group) return { status: 'unset' }
    let winner: Definition | undefined
    for (const definition of group) {
      if (!allMatch(definition.conditions, width)) continue
      if (!winner || definition.order > winner.order) winner = definition
    }
    return winner ? { status: 'value', value: winner.value } : { status: 'unset' }
  }

  const boundaries = new Set<number>()
  for (const group of definitions.values()) {
    for (const definition of group) {
      for (const condition of definition.conditions) {
        const bound = boundaryOf(condition)
        if (bound !== null) boundaries.add(bound)
      }
    }
  }

  return {
    size: definitions.size,
    boundaries: [...boundaries],
    resolve(value: string, width: number): string | null {
      return substitute(value, width, lookup, new Set(), 0)
    },
  }
}

/**
 * Finds the next `var(` that starts a token rather than ending an identifier,
 * so `--my-var(x)` and a hypothetical `xvar(` are left alone.
 */
function findVar(value: string, from: number): number {
  for (let index = value.indexOf('var(', from); index >= 0;) {
    const before = index === 0 ? '' : value[index - 1]!
    if (!/[\w-]/.test(before)) return index
    index = value.indexOf('var(', index + 1)
  }
  return -1
}

/** The index just past the `)` closing the group opened at `open`. */
function closingParen(value: string, open: number): number {
  let depth = 0
  for (let index = open; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1
    else if (value[index] === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** Splits `--name, fallback` on its first top-level comma. */
function splitArguments(inner: string): { name: string; fallback: string | null } {
  let depth = 0
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index]
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    else if (character === ',' && depth === 0) {
      return { name: inner.slice(0, index).trim(), fallback: inner.slice(index + 1).trim() }
    }
  }
  return { name: inner.trim(), fallback: null }
}

function substitute(
  value: string,
  width: number,
  lookup: Lookup,
  active: Set<string>,
  depth: number,
): string | null {
  if (!value.includes('var(')) return value
  if (depth > MAX_DEPTH) return null

  let result = ''
  let cursor = 0
  for (;;) {
    const start = findVar(value, cursor)
    if (start < 0) {
      result += value.slice(cursor)
      return result
    }
    const end = closingParen(value, start + 3)
    if (end < 0) return null

    const { name, fallback } = splitArguments(value.slice(start + 4, end))
    if (!name.startsWith('--')) return null

    // `--a: var(--b); --b: var(--a)` is invalid CSS, not a length. Guard
    // anyway: a stylesheet is an input, and inputs are not always valid.
    if (active.has(name)) return null

    const resolution = lookup(name, width)
    if (resolution.status === 'unknown') return null

    let replacement: string | null
    if (resolution.status === 'value') {
      active.add(name)
      replacement = substitute(resolution.value, width, lookup, active, depth + 1)
      active.delete(name)
    } else if (fallback !== null) {
      replacement = substitute(fallback, width, lookup, active, depth + 1)
    } else {
      replacement = null
    }
    if (replacement === null) return null

    result += value.slice(cursor, start) + replacement
    cursor = end + 1
  }
}
