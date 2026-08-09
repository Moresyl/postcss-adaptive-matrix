import postcss, { type Root } from 'postcss'
import type {
  AdaptiveProfile,
  ResolvedAdaptiveMatrixOptions,
  RootFoundationOptions,
} from './types.js'

function queryDetails(profile: AdaptiveProfile): {
  type: 'media' | 'container'
  condition: string
  name?: string
} | null {
  if (profile.query === false || profile.query == null) return null
  if (typeof profile.query === 'string') {
    return { type: 'media', condition: profile.query }
  }
  return {
    type: profile.query.type ?? 'media',
    condition: profile.query.condition,
    name: profile.query.name,
  }
}

function declarationBlock(rootOptions: RootFoundationOptions): string {
  const declarations = ['inline-size: 100%']
  if (rootOptions.center ?? true) declarations.push('margin-inline: auto')
  if (rootOptions.container) {
    const name = rootOptions.containerName ?? 'adaptive-root'
    declarations.push(`container: ${name} / inline-size`)
  }
  return declarations.join('; ')
}

export function appendFoundation(
  root: Root,
  options: ResolvedAdaptiveMatrixOptions,
): void {
  if (!options.root) return
  const rootOptions = options.root
  const rules: string[] = [
    `:where(${rootOptions.selector}) { ${declarationBlock(rootOptions)}; }`,
  ]

  if (rootOptions.safeAreaVariables ?? true) {
    rules.push(
      ':root { --adaptive-safe-top: env(safe-area-inset-top, 0px); --adaptive-safe-right: env(safe-area-inset-right, 0px); --adaptive-safe-bottom: env(safe-area-inset-bottom, 0px); --adaptive-safe-left: env(safe-area-inset-left, 0px); }',
    )
  }

  for (const profile of Object.values(options.profiles)) {
    if (profile.rootMaxWidth == null) continue
    const detail = queryDetails(profile)
    const widthRule = `:where(${rootOptions.selector}) { max-inline-size: ${profile.rootMaxWidth}px; }`
    if (!detail) {
      rules.push(widthRule)
      continue
    }
    const name = detail.type === 'container' && detail.name ? `${detail.name} ` : ''
    rules.push(`@${detail.type} ${name}${detail.condition} { ${widthRule} }`)
  }

  const layer = rootOptions.layer === undefined ? 'adaptive-matrix' : rootOptions.layer
  const css = layer ? `@layer ${layer} { ${rules.join(' ')} }` : rules.join(' ')
  const foundation = postcss.parse(css, { from: root.source?.input.file })
  root.append(foundation.nodes)
}

export function adaptiveQueryParams(profile: AdaptiveProfile): {
  name: 'media' | 'container'
  params: string
} | null {
  const detail = queryDetails(profile)
  if (!detail) return null
  const prefix = detail.name && detail.type === 'container' ? `${detail.name} ` : ''
  return { name: detail.type, params: `${prefix}${detail.condition}` }
}
