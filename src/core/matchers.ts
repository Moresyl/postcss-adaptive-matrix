import type { FileMatcher, Pattern } from './types.js'

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
  pattern.lastIndex = 0
  return pattern.test(value)
}

export function matchesPattern(pattern: Pattern, value: string): boolean {
  return typeof pattern === 'string'
    ? value.includes(pattern)
    : resettableTest(pattern, value)
}

export function matchesAnyPattern(
  patterns: readonly Pattern[] | undefined,
  value: string,
): boolean {
  if (!patterns) return false
  return patterns.some((pattern) => matchesPattern(pattern, value))
}

export function matchesFile(
  matchers: FileMatcher | readonly FileMatcher[] | undefined,
  file: string,
): boolean {
  if (!matchers) return false
  const list = toArray(matchers)
  return list.some((matcher) => {
    if (typeof matcher === 'function') return matcher(file)
    return matchesPattern(matcher, file)
  })
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
  const includes = propList.filter((item) => !item.startsWith('!'))
  const excludes = propList
    .filter((item) => item.startsWith('!'))
    .map((item) => item.slice(1))
  const includeRegex = includes.map(globToRegExp)
  const excludeRegex = excludes.map(globToRegExp)

  return (property: string): boolean => {
    const included = includeRegex.some((pattern) => pattern.test(property))
    const excluded = excludeRegex.some((pattern) => pattern.test(property))
    return included && !excluded
  }
}
