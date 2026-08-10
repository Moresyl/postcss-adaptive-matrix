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
import {
  FOUNDATION_MARKER,
  adaptiveQueryParams,
  buildFoundationCss,
} from '../core/foundation.js'
import { LIBRARY_PROFILE_PREFIX } from '../core/libraries.js'
import {
  createPropertyMatcher,
  matchesAnyPattern,
  matchesFile,
} from '../core/matchers.js'
import { resolveOptions } from '../core/options.js'
import { createProfileResolver, type ProfileResolver } from '../core/resolve.js'
import {
  compareSpecificity,
  formatSpecificity,
  nestedSelectorLists,
  routingSelector,
  specificity,
  splitIsSpecificityNeutral,
  splitSelectorList,
  type Specificity,
} from '../core/selectors.js'
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

/*
 * The directives are left in the output rather than consumed.
 *
 * A directive is the one instruction the author gives that has no trace in the
 * result: an ignored `40px` is indistinguishable from a `40px` nobody thought
 * about. Strip the comment and a second compile pass converts it — and a second
 * pass is ordinary here, because this project tells you not to exclude
 * `node_modules`, so a dependency that ships pre-compiled CSS gets processed
 * again by whoever installs it. The author said don't touch this; that has to
 * outlive one pass.
 *
 * The cost is a comment in the output, which every minifier drops and which is
 * worth reading in a dev build anyway.
 */
function shouldIgnoreDeclaration(declaration: Declaration): boolean {
  if (isComment(declaration.prev(), IGNORE_NEXT)) return true
  const next = declaration.next()
  return (
    isComment(next, IGNORE_LINE) && !String(next.raws.before ?? '').includes('\n')
  )
}

function shouldIgnoreRule(rule: Rule): boolean {
  return isComment(rule.prev(), IGNORE_RULE)
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
  /**
   * `options.atRuleName` folded to lower case, ready to compare against a
   * likewise-folded `AtRule.name`.
   *
   * At-keywords are ASCII case-insensitive in CSS, so a browser reads
   * `@ADAPTIVE pc` as the same rule as `@adaptive pc`. Matching exactly would
   * leave that block unrecognised — and an unrecognised at-rule is not a
   * no-op: browsers drop the whole thing, so the styles inside disappear with
   * nothing reported. Folded once here rather than per node.
   */
  atRuleName: string
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

  const active = context.resolver.forSelector(
    inherited,
    routingSelector(rule.selector),
    context.file,
  )
  warnOnSplitSelectorList(rule, inherited, active, context)
  processContainer(rule, active, context, true)

  if (context.correctsFixed) correctFixedRule(rule)
}

/**
 * Warns when one rule's selector list spans two canvases.
 *
 * `.van-cell, .page-hero { padding: 16px }` has one declaration and therefore
 * one answer, but the two halves want different ones: Vant draws on a 375
 * canvas and the page may not. The first match wins, which means `.page-hero`
 * is quietly scaled by Vant's canvas — a rule that reads as two independent
 * statements silently behaves as one.
 *
 * Warning rather than splitting the rule: splitting is the right fix in the
 * source, but doing it here would rewrite what an author reads back in the
 * output, and the fix is not always mechanical. Naming the problem leaves the
 * decision where it belongs.
 *
 * `:is(.van-cell, .page-hero)` is the same problem one bracket deeper, and it
 * is checked too — the comma is an argument separator rather than a selector
 * boundary, but the ambiguity it creates is identical. What differs is the cost
 * of the fix: `:is()` matches every branch at the specificity of its highest
 * one, so splitting is only free when the branches already agree. That is
 * arithmetic, so the warning does it rather than leaving it to the reader.
 *
 * `:not()` and `:has()` are not checked, because their arguments never reach
 * routing in the first place — see `routingSelector`.
 */
function warnOnSplitSelectorList(
  rule: Rule,
  inherited: ActiveProfile,
  active: ActiveProfile,
  context: ProcessorContext,
): void {
  // `explicit` means `@adaptive` already decided, and that beats every route.
  if (inherited.explicit || !context.resolver.hasSelectorRoutes) return
  if (!rule.selector.includes(',')) return

  const canvasOf = (part: string): string => {
    const resolved = context.resolver.forSelector(
      inherited,
      routingSelector(part),
      context.file,
    )
    return resolved.convert ? resolved.name : '(not converted)'
  }
  const winner = active.convert ? active.name : '(not converted)'
  const disagree = (parts: string[]): string[] =>
    parts.filter((part) => canvasOf(part) !== winner)

  const top = splitSelectorList(rule.selector)
  const strayTop = top.length > 1 ? disagree(top) : []
  if (strayTop.length) {
    context.result.warn(
      `Selector list spans more than one canvas: "${strayTop[0]}" belongs to ` +
        `${canvasOf(strayTop[0]!)} but the whole rule is compiled against ${winner}, ` +
        'because one declaration can only have one result. ' +
        'Split it into separate rules to give each selector its own canvas.',
      { node: rule, plugin: PLUGIN_NAME },
    )
    // The rule already needs splitting; a second warning about the brackets
    // inside one of its branches would just be the same instruction again.
    return
  }

  for (const list of nestedSelectorLists(rule.selector)) {
    const stray = disagree(list.parts)
    if (!stray.length) continue
    const cost = splitIsSpecificityNeutral(list)
      ? `Splitting is specificity-neutral here, since every branch is ${formatSpecificity(specificity(list.parts[0]!))}.`
      : `Splitting is not specificity-neutral: :${list.pseudo}() matches every branch at its highest, ` +
        `${formatSpecificity(highestOf(list.parts))}, so "${stray[0]}" would drop to ` +
        `${formatSpecificity(specificity(stray[0]!))}.`
    context.result.warn(
      `Selector list inside :${list.pseudo}() spans more than one canvas: ` +
        `"${stray[0]}" belongs to ${canvasOf(stray[0]!)} but the whole rule is ` +
        `compiled against ${winner}, because one declaration can only have one result. ` +
        `Give each branch its own rule. ${cost}`,
      { node: rule, plugin: PLUGIN_NAME },
    )
    // One report per rule: the remaining lists have the same cause and the
    // same fix, and a rule buried in warnings gets skipped wholesale.
    return
  }
}

/** Highest specificity among a set of branches, for the warning text. */
function highestOf(parts: readonly string[]): Specificity {
  return parts
    .map(specificity)
    .reduce((best, entry) => (compareSpecificity(entry, best) > 0 ? entry : best))
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
  const lead = `Unknown adaptive profile "${name}". Available profiles: ${available.join(', ')}.`

  // Only the warning describes the surviving at-rule and offers `error`: under
  // `error` the build stops here, so neither sentence is true, and telling
  // someone to switch on the setting they already switched on reads like the
  // message was written for a different situation.
  if (context.options.unknownProfile === 'error') {
    throw atRule.error(lead, { plugin: PLUGIN_NAME })
  }
  if (context.options.unknownProfile === 'warn') {
    context.result.warn(
      `${lead} The @${context.options.atRuleName} block is left as authored, ` +
        'which means browsers will drop it entirely. ' +
        "Set unknownProfile: 'error' to fail the build instead.",
      { node: atRule, plugin: PLUGIN_NAME },
    )
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
  inherited: ActiveProfile,
  context: ProcessorContext,
  declarations: boolean,
): void {
  const name = context.options.atRuleName
  // `@adaptive pc;` — a canvas named but nothing given to it. Rewriting it the
  // usual way produced a bodiless `@media (min-width: 768px);`, which is not
  // valid CSS at all, while the rules the author meant to place on that canvas
  // stayed on the inherited one. Neither half of that is recoverable here, so
  // say what is missing and leave the node exactly as authored: an unknown
  // at-rule parses cleanly and is dropped, where the `@media` did not.
  if (!atRule.nodes) {
    context.result.warn(
      `@${name} ${atRule.params.trim()} has no block, so nothing is compiled ` +
        `against that canvas. Give it one: @${name} ${atRule.params.trim()} { ... }.`,
      { node: atRule, plugin: PLUGIN_NAME },
    )
    return
  }

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
    // Unwrapping is right when the profile says `query: false` — that is the
    // author choosing to switch canvases some other way, usually by building
    // one bundle per target. It is a trap when `query` was simply never set,
    // which is the normal shape for a project that routes canvases by folder:
    // asking for a *different* canvas here reads as "these rules are for that
    // one", and what comes out is unconditional CSS that, being later in the
    // file, wins at every viewport. Nothing else in the build says so.
    if (profile.query === undefined && profileName !== inherited.name) {
      context.result.warn(
        `@${name} ${profileName} compiles against the "${profileName}" canvas but ` +
          `profile "${profileName}" declares no query, so these rules stay ` +
          `unconditional and override the ones around them at every viewport. ` +
          `Give the profile a query (e.g. query: '(min-width: 768px)'), or set ` +
          `query: false to say the switch happens outside CSS.`,
        { node: atRule, plugin: PLUGIN_NAME },
      )
    }
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
    // Everything from here on is a foundation this plugin wrote on an earlier
    // pass. It is always appended last, so stopping is enough — and it must
    // stop, because the foundation's own `max-inline-size: 480px` is a literal
    // cap, not a design-canvas length waiting to be scaled.
    if (node.type === 'comment' && node.text === FOUNDATION_MARKER) return
    if (node.type === 'decl') {
      if (declarations) transformDeclaration(node, active, context)
      continue
    }
    if (node.type === 'rule') {
      transformRule(node, active, context)
      continue
    }
    if (node.type !== 'atrule') continue
    if (node.name.toLowerCase() === context.atRuleName) {
      // Nested in a rule, `@adaptive` wraps that rule's own declarations; at the
      // root it wraps rules. Passing the flag down keeps both readings correct.
      transformAdaptiveAtRule(node, active, context, declarations)
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
  // Already compiled once. Appending again would stack a second copy of every
  // safe-area variable and root cap on top of an identical first.
  if (root.nodes.some((node) => node.type === 'comment' && node.text === FOUNDATION_MARKER)) {
    return
  }
  const css = buildFoundationCss(options)
  if (!css) return
  const foundation = postcss.parse(css, { from: root.source?.input.file })
  // `Root.normalize` copies the preceding node's `before` onto every appended
  // node, flattening the spacing `buildFoundationCss` laid out. Remembering
  // each one and putting it back afterwards is the only way to keep that
  // layout; setting anything up front is overwritten by the append itself.
  const spacing = foundation.nodes.map((node) => node.raws.before)
  const nodes = [...foundation.nodes]
  if (!nodes.length) return

  const separator = root.nodes.length ? '\n\n' : ''
  root.append(foundation.nodes)

  nodes.forEach((node, index) => {
    // A blank line keeps the generated base off the last authored rule. The
    // marker then sits directly on top of what it marks.
    node.raws.before = index === 0 ? separator : spacing[index]
  })
}

export const adaptiveMatrix: PluginCreator<AdaptiveMatrixOptions> = (
  inputOptions = {},
) => {
  const options = resolveOptions(inputOptions)
  const propertyMatches = createPropertyMatcher(options.propList)
  const resolver = createProfileResolver(options)
  const converter = createConverter(options)
  const correctsFixed = wantsFixedCorrection(options)
  const atRuleName = options.atRuleName.toLowerCase()

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
          atRuleName,
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
