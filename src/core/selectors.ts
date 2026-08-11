/**
 * Selector structure: which element a selector actually matches, and what
 * splitting it would cost.
 *
 * A selector is not a bag of substrings. `.page-hero:not(.van-cell)` contains
 * `.van-` and matches no Vant component whatsoever — the argument to `:not()`
 * names what is *excluded*. Route on the raw string and that rule lands on
 * Vant's canvas, so every length in it is scaled against a design file it was
 * never drawn on, with no error and no warning. Telling the two apart needs the
 * structure, so this parses it.
 *
 * Deliberately not a full selector parser: nothing here needs to know that
 * `>` is a combinator or that `.a.b` is one compound. What it needs is the
 * bracket, string and functional-pseudo-class nesting, because those are what
 * make substring matching wrong.
 */

/**
 * Functional pseudo-classes whose argument describes an element *other* than
 * the one being matched.
 *
 * `:not()` names what the subject is not; `:has()` names what it contains or is
 * followed by. Neither says anything about which design file the subject was
 * drawn on, so neither may decide its canvas.
 */
const EXCLUDED_ARGUMENTS = new Set(['not', 'has'])

/**
 * Functional pseudo-classes whose argument is a list of alternatives for the
 * subject itself, and whose specificity is the highest branch — except
 * `:where()`, which is always zero.
 */
const MATCHING_ARGUMENTS = new Set(['is', 'where', 'matches', '-webkit-any', '-moz-any'])

/** Pseudo-elements that predate `::` and are still written with one colon. */
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter'])

/** CSS specificity, as the `(id, class, type)` triple the cascade compares. */
export type Specificity = readonly [number, number, number]

/** A selector list nested inside a functional pseudo-class. */
export interface NestedSelectorList {
  /** Lower-cased pseudo-class name, without the colon — `is`, `where`. */
  pseudo: string
  /** The branches, trimmed. Always two or more. */
  parts: string[]
}

/** CSS identifiers take letters, digits, `-`, `_`, escapes and anything non-ASCII. */
function isIdentifierChar(character: string): boolean {
  return /[-\w\u0080-\uFFFF\\]/.test(character)
}

/** What an identifier — and so a type selector — may begin with. */
function isIdentifierStart(character: string): boolean {
  return /[a-zA-Z_\u0080-\uFFFF\\]/.test(character)
}

/** Index just past the string literal starting at `start`. */
function skipString(selector: string, start: number): number {
  const quote = selector[start]
  let index = start + 1
  while (index < selector.length) {
    const character = selector[index]
    // A backslash escapes the next character, including the closing quote.
    if (character === '\\') {
      index += 2
      continue
    }
    if (character === quote) return index + 1
    index += 1
  }
  // Unterminated: the rest of the selector is inside the string. Saying so
  // beats looping, and a malformed selector is not this module's to repair.
  return selector.length
}

/** Index just past the attribute selector starting at `start`. */
function skipAttribute(selector: string, start: number): number {
  let index = start + 1
  while (index < selector.length) {
    const character = selector[index]!
    if (character === '"' || character === "'") {
      index = skipString(selector, index)
      continue
    }
    if (character === ']') return index + 1
    index += 1
  }
  return selector.length
}

/** Index of the `)` matching the `(` at `open`, or -1 when unbalanced. */
function matchingParen(selector: string, open: number): number {
  let depth = 0
  let index = open
  while (index < selector.length) {
    const character = selector[index]!
    if (character === '"' || character === "'") {
      index = skipString(selector, index)
      continue
    }
    if (character === '[') {
      index = skipAttribute(selector, index)
      continue
    }
    if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) return index
    }
    index += 1
  }
  return -1
}

interface Pseudo {
  /** Lower-cased name without colons. */
  name: string
  /** True for `::name`, and for the four legacy single-colon spellings. */
  element: boolean
  /** Index of `(`, or -1 when the pseudo-class takes no argument. */
  open: number
  /** Index just past the name — where a non-functional pseudo ends. */
  after: number
}

/** Reads the pseudo-class or pseudo-element starting at the colon at `start`. */
function readPseudo(selector: string, start: number): Pseudo | null {
  const doubled = selector[start + 1] === ':'
  let index = start + (doubled ? 2 : 1)
  const nameStart = index
  while (index < selector.length && isIdentifierChar(selector[index]!)) index += 1
  if (index === nameStart) return null
  const name = selector.slice(nameStart, index).toLowerCase()
  return {
    name,
    element: doubled || LEGACY_PSEUDO_ELEMENTS.has(name),
    open: selector[index] === '(' ? index : -1,
    after: index,
  }
}

/**
 * Splits a selector list on top-level commas.
 *
 * Commas also separate arguments inside `:is()` and `:not()`, and appear
 * literally inside attribute values and strings, so this tracks nesting rather
 * than splitting the string.
 */
export function splitSelectorList(selector: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  let index = 0
  while (index < selector.length) {
    const character = selector[index]!
    if (character === '"' || character === "'") {
      index = skipString(selector, index)
      continue
    }
    if (character === '[') {
      index = skipAttribute(selector, index)
      continue
    }
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    else if (character === ',' && depth === 0) {
      parts.push(selector.slice(start, index))
      start = index + 1
    }
    index += 1
  }
  parts.push(selector.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

/**
 * The selector with every excluded argument emptied out, for routing.
 *
 * `.page-hero:not(.van-cell)` becomes `.page-hero:not()`, which no longer
 * matches Vant's prefix — correctly, because the rule matches no Vant element.
 * The pseudo-class itself is kept rather than dropped so that a route written
 * against `:not` or `:has` still works, and so a selector that is *only* an
 * exclusion does not collapse to the empty string.
 */
export function routingSelector(selector: string): string {
  // Nothing to exclude without a pseudo-class, and most selectors in a
  // stylesheet have none. This runs on every rule of every file, so the check
  // that skips the rewrite entirely is worth more than anything inside it.
  if (!selector.includes(':')) return selector
  let output = ''
  let index = 0
  while (index < selector.length) {
    const character = selector[index]!
    if (character === '"' || character === "'") {
      const end = skipString(selector, index)
      output += selector.slice(index, end)
      index = end
      continue
    }
    if (character === '[') {
      const end = skipAttribute(selector, index)
      output += selector.slice(index, end)
      index = end
      continue
    }
    if (character === ':') {
      const pseudo = readPseudo(selector, index)
      if (pseudo && pseudo.open >= 0) {
        const close = matchingParen(selector, pseudo.open)
        if (close > 0) {
          output += selector.slice(index, pseudo.open + 1)
          // Everything else may still hold an exclusion further down, so it is
          // rewritten rather than copied.
          if (!EXCLUDED_ARGUMENTS.has(pseudo.name)) {
            output += routingSelector(selector.slice(pseudo.open + 1, close))
          }
          output += ')'
          index = close + 1
          continue
        }
      }
    }
    output += character
    index += 1
  }
  return output
}

/**
 * Selector lists nested inside `:is()` and friends, outermost first.
 *
 * Only the matching pseudo-classes are reported: a list inside `:not()` or
 * `:has()` names elements this rule does not style, so it cannot make the
 * rule's own canvas ambiguous — and after `routingSelector` it no longer
 * influences routing either.
 */
export function nestedSelectorLists(selector: string): NestedSelectorList[] {
  const found: NestedSelectorList[] = []
  let index = 0
  while (index < selector.length) {
    const character = selector[index]!
    if (character === '"' || character === "'") {
      index = skipString(selector, index)
      continue
    }
    if (character === '[') {
      index = skipAttribute(selector, index)
      continue
    }
    if (character === ':') {
      const pseudo = readPseudo(selector, index)
      if (pseudo && pseudo.open >= 0) {
        const close = matchingParen(selector, pseudo.open)
        if (close > 0) {
          const inner = selector.slice(pseudo.open + 1, close)
          if (MATCHING_ARGUMENTS.has(pseudo.name)) {
            const parts = splitSelectorList(inner)
            if (parts.length > 1) found.push({ pseudo: pseudo.name, parts })
            found.push(...nestedSelectorLists(inner))
          }
          index = close + 1
          continue
        }
      }
    }
    index += 1
  }
  return found
}

/** Highest specificity among the branches of a selector list. */
function highestBranch(list: string): Specificity {
  let highest: Specificity = [0, 0, 0]
  for (const part of splitSelectorList(list)) {
    const candidate = specificity(part)
    if (compareSpecificity(candidate, highest) > 0) highest = candidate
  }
  return highest
}

/** Specificity of one complex selector, per Selectors Level 4. */
export function specificity(selector: string): Specificity {
  let ids = 0
  let classes = 0
  let types = 0
  let index = 0
  while (index < selector.length) {
    const character = selector[index]!
    if (character === '"' || character === "'") {
      index = skipString(selector, index)
      continue
    }
    if (character === '[') {
      classes += 1
      index = skipAttribute(selector, index)
      continue
    }
    if (character === '#' || character === '.') {
      let end = index + 1
      while (end < selector.length && isIdentifierChar(selector[end]!)) end += 1
      // A lone `.` or `#` is not a selector, so it counts as nothing.
      if (end > index + 1) {
        if (character === '#') ids += 1
        else classes += 1
      }
      index = end
      continue
    }
    if (character === ':') {
      const pseudo = readPseudo(selector, index)
      if (!pseudo) {
        index += 1
        continue
      }
      const close = pseudo.open >= 0 ? matchingParen(selector, pseudo.open) : -1
      const inner = close > 0 ? selector.slice(pseudo.open + 1, close) : ''
      if (pseudo.element) types += 1
      else if (pseudo.name === 'where') {
        // Zero, by definition — the whole point of `:where()`.
      } else if (MATCHING_ARGUMENTS.has(pseudo.name) || EXCLUDED_ARGUMENTS.has(pseudo.name)) {
        const [a, b, c] = highestBranch(inner)
        ids += a
        classes += b
        types += c
      } else if (pseudo.name === 'nth-child' || pseudo.name === 'nth-last-child') {
        // `:nth-child(2n of .item)` is the pseudo-class plus its selector list.
        classes += 1
        const of = /\bof\b([^]*)$/i.exec(inner)
        if (of) {
          const [a, b, c] = highestBranch(of[1]!)
          ids += a
          classes += b
          types += c
        }
      } else classes += 1
      index = close > 0 ? close + 1 : pseudo.after
      continue
    }
    if (isIdentifierStart(character)) {
      let end = index
      while (end < selector.length && isIdentifierChar(selector[end]!)) end += 1
      // `*` and the combinators contribute nothing; a bare identifier is a type.
      types += 1
      index = end
      continue
    }
    index += 1
  }
  return [ids, classes, types]
}

/** Negative, zero or positive, ordering by the cascade's own comparison. */
export function compareSpecificity(left: Specificity, right: Specificity): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}

/** The `1-0-0` spelling the specification and the dev-tools both use. */
export function formatSpecificity(value: Specificity): string {
  return value.join('-')
}

/**
 * Whether splitting a list into one rule per branch preserves the cascade.
 *
 * `:is()` matches every branch at the specificity of its *highest* one, so
 * `:is(#main, .hero)` matches `.hero` at 1-0-0. Split that into two rules and
 * `.hero` drops to 0-1-0, which can hand the element to a rule that used to
 * lose. When every branch already agrees — the common case, a list of classes —
 * splitting costs nothing, and saying so is the difference between advice
 * somebody can act on and advice they have to go and verify.
 */
export function splitIsSpecificityNeutral(list: NestedSelectorList): boolean {
  if (list.pseudo === 'where') return true
  const [first, ...rest] = list.parts.map(specificity)
  return rest.every((entry) => compareSpecificity(entry, first!) === 0)
}
