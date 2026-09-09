import type { FileMatcher, Pattern } from './types.js'
import { canonicalCssPropertyName } from './syntax.js'

/**
 * One value or several, always as a fresh mutable array.
 *
 * Copies rather than passing the caller's array through: options are the
 * user's object, and a configuration reused across two PostCSS instances
 * should not be able to observe what this plugin did to it.
 */
export function toArray<T>(value: T | readonly T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? [...(value as readonly T[])] : [value as T]
}

function resettableTest(pattern: RegExp, value: string): boolean {
  // Native non-stateful expressions neither read nor write lastIndex. Keep
  // custom test/exec implementations on the restoring path below.
  if (
    !pattern.global &&
    !pattern.sticky &&
    pattern.test === RegExp.prototype.test &&
    pattern.exec === RegExp.prototype.exec
  ) {
    return pattern.test(value)
  }
  // Frozen configuration objects may also freeze their regexes. Native test
  // cannot update lastIndex on a frozen global/sticky expression; use an
  // independent expression instead of mutating caller-owned immutable data.
  if (Object.getOwnPropertyDescriptor(pattern, 'lastIndex')?.writable === false) {
    return new RegExp(pattern.source, pattern.flags).test(value)
  }
  const previous = pattern.lastIndex
  pattern.lastIndex = 0
  try {
    return pattern.test(value)
  } finally {
    pattern.lastIndex = previous
  }
}

export function matchesPattern(pattern: Pattern, value: string): boolean {
  return typeof pattern === 'string' ? value.includes(pattern) : resettableTest(pattern, value)
}

/** String path filters are portable; predicates and regexes retain the host spelling. */
function matchesPathString(pattern: string, file: string): boolean {
  if (file.includes(pattern)) return true
  if (!file.includes('\\') && !pattern.includes('\\')) return false
  return file.replaceAll('\\', '/').includes(pattern.replaceAll('\\', '/'))
}

export function matchesAnyPattern(
  patterns: readonly Pattern[] | undefined,
  value: string,
): boolean {
  if (!patterns) return false
  for (const pattern of patterns) {
    if (matchesPattern(pattern, value)) return true
  }
  return false
}

export function matchesFile(
  matchers: FileMatcher | readonly FileMatcher[] | undefined,
  file: string,
): boolean {
  if (!matchers) return false
  // Resolved routes already store arrays. Do not clone one for every selector
  // in a stylesheet merely to iterate over a read-only value.
  const list: readonly FileMatcher[] = Array.isArray(matchers)
    ? (matchers as readonly FileMatcher[])
    : [matchers as FileMatcher]
  for (const matcher of list) {
    if (typeof matcher === 'function') {
      if (matcher(file)) return true
      continue
    }
    if (
      typeof matcher === 'string' ? matchesPathString(matcher, file) : resettableTest(matcher, file)
    ) {
      return true
    }
  }
  return false
}

function compilePropertyGlob(glob: string): (value: string) => boolean {
  const parts = glob.split(/\*+/)
  if (parts.length === 1) return (value) => value === glob
  const prefix = parts[0]!
  const suffix = parts[parts.length - 1]!
  const middle = parts.slice(1, -1)
  return (value) => {
    if (!value.startsWith(prefix) || !value.endsWith(suffix)) return false
    let position = prefix.length
    const end = value.length - suffix.length
    // Literal segments are located monotonically. Unlike .* chains this
    // never revisits combinations of earlier matches when a suffix fails.
    for (const part of middle) {
      const found = value.indexOf(part, position)
      if (found < 0 || found + part.length > end) return false
      position = found + part.length
    }
    return position <= end
  }
}

/**
 * Builds a property filter from a list of glob entries.
 *
 * `*` matches any run of characters and a leading `!` excludes. A property is
 * kept when some entry includes it and no entry excludes it, so `['*', '!font*']`
 * reads as "everything except font properties".
 */
export function createPropertyMatcher(propList: readonly string[]) {
  // CSS standard properties are ASCII case-insensitive. Custom properties are
  // deliberately not folded: `--Theme-gap` and `--theme-gap` are two different
  // variables, and a filter that names one must not capture the other.
  const canonical = (item: string): string => {
    const negated = item.startsWith('!')
    const pattern = negated ? item.slice(1) : item
    const normalised = canonicalCssPropertyName(pattern)
    return negated ? `!${normalised}` : normalised
  }
  const patterns = propList.map(canonical)
  const includes = patterns.filter((item) => !item.startsWith('!'))
  const excludes = patterns.filter((item) => item.startsWith('!')).map((item) => item.slice(1))
  const includeMatchers = includes.map(compilePropertyGlob)
  const excludeMatchers = excludes.map(compilePropertyGlob)
  const cache = new Map<string, boolean>()

  const match = (property: string): boolean => {
    const subject = canonicalCssPropertyName(property)
    let included = false
    for (const pattern of includeMatchers) {
      if (pattern(subject)) {
        included = true
        break
      }
    }
    if (!included) return false
    for (const pattern of excludeMatchers) {
      if (pattern(subject)) return false
    }
    return true
  }
  return (property: string): boolean => {
    const cached = cache.get(property)
    if (cached !== undefined) return cached
    const result = match(property)
    // Custom-property names can be generated without bound during watch builds.
    if (cache.size >= 1024) cache.clear()
    cache.set(property, result)
    return result
  }
}
