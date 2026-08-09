import { ROOT_GUTTER_VARIABLE, ROOT_WIDTH_VARIABLE } from './fixed.js'
import type {
  AdaptiveProfile,
  ResolvedAdaptiveMatrixOptions,
  RootFoundationOptions,
} from './types.js'

const INDENT = '  '

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

function indent(css: string, depth: number): string {
  if (depth === 0) return css
  const pad = INDENT.repeat(depth)
  return css
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n')
}

function block(prelude: string, body: string[], depth = 0): string {
  return indent(`${prelude} {\n${body.map((line) => INDENT + line).join('\n')}\n}`, depth)
}

function rootDeclarations(rootOptions: RootFoundationOptions): string[] {
  const declarations = ['inline-size: 100%;']
  if (rootOptions.center ?? true) declarations.push('margin-inline: auto;')
  if (rootOptions.container) {
    const name = rootOptions.containerName ?? 'adaptive-root'
    declarations.push(`container: ${name} / inline-size;`)
  }
  return declarations
}

/**
 * Renders the opt-in root base stylesheet, or null when no root is configured.
 * Returns text rather than nodes so the core stays independent of any CSS AST.
 */
export function buildFoundationCss(
  options: ResolvedAdaptiveMatrixOptions,
): string | null {
  if (!options.root) return null
  const rootOptions = options.root
  const selector = `:where(${rootOptions.selector})`
  const rules: string[] = [block(selector, rootDeclarations(rootOptions))]

  if (rootOptions.safeAreaVariables ?? true) {
    rules.push(
      block(':root', [
        '--adaptive-safe-top: env(safe-area-inset-top, 0px);',
        '--adaptive-safe-right: env(safe-area-inset-right, 0px);',
        '--adaptive-safe-bottom: env(safe-area-inset-bottom, 0px);',
        '--adaptive-safe-left: env(safe-area-inset-left, 0px);',
      ]),
    )
  }

  // Published before any profile narrows it, so the gutter is `0px` until a
  // profile actually constrains the column. That is what makes the fixed
  // correction inert on phones instead of merely small.
  const correctsFixed = Boolean(rootOptions.fixedContainingBlock)
  if (correctsFixed) {
    rules.push(
      block(':root', [
        `${ROOT_WIDTH_VARIABLE}: 100vw;`,
        `${ROOT_GUTTER_VARIABLE}: max(0px, (100vw - var(${ROOT_WIDTH_VARIABLE})) / 2);`,
      ]),
    )
  }

  for (const profile of Object.values(options.profiles)) {
    if (profile.rootMaxWidth == null) continue
    const detail = queryDetails(profile)
    const declarations = [`max-inline-size: ${profile.rootMaxWidth}px;`]
    const scoped = correctsFixed
      ? [
          block(selector, declarations, detail ? 1 : 0),
          block(':root', [`${ROOT_WIDTH_VARIABLE}: ${profile.rootMaxWidth}px;`], detail ? 1 : 0),
        ].join('\n\n')
      : block(selector, declarations, detail ? 1 : 0)

    if (!detail) {
      rules.push(scoped)
      continue
    }
    const name = detail.type === 'container' && detail.name ? `${detail.name} ` : ''
    rules.push(`@${detail.type} ${name}${detail.condition} {\n${scoped}\n}`)
  }

  const layer = rootOptions.layer === undefined ? 'adaptive-matrix' : rootOptions.layer
  const body = rules.join('\n\n')
  return layer ? `@layer ${layer} {\n${indent(body, 1)}\n}` : body
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
