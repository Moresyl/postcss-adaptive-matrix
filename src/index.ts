import type {
  AtRule,
  ChildNode,
  Comment,
  Container,
  Declaration,
  PluginCreator,
  Result,
  Root,
  Rule,
} from 'postcss'
import { convertValue } from './convert.js'
import { adaptiveQueryParams, appendFoundation } from './foundation.js'
import {
  createPropertyMatcher,
  matchesAnyPattern,
  matchesFile,
} from './matchers.js'
import { resolveOptions } from './options.js'
import { appPcPreset, presets } from './presets.js'
import type {
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  ResolvedAdaptiveMatrixOptions,
} from './types.js'

const PLUGIN_NAME = 'postcss-adaptive-matrix'
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
  propertyMatches: (property: string) => boolean
}

function transformDeclaration(
  declaration: Declaration,
  profileName: string,
  profile: AdaptiveProfile,
  context: ProcessorContext,
): void {
  const { options, file } = context
  if (
    declaration.value.toLowerCase().indexOf(options.unitToConvert.toLowerCase()) ===
      -1 ||
    (!options.transformCustomProperties && declaration.prop.startsWith('--')) ||
    !context.propertyMatches(declaration.prop) ||
    matchesAnyPattern(options.valueExclude, declaration.value) ||
    shouldIgnoreDeclaration(declaration)
  ) {
    return
  }

  const converted = convertValue(
    declaration.value,
    declaration.prop,
    profileName,
    profile,
    options,
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

function transformRule(
  rule: Rule,
  profileName: string,
  profile: AdaptiveProfile,
  context: ProcessorContext,
): void {
  if (
    shouldIgnoreRule(rule) ||
    matchesAnyPattern(context.options.selectorExclude, rule.selector)
  ) {
    return
  }
  for (const node of [...rule.nodes]) {
    if (node.type === 'decl') {
      transformDeclaration(node, profileName, profile, context)
    } else if (node.type === 'rule') {
      transformRule(node, profileName, profile, context)
    } else if (node.type === 'atrule' && node.nodes) {
      processContainer(node, profileName, profile, context)
    }
  }
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

  processContainer(atRule, profileName, profile, context)
  const query = adaptiveQueryParams(profile)
  if (!query) {
    atRule.replaceWith(...(atRule.nodes ?? []))
    return
  }
  atRule.name = query.name
  atRule.params = query.params
}

function processContainer(
  container: Container,
  profileName: string,
  profile: AdaptiveProfile,
  context: ProcessorContext,
): void {
  for (const node of [...(container.nodes ?? [])]) {
    if (node.type === 'rule') {
      transformRule(node, profileName, profile, context)
      continue
    }
    if (node.type !== 'atrule') continue
    if (node.name === context.options.atRuleName) {
      transformAdaptiveAtRule(node, context)
    } else if (node.nodes) {
      processContainer(node, profileName, profile, context)
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

export const adaptiveMatrix: PluginCreator<AdaptiveMatrixOptions> = (
  inputOptions = {},
) => {
  const options = resolveOptions(inputOptions)
  const propertyMatches = createPropertyMatcher(options.propList)

  return {
    postcssPlugin: PLUGIN_NAME,
    Once(root: Root, { result }) {
      const file = root.source?.input.file ?? result.opts.from?.toString() ?? ''
      if (!shouldProcessFile(file, options)) return
      const profile = options.profiles[options.defaultProfile]!
      processContainer(root, options.defaultProfile, profile, {
        file,
        options,
        propertyMatches,
        result,
      })
      appendFoundation(root, options)
    },
  }
}

adaptiveMatrix.postcss = true

export function defineConfig<T extends AdaptiveMatrixOptions>(config: T): T {
  return config
}

export { appPcPreset, presets }
export type {
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  AdaptiveQuery,
  AppPcPresetOptions,
  FileMatcher,
  OutputStrategy,
  Pattern,
  ProfileContext,
  QueryType,
  RootFoundationOptions,
  ScaleUnit,
} from './types.js'

export default adaptiveMatrix
