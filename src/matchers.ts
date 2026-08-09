import type { FileMatcher, Pattern } from './types.js'

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
  patterns: readonly Pattern[],
  value: string,
): boolean {
  return patterns.some((pattern) => matchesPattern(pattern, value))
}

export function matchesFile(
  matchers: FileMatcher | FileMatcher[] | undefined,
  file: string,
): boolean {
  if (!matchers) return false
  const list = Array.isArray(matchers) ? matchers : [matchers]
  return list.some((matcher) => {
    if (typeof matcher === 'function') return matcher(file)
    return matchesPattern(matcher, file)
  })
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`)
}

/** Supports the prop-list grammar used by px-to-viewport/pxtorem. */
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
