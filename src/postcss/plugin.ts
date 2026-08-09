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
import { LIBRARY_PROFILE_PREFIX } from '../core/libraries.js'
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

/**
 * At-rules whose declarations style the element that encloses them.
 *
 * Under CSS nesting these wrap declarations belonging to the parent rule, so
 * those declarations are converted like any other. Everything absent from this
 * set — `@font-face`, `@page`, `@property`, `@counter-style` — describes a
 * resource or a page box instead of an element, and its lengths are left alone:
 * a print margin in `vw` is not the same margin.
 *
 * Rules nested inside an unlisted at-rule are still visited, which is why this
 * gates declarations only.
 */
const NESTED_DECLARATION_CONTEXTS = new Set([
  'container',
  'layer',
  'media',
  'scope',
  'starting-style',
  'supports',
])

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

/**
 * True when this declaration is already immediately followed by its converted
 * twin — the shape `preserveOriginal` produces, and the one to leave alone.
 *
 * Positional on purpose. Scanning the whole rule instead would also match two
 * identical declarations someone wrote by hand, and skipping the later of those
 * is the one thing that must not happen: the last declaration wins the cascade,
 * so leaving it authored means the conversion has no effect at all, silently.
 */
function isFollowedByEquivalent(declaration: Declaration, value: string): boolean {
  let node = declaration.next()
  while (node?.type === 'comment') node = node.next()
  return node?.type === 'decl' && node.prop === declaration.prop && node.value === value
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
  if (converted === declaration.value || isFollowedByEquivalent(declaration, converted)) {
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
  processContainer(rule, active, context, true)

  if (context.correctsFixed) correctFixedRule(rule)
}

function unknownProfile(
  atRule: AtRule,
  name: string,
  context: ProcessorContext,
): void {
  // Says what happens next, not just what is wrong. An unrecognised profile
  // leaves the at-rule in place, and a browser discards an at-rule it does not
  // know along with everything inside it — so the block does not merely go
  // unconverted, it stops applying at all. That is worth spelling out at the
  // point someone reads the warning.
  // The registry contributes one synthetic canvas per adapted library. Those
  // are not names anyone writes by hand, so listing them here would push the
  // two or three that are actually spellable off the end of the line.
  const available = Object.keys(context.options.profiles).filter(
    (profile) => !profile.startsWith(LIBRARY_PROFILE_PREFIX),
  )
  const message =
    `Unknown adaptive profile "${name}". Available profiles: ${available.join(', ')}. ` +
    `The @${context.options.atRuleName} block is left as authored, which means browsers will drop it entirely. ` +
    `Set unknownProfile: 'error' to fail the build instead.`
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
  declarations: boolean,
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
    declarations,
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

/**
 * Walks a container, converting what belongs to `active`.
 *
 * `declarations` says whether a declaration found directly here styles an
 * element. It is false at the root, where a bare declaration is not valid CSS,
 * and inside at-rules that configure something other than an element — see
 * `NESTED_DECLARATION_CONTEXTS`. Rules are visited either way, so an at-rule
 * this plugin has never heard of still gets its contents converted.
 */
function processContainer(
  container: Container,
  active: ActiveProfile,
  context: ProcessorContext,
  declarations: boolean,
): void {
  for (const node of [...(container.nodes ?? [])]) {
    if (node.type === 'decl') {
      if (declarations) transformDeclaration(node, active, context)
      continue
    }
    if (node.type === 'rule') {
      transformRule(node, active, context)
      continue
    }
    if (node.type !== 'atrule') continue
    if (node.name === context.options.atRuleName) {
      // Nested in a rule, `@adaptive` wraps that rule's own declarations; at the
      // root it wraps rules. Passing the flag down keeps both readings correct.
      transformAdaptiveAtRule(node, context, declarations)
    } else if (node.nodes) {
      processContainer(
        node,
        active,
        context,
        declarations && NESTED_DECLARATION_CONTEXTS.has(node.name.toLowerCase()),
      )
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

function appendFoundation(
  root: Root,
  file: string,
  options: ResolvedAdaptiveMatrixOptions,
): void {
  if (options.root && options.root.injectTo && !matchesFile(options.root.injectTo, file)) {
    return
  }
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
      processContainer(
        root,
        resolver.forFile(file),
        {
          converter,
          correctsFixed,
          file,
          options,
          propertyMatches,
          resolver,
          result,
        },
        false,
      )
      appendFoundation(root, file, options)
    },
  }
}

adaptiveMatrix.postcss = true
