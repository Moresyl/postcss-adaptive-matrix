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
