import type { FileMatcher, Pattern } from './types.js'
import { decodeCssIdentifier } from './syntax.js'

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

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`)
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
    const normalised = pattern.startsWith('--') ? pattern : pattern.toLowerCase()
    return negated ? `!${normalised}` : normalised
  }
  const patterns = propList.map(canonical)
  const includes = patterns.filter((item) => !item.startsWith('!'))
  const excludes = patterns.filter((item) => item.startsWith('!')).map((item) => item.slice(1))
  const includeRegex = includes.map(globToRegExp)
  const excludeRegex = excludes.map(globToRegExp)

  return (property: string): boolean => {
    const subject = property.startsWith('--')
      ? decodeCssIdentifier(property)
      : property.toLowerCase()
    let included = false
    for (const pattern of includeRegex) {
      if (pattern.test(subject)) {
        included = true
        break
      }
    }
    if (!included) return false
    for (const pattern of excludeRegex) {
      if (pattern.test(subject)) return false
    }
    return true
  }
}
