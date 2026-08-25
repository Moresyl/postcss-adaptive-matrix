/**
 * A numeric evaluator for the subset of CSS length syntax this compiler emits.
 *
 * The compiler's job ends when it has written `clamp(...)`; whether that
 * expression describes a sane layout is a question only arithmetic can answer,
 * and arithmetic needs a viewport width to answer it at. Everything here exists
 * to give the diagnostics in `continuity.ts` a number to compare.
 *
 * It deliberately understands only what the compiler produces plus what an
 * author plausibly wrote by hand. Anything else — `var()`, `env()`, `%`,
 * container units — returns `null`, which callers must read as "unknown", never
 * as zero. A diagnostic that guesses is worse than one that stays quiet.
 */

import { CSS_NUMBER_SOURCE } from './syntax.js'

export interface EvaluationContext {
  /** Viewport width in pixels. */
  width: number
  /** Viewport height in pixels. Only needed for `vh` / `vmin` / `vmax`. */
  height: number
  /** Root font size in pixels, for `rem`. */
  rootFontSize: number
}

type Token =
  | { kind: 'number'; value: number; unit: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'paren'; value: '(' | ')' }
  | { kind: 'comma' }
  | { kind: 'function'; name: string }

const NUMBER = new RegExp(`^${CSS_NUMBER_SOURCE}`)
const IDENT = /^[a-z][\w-]*/i

interface Quantity {
  value: number
  dimension: 'number' | 'length'
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = []
  let rest = input.trim()
  let whitespaceBefore = false

  while (rest.length) {
    if (/\s/.test(rest[0]!)) {
      whitespaceBefore = true
      rest = rest.slice(1)
      continue
    }
    if (rest.startsWith('/*')) {
      const close = rest.indexOf('*/', 2)
      if (close < 0) return null
      rest = rest.slice(close + 2)
      continue
    }
    if (rest[0] === '(' || rest[0] === ')') {
      tokens.push({ kind: 'paren', value: rest[0] })
      rest = rest.slice(1)
      whitespaceBefore = false
      continue
    }
    if (rest[0] === ',') {
      tokens.push({ kind: 'comma' })
      rest = rest.slice(1)
      whitespaceBefore = false
      continue
    }
    // `*` and `/` are unambiguous, but `+` and `-` are only operators when they
    // are not the sign of the number that follows. CSS resolves this with
    // whitespace, and so does the number pattern below: it is tried first, so a
    // signed number wins wherever one is syntactically possible.
    const number = NUMBER.exec(rest)
    if (number && !(tokens.at(-1)?.kind === 'number' && /^[+-]/.test(number[0]))) {
      rest = rest.slice(number[0].length)
      const unit = IDENT.exec(rest)
      if (unit) rest = rest.slice(unit[0].length)
      tokens.push({
        kind: 'number',
        value: Number(number[0]),
        unit: (unit?.[0] ?? '').toLowerCase(),
      })
      whitespaceBefore = false
      continue
    }
    if (rest[0] === '+' || rest[0] === '-' || rest[0] === '*' || rest[0] === '/') {
      const previous = tokens.at(-1)
      const binary =
        previous?.kind === 'number' ||
        (previous?.kind === 'paren' && previous.value === ')')
      if (
        binary &&
        (rest[0] === '+' || rest[0] === '-') &&
        (!whitespaceBefore || !/\s/.test(rest[1] ?? ''))
      ) {
        return null
      }
      tokens.push({ kind: 'op', value: rest[0] })
      rest = rest.slice(1)
      whitespaceBefore = false
      continue
    }
    const ident = IDENT.exec(rest)
    if (ident && rest[ident[0].length] === '(') {
      tokens.push({ kind: 'function', name: ident[0].toLowerCase() })
      rest = rest.slice(ident[0].length + 1)
      tokens.push({ kind: 'paren', value: '(' })
      whitespaceBefore = false
      continue
    }
    // A bare keyword (`solid`), a colour, a `var()` reference, a percentage —
    // all real CSS, none of it a length this can put a number to.
    return null
  }
  return tokens
}

function toPixels(value: number, unit: string, context: EvaluationContext): Quantity | null {
  let pixels: number
  switch (unit) {
    case '':
      return { value, dimension: 'number' }
    case 'px':
      pixels = value
      break
    case 'rem':
      pixels = value * context.rootFontSize
      break
    case 'em':
      // `em` belongs to the element's inherited font size, not the root. The
      // selector/cascade context needed to know it is deliberately outside
      // this arithmetic evaluator, so treating it as `rem` would invent pixels.
      return null
    case 'vw':
    case 'vi':
      pixels = (value * context.width) / 100
      break
    case 'vh':
    case 'vb':
      pixels = (value * context.height) / 100
      break
    case 'vmin':
      pixels = (value * Math.min(context.width, context.height)) / 100
      break
    case 'vmax':
      pixels = (value * Math.max(context.width, context.height)) / 100
      break
    default:
      // Container units are the notable absentee: `cqi` depends on an ancestor
      // this evaluator cannot see, and assuming the viewport would silently
      // turn every container-query configuration into a wrong number.
      return null
  }
  return { value: pixels, dimension: 'length' }
}

class Parser {
  private index = 0

  constructor(
    private readonly tokens: Token[],
    private readonly context: EvaluationContext,
  ) {}

  parse(): Quantity | null {
    const value = this.sum()
    if (value === null || this.index !== this.tokens.length) return null
    return value
  }

  private peek(): Token | undefined {
    return this.tokens[this.index]
  }

  private sum(): Quantity | null {
    let left = this.product()
    for (;;) {
      const token = this.peek()
      if (left === null || token?.kind !== 'op') return left
      if (token.value !== '+' && token.value !== '-') return left
      this.index += 1
      const right = this.product()
      if (right === null || left.dimension !== right.dimension) return null
      left = {
        value: token.value === '+' ? left.value + right.value : left.value - right.value,
        dimension: left.dimension,
      }
    }
  }

  private product(): Quantity | null {
    let left = this.unary()
    for (;;) {
      const token = this.peek()
      if (left === null || token?.kind !== 'op') return left
      if (token.value !== '*' && token.value !== '/') return left
      this.index += 1
      const right = this.unary()
      if (right === null) return null
      if (token.value === '/') {
        if (right.value === 0 || right.dimension !== 'number') return null
        left = { value: left.value / right.value, dimension: left.dimension }
      } else {
        if (left.dimension === 'length' && right.dimension === 'length') return null
        left = {
          value: left.value * right.value,
          dimension:
            left.dimension === 'length' || right.dimension === 'length' ? 'length' : 'number',
        }
      }
    }
  }

  private unary(): Quantity | null {
    const token = this.peek()
    if (token?.kind === 'op' && (token.value === '+' || token.value === '-')) {
      this.index += 1
      const operand = this.unary()
      if (operand === null) return null
      return token.value === '-' ? { ...operand, value: -operand.value } : operand
    }
    return this.primary()
  }

  private primary(): Quantity | null {
    const token = this.peek()
    if (!token) return null

    if (token.kind === 'number') {
      this.index += 1
      return toPixels(token.value, token.unit, this.context)
    }
    if (token.kind === 'paren' && token.value === '(') {
      this.index += 1
      const value = this.sum()
      if (value === null || this.peek()?.kind !== 'paren') return null
      this.index += 1
      return value
    }
    if (token.kind === 'function') {
      this.index += 1
      return this.call(token.name)
    }
    return null
  }

  private call(name: string): Quantity | null {
    // The opening paren was pushed by the tokenizer right after the name.
    if (this.peek()?.kind !== 'paren') return null
    this.index += 1

    const args: Quantity[] = []
    for (;;) {
      const value = this.sum()
      if (value === null) return null
      args.push(value)
      const next = this.peek()
      if (next?.kind === 'comma') {
        this.index += 1
        continue
      }
      if (next?.kind === 'paren' && next.value === ')') {
        this.index += 1
        break
      }
      return null
    }

    switch (name) {
      case 'calc':
        return args.length === 1 ? args[0]! : null
      case 'min':
        return sameDimension(args)
          ? {
              value: Math.min(...args.map((argument) => argument.value)),
              dimension: args[0]!.dimension,
            }
          : null
      case 'max':
        return sameDimension(args)
          ? {
              value: Math.max(...args.map((argument) => argument.value)),
              dimension: args[0]!.dimension,
            }
          : null
      case 'clamp':
        // `clamp(a, b, c)` is `max(a, min(b, c))` — which, when the author has
        // written a minimum above the maximum, resolves to the minimum. Mirror
        // the spec rather than the intent.
        return args.length === 3 && sameDimension(args)
          ? {
              value: Math.max(args[0]!.value, Math.min(args[1]!.value, args[2]!.value)),
              dimension: args[0]!.dimension,
            }
          : null
      default:
        return null
    }
  }
}

function sameDimension(args: Quantity[]): boolean {
  return args.length > 0 && args.every((argument) => argument.dimension === args[0]!.dimension)
}

/**
 * Resolves a single CSS length component to pixels, or `null` when any part of
 * it is outside the supported subset.
 */
export function evaluateLength(value: string, context: EvaluationContext): number | null {
  const tokens = tokenize(value)
  if (!tokens?.length) return null
  const result = new Parser(tokens, context).parse()
  if (result === null || !Number.isFinite(result.value)) return null
  // A declaration expecting a length accepts a unitless zero, but no other
  // bare number. Numbers remain useful inside calc() multiplication/division.
  return result.dimension === 'length' || result.value === 0 ? result.value : null
}

/**
 * Splits a declaration value into top-level components, keeping bracketed
 * groups intact so `clamp(1px, 2vw, 3px) 4px` is two components, not five.
 */
export function splitComponents(value: string): string[] {
  const parts: string[] = []
  const blocks: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  let comment = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!
    const next = value[index + 1]
    if (comment) {
      current += character
      if (character === '*' && next === '/') {
        current += '/'
        comment = false
        index += 1
      }
      continue
    }
    if (quote) {
      current += character
      if (character === '\\' && next !== undefined) {
        current += next
        index += 1
      } else if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === '/' && next === '*') {
      current += '/*'
      comment = true
      index += 1
      continue
    }
    if (character === "'" || character === '"') {
      current += character
      quote = character
      continue
    }
    if (character === '(' || character === '[' || character === '{') blocks.push(character)
    else if (character === ')' || character === ']' || character === '}') blocks.pop()
    if (blocks.length === 0 && /\s/.test(character)) {
      if (current) parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  if (current) parts.push(current)
  return parts
}
