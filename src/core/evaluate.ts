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

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i
const IDENT = /^[a-z][\w-]*/i

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = []
  let rest = input.trim()

  while (rest.length) {
    if (rest[0] === ' ' || rest[0] === '\t' || rest[0] === '\n') {
      rest = rest.slice(1)
      continue
    }
    if (rest[0] === '(' || rest[0] === ')') {
      tokens.push({ kind: 'paren', value: rest[0] as '(' | ')' })
      rest = rest.slice(1)
      continue
    }
    if (rest[0] === ',') {
      tokens.push({ kind: 'comma' })
      rest = rest.slice(1)
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
      continue
    }
    if (rest[0] === '+' || rest[0] === '-' || rest[0] === '*' || rest[0] === '/') {
      tokens.push({ kind: 'op', value: rest[0] as '+' | '-' | '*' | '/' })
      rest = rest.slice(1)
      continue
    }
    const ident = IDENT.exec(rest)
    if (ident && rest[ident[0].length] === '(') {
      tokens.push({ kind: 'function', name: ident[0].toLowerCase() })
      rest = rest.slice(ident[0].length + 1)
      tokens.push({ kind: 'paren', value: '(' })
      continue
    }
    // A bare keyword (`solid`), a colour, a `var()` reference, a percentage —
    // all real CSS, none of it a length this can put a number to.
    return null
  }
  return tokens
}

function toPixels(value: number, unit: string, context: EvaluationContext): number | null {
  switch (unit) {
    case '':
      return value
    case 'px':
      return value
    case 'rem':
    case 'em':
      return value * context.rootFontSize
    case 'vw':
    case 'vi':
      return (value * context.width) / 100
    case 'vh':
    case 'vb':
      return (value * context.height) / 100
    case 'vmin':
      return (value * Math.min(context.width, context.height)) / 100
    case 'vmax':
      return (value * Math.max(context.width, context.height)) / 100
    default:
      // Container units are the notable absentee: `cqi` depends on an ancestor
      // this evaluator cannot see, and assuming the viewport would silently
      // turn every container-query configuration into a wrong number.
      return null
  }
}

class Parser {
  private index = 0

  constructor(
    private readonly tokens: Token[],
    private readonly context: EvaluationContext,
  ) {}

  parse(): number | null {
    const value = this.sum()
    if (value === null || this.index !== this.tokens.length) return null
    return value
  }

  private peek(): Token | undefined {
    return this.tokens[this.index]
  }

  private sum(): number | null {
    let left = this.product()
    for (;;) {
      const token = this.peek()
      if (left === null || token?.kind !== 'op') return left
      if (token.value !== '+' && token.value !== '-') return left
      this.index += 1
      const right = this.product()
      if (right === null) return null
      left = token.value === '+' ? left + right : left - right
    }
  }

  private product(): number | null {
    let left = this.unary()
    for (;;) {
      const token = this.peek()
      if (left === null || token?.kind !== 'op') return left
      if (token.value !== '*' && token.value !== '/') return left
      this.index += 1
      const right = this.unary()
      if (right === null) return null
      if (token.value === '/' && right === 0) return null
      left = token.value === '*' ? left * right : left / right
    }
  }

  private unary(): number | null {
    const token = this.peek()
    if (token?.kind === 'op' && (token.value === '+' || token.value === '-')) {
      this.index += 1
      const operand = this.unary()
      if (operand === null) return null
      return token.value === '-' ? -operand : operand
    }
    return this.primary()
  }

  private primary(): number | null {
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

  private call(name: string): number | null {
    // The opening paren was pushed by the tokenizer right after the name.
    if (this.peek()?.kind !== 'paren') return null
    this.index += 1

    const args: number[] = []
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
        return args.length ? Math.min(...args) : null
      case 'max':
        return args.length ? Math.max(...args) : null
      case 'clamp':
        // `clamp(a, b, c)` is `max(a, min(b, c))` — which, when the author has
        // written a minimum above the maximum, resolves to the minimum. Mirror
        // the spec rather than the intent.
        return args.length === 3
          ? Math.max(args[0]!, Math.min(args[1]!, args[2]!))
          : null
      default:
        return null
    }
  }
}

/**
 * Resolves a single CSS length component to pixels, or `null` when any part of
 * it is outside the supported subset.
 */
export function evaluateLength(
  value: string,
  context: EvaluationContext,
): number | null {
  const tokens = tokenize(value)
  if (!tokens?.length) return null
  const result = new Parser(tokens, context).parse()
  return result === null || !Number.isFinite(result) ? null : result
}

/**
 * Splits a declaration value into top-level components, keeping bracketed
 * groups intact so `clamp(1px, 2vw, 3px) 4px` is two components, not five.
 */
export function splitComponents(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of value) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth === 0 && /\s/.test(character)) {
      if (current) parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  if (current) parts.push(current)
  return parts
}
