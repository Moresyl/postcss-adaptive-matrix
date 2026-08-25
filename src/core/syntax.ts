/**
 * CSS `<number>` grammar shared by length conversion and media parsing.
 *
 * A decimal point must have digits after it; `10.` is tokenised as a number
 * followed by a delimiter, not as one CSS number. Scientific notation is part
 * of the grammar and is emitted by minifiers and generated stylesheets.
 */
export const CSS_NUMBER_SOURCE = String.raw`[+-]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?`

/** Unescaped CSS identifier accepted by configuration-generated syntax. */
export const CSS_IDENTIFIER_SOURCE = String.raw`(?:--|-[A-Za-z_\u0080-\uFFFF]|[A-Za-z_\u0080-\uFFFF])[-A-Za-z0-9_\u0080-\uFFFF]*`

const CSS_IDENTIFIER = new RegExp(`^${CSS_IDENTIFIER_SOURCE}$`)
const CSS_WIDE_OR_RESERVED = [
  'default',
  'initial',
  'inherit',
  'none',
  'revert',
  'revert-layer',
  'unset',
] as const

function asciiInsensitive(value: string): string {
  return value.replace(/[a-z]/g, (letter) => `[${letter}${letter.toUpperCase()}]`)
}

export const CSS_CUSTOM_IDENTIFIER_SOURCE = `(?!(?:${CSS_WIDE_OR_RESERVED.map(asciiInsensitive).join('|')})$)${CSS_IDENTIFIER_SOURCE}`

const CSS_CUSTOM_IDENTIFIER = new RegExp(`^${CSS_CUSTOM_IDENTIFIER_SOURCE}$`)

export function isCssIdentifier(value: string): boolean {
  return CSS_IDENTIFIER.test(value)
}

export function isCssCustomIdentifier(value: string): boolean {
  return CSS_CUSTOM_IDENTIFIER.test(value)
}

/** A layer block takes one dot-separated layer name, not a comma-separated declaration list. */
export function isCssLayerName(value: string): boolean {
  return value.split('.').every((part) => isCssIdentifier(part))
}

/**
 * Reports structural syntax that can escape or swallow a generated at-rule.
 *
 * This deliberately does not try to parse the evolving media/container-query
 * grammar. It only owns the boundary that the compiler creates around a user
 * condition: quotes, comments and CSS simple blocks must close; a top-level
 * semicolon or brace must not end that boundary early. Escapes and nested
 * component values remain available to newer query syntax.
 */
export function queryConditionStructureIssue(value: string): string | null {
  const blocks: string[] = []
  let quote: "'" | '"' | null = null
  let comment = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!
    const next = value[index + 1]

    if (comment) {
      if (character === '*' && next === '/') {
        comment = false
        index += 1
      }
      continue
    }

    if (quote) {
      if (character === '\\') {
        index += 1
      } else if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '/' && next === '*') {
      comment = true
      index += 1
      continue
    }
    if (character === '\\') {
      index += 1
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }

    if (character === '(' || character === '[' || character === '{') {
      if (character === '{' && blocks.length === 0) {
        return 'contains a top-level "{"'
      }
      blocks.push(character)
      continue
    }

    if (character === ')' || character === ']' || character === '}') {
      const expected = character === ')' ? '(' : character === ']' ? '[' : '{'
      if (blocks.at(-1) !== expected) return `has an unmatched "${character}"`
      blocks.pop()
      continue
    }

    if (character === ';' && blocks.length === 0) {
      return 'contains a top-level ";"'
    }
  }

  if (quote) return `has an unterminated ${quote} string`
  if (comment) return 'has an unterminated comment'
  if (blocks.length > 0) return `has an unclosed "${blocks.at(-1)}"`
  return null
}
