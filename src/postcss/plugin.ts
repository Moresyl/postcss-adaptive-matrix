import postcss, {
  type AtRule,
  type ChildNode,
  type Comment,
  type Container,
  type Declaration,
  type PluginCreator,
  type Result,
  type Root,
  type Rule,
} from 'postcss'
import { createConverter, type Converter } from '../core/convert.js'
import {
  correctFixedDeclaration,
  isFixedPositionValue,
  wantsFixedCorrection,
} from '../core/fixed.js'
import { adaptiveQueryParams, buildFoundationCss } from '../core/foundation.js'
import {
  createPropertyMatcher,
  matchesAnyPattern,
  matchesFile,
} from '../core/matchers.js'
import { resolveOptions } from '../core/options.js'
import { createProfileResolver, type ProfileResolver } from '../core/resolve.js'
import type {
  ActiveProfile,
  AdaptiveMatrixOptions,
  ResolvedAdaptiveMatrixOptions,
} from '../core/types.js'

export const PLUGIN_NAME = 'postcss-adaptive-matrix'
const IGNORE_NEXT = 'adaptive-ignore-next'
const IGNORE_LINE = 'adaptive-ignore'
const IGNORE_RULE = 'adaptive-ignore-rule'

function isComment(node: ChildNode | undefined, text: string): node is Comment {
  return node?.type === 'comment' && node.text.trim() === text
}

function shouldIgnoreDeclaration(declaration: Declaration): boolean {
  const previous = declaration.prev()
  if (isComment(previous, IGNORE_NEXT)) {
    previous.remove()
    return true
  }
  const next = declaration.next()
  if (
    isComment(next, IGNORE_LINE) &&
    !String(next.raws.before ?? '').includes('\n')
  ) {
    next.remove()
    return true
  }
  return false
}

function shouldIgnoreRule(rule: Rule): boolean {
  const previous = rule.prev()
  if (!isComment(previous, IGNORE_RULE)) return false
  previous.remove()
  return true
}

function hasEquivalentDeclaration(
  declaration: Declaration,
  value: string,
): boolean {
  return Boolean(
    declaration.parent?.nodes.some(
      (node) =>
        node.type === 'decl' &&
        node !== declaration &&
        node.prop === declaration.prop &&
        node.value === value,
    ),
  )
}

interface ProcessorContext {
  file: string
  options: ResolvedAdaptiveMatrixOptions
  result: Result
  resolver: ProfileResolver
  converter: Converter
  propertyMatches: (property: string) => boolean
  correctsFixed: boolean
}

function transformDeclaration(
  declaration: Declaration,
  active: ActiveProfile,
  context: ProcessorContext,
): void {
  const { options, file } = context
  if (!context.converter.mightContainUnit(declaration.value)) return

  // A library token is claimed by name, which is the only evidence available:
  // it is declared on `:root`, far from any class that identifies its owner.
  // Being claimed is itself the opt-in, so `transformCustomProperties` — a
  // switch about *authored* variables — does not get to veto it.
  let target = active
  if (declaration.prop.startsWith('--')) {
    const routed = context.resolver.forCustomProperty(active, declaration.prop, file)
    if (!routed && !options.transformCustomProperties) return
    if (routed) target = routed
  }

  if (
    !target.convert ||
    !context.propertyMatches(declaration.prop) ||
    matchesAnyPattern(options.valueExclude, declaration.value) ||
    shouldIgnoreDeclaration(declaration)
  ) {
    return
  }

  const converted = context.converter.convert(
    declaration.value,
    declaration.prop,
    target.name,
    target.profile,
    file,
  )
  if (converted === declaration.value || hasEquivalentDeclaration(declaration, converted)) {
    return
  }
  if (options.preserveOriginal) {
    declaration.cloneAfter({ value: converted })
  } else {
    declaration.value = converted
  }
}

/**
 * Offsets a fixed-position rule into the root column.
 *
 * Runs after conversion so it wraps the fluid value rather than the authored
 * pixels, and only inspects rules that declare `position: fixed` themselves —
 * a rule inheriting the position from elsewhere is not something CSS lets us
 * see, and guessing would be worse than missing it.
 */
function correctFixedRule(rule: Rule): void {
  let fixed = false
  for (const node of rule.nodes) {
    if (node.type === 'decl' && node.prop.toLowerCase() === 'position') {
      if (isFixedPositionValue(node.value)) fixed = true
    }
  }
  if (!fixed) return

  for (const node of rule.nodes) {
    if (node.type !== 'decl') continue
    const corrected = correctFixedDeclaration(node.prop, node.value)
    if (corrected !== null) node.value = corrected
  }
}

function transformRule(
  rule: Rule,
  inherited: ActiveProfile,
  context: ProcessorContext,
): void {
  if (
    shouldIgnoreRule(rule) ||
    matchesAnyPattern(context.options.selectorExclude, rule.selector)
  ) {
    return
  }

  const active = context.resolver.forSelector(inherited, rule.selector, context.file)
  for (const node of [...rule.nodes]) {
    if (node.type === 'decl') {
      transformDeclaration(node, active, context)
    } else if (node.type === 'rule') {
      transformRule(node, active, context)
    } else if (node.type === 'atrule' && node.nodes) {
      processContainer(node, active, context)
    }
  }

  if (context.correctsFixed) correctFixedRule(rule)
}

function unknownProfile(
  atRule: AtRule,
  name: string,
  context: ProcessorContext,
): void {
  const message = `Unknown adaptive profile "${name}". Available profiles: ${Object.keys(
    context.options.profiles,
  ).join(', ')}.`
  if (context.options.unknownProfile === 'error') {
    throw atRule.error(message, { plugin: PLUGIN_NAME })
  }
  if (context.options.unknownProfile === 'warn') {
    context.result.warn(message, { node: atRule, plugin: PLUGIN_NAME })
  }
}

function indentOf(before: unknown): string {
  const text = String(before ?? '')
  const lineStart = text.lastIndexOf('\n')
  return lineStart === -1 ? '' : text.slice(lineStart + 1)
}

/** Replaces an at-rule with its children, re-indenting them to the level it occupied. */
function unwrapAtRule(atRule: AtRule): void {
  const children = [...(atRule.nodes ?? [])]
  if (!children.length) {
    atRule.remove()
    return
  }

  const extra = indentOf(children[0]!.raws.before).slice(
    indentOf(atRule.raws.before).length,
  )
  if (extra) {
    for (const child of children) {
      const before = String(child.raws.before ?? '')
      if (before.endsWith(extra)) child.raws.before = before.slice(0, -extra.length)
    }
  }
  children[0]!.raws.before = atRule.raws.before
  atRule.replaceWith(...children)
}

function transformAdaptiveAtRule(
  atRule: AtRule,
  context: ProcessorContext,
): void {
  const profileName = atRule.params.trim() || context.options.defaultProfile
  const profile = context.options.profiles[profileName]
  if (!profile) {
    unknownProfile(atRule, profileName, context)
    return
  }

  processContainer(
    atRule,
    { name: profileName, profile, explicit: true, convert: true },
    context,
  )
  const query = adaptiveQueryParams(profile)
  if (!query) {
    unwrapAtRule(atRule)
    return
  }
  atRule.name = query.name
  atRule.params = query.params
  // `@adaptive {` carries no separator, and `@media(...)` reads as a syntax error.
  if (!atRule.raws.afterName) atRule.raws.afterName = ' '
}

function processContainer(
  container: Container,
  active: ActiveProfile,
  context: ProcessorContext,
): void {
  for (const node of [...(container.nodes ?? [])]) {
    if (node.type === 'rule') {
      transformRule(node, active, context)
      continue
    }
    if (node.type !== 'atrule') continue
    if (node.name === context.options.atRuleName) {
      transformAdaptiveAtRule(node, context)
    } else if (node.nodes) {
      processContainer(node, active, context)
    }
  }
}

function shouldProcessFile(
  file: string,
  options: ResolvedAdaptiveMatrixOptions,
): boolean {
  if (matchesFile(options.exclude, file)) return false
  if (options.include && !matchesFile(options.include, file)) return false
  return true
}

function appendFoundation(root: Root, options: ResolvedAdaptiveMatrixOptions): void {
  const css = buildFoundationCss(options)
  if (!css) return
  const foundation = postcss.parse(css, { from: root.source?.input.file })
  // Without this the generated base would be glued to the last authored rule.
  if (foundation.first) foundation.first.raws.before = root.nodes.length ? '\n\n' : ''
  root.append(foundation.nodes)
}

export const adaptiveMatrix: PluginCreator<AdaptiveMatrixOptions> = (
  inputOptions = {},
) => {
  const options = resolveOptions(inputOptions)
  const propertyMatches = createPropertyMatcher(options.propList)
  const resolver = createProfileResolver(options)
  const converter = createConverter(options)
  const correctsFixed = wantsFixedCorrection(options)

  return {
    postcssPlugin: PLUGIN_NAME,
    Once(root: Root, { result }) {
      const file = root.source?.input.file ?? result.opts.from?.toString() ?? ''
      if (!shouldProcessFile(file, options)) return
      converter.beginFile()
      processContainer(root, resolver.forFile(file), {
        converter,
        correctsFixed,
        file,
        options,
        propertyMatches,
        resolver,
        result,
      })
      appendFoundation(root, options)
    },
  }
}

adaptiveMatrix.postcss = true
