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

/** The five code points CSS Syntax defines as whitespace. */
export function isCssWhitespace(character: string): boolean {
  return /[ \t\r\n\f]/.test(character)
}

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

/** Decodes CSS identifier escapes without changing case. */
export function decodeCssIdentifier(value: string): string {
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!
    if (character !== '\\') {
      output += character
      continue
    }

    let cursor = index + 1
    let hex = ''
    while (cursor < value.length && hex.length < 6 && /[0-9a-f]/i.test(value[cursor]!)) {
      hex += value[cursor]!
      cursor += 1
    }
    if (hex) {
      const codePoint = Number.parseInt(hex, 16)
      output +=
        codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? '\uFFFD'
          : String.fromCodePoint(codePoint)
      if (isCssWhitespace(value[cursor] ?? '')) {
        if (value[cursor] === '\r' && value[cursor + 1] === '\n') cursor += 1
        cursor += 1
      }
      index = cursor - 1
    } else if (cursor < value.length) {
      output += value[cursor]!
      index = cursor
    }
  }
  return output
}

/**
 * Canonical property identity: standard properties fold ASCII case, custom
 * properties preserve it. Escapes are spelling in both cases, not identity.
 */
export function canonicalCssPropertyName(value: string): string {
  const decoded = decodeCssIdentifier(value)
  return decoded.startsWith('--') || !/[A-Z]/.test(decoded)
    ? decoded
    : decoded.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
}

/** Canonical identity for an ASCII-case-insensitive CSS identifier. */
export function canonicalCssIdentifierName(value: string): string {
  return decodeCssIdentifier(value).replace(/[A-Z]/g, (letter) => letter.toLowerCase())
}

/**
 * Decodes identifier escapes while refusing to manufacture CSS structure.
 * Escaped punctuation is still part of an identifier token, so it becomes an
 * inert non-ASCII identifier character rather than `(`, `:`, `,`, and so on.
 */
export function canonicalizeCssIdentifierEscapes(value: string): {
  text: string
  positions: number[]
} {
  let output = ''
  const positions: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\\') {
      output += value[index]
      positions.push(index)
      continue
    }

    let end = index + 1
    let digits = 0
    while (end < value.length && digits < 6 && /[0-9a-f]/i.test(value[end]!)) {
      digits += 1
      end += 1
    }
    if (digits && isCssWhitespace(value[end] ?? '')) {
      if (value[end] === '\r' && value[end + 1] === '\n') end += 1
      end += 1
    } else if (!digits && end < value.length) {
      end += 1
    }
    if (end === index + 1) {
      output += '\\'
      positions.push(index)
      continue
    }

    const decoded = decodeCssIdentifier(value.slice(index, end))
    const point = decoded.codePointAt(0)
    const oneCodePoint = point !== undefined && decoded.length === (point > 0xffff ? 2 : 1)
    const safe =
      point !== undefined && oneCodePoint && (point >= 0x80 || /^[-_a-z0-9]$/i.test(decoded))
        ? decoded
        : '\uFFFD'
    output += safe
    // `String.fromCodePoint()` may produce two UTF-16 code units for an
    // astral escape. Keep one source position per output unit so consumers
    // slicing a canonical match never drift after such an identifier.
    for (let offset = 0; offset < safe.length; offset += 1) positions.push(index)
    index = end - 1
  }
  return { text: output, positions }
}

/**
 * Reports structural syntax that can escape or swallow a generated wrapper.
 *
 * This deliberately does not try to parse the evolving media/container-query
 * grammar. It only owns the boundary that the compiler creates around user
 * text: quotes, comments, parentheses and brackets must close; an unescaped
 * rule brace or top-level semicolon must not end that boundary early. Escaped
 * characters and nested component values remain available to newer syntax.
 */
export function cssComponentValueStructureIssue(value: string): string | null {
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

    if (character === '{') return 'contains a "{"'
    if (character === '(' || character === '[') {
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
