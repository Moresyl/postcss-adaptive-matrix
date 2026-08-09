/**
 * Synthetic corpora shaped like the stylesheets this compiler actually meets.
 *
 * Generated rather than vendored so the benchmark stays dependency-free and
 * every run measures the same bytes. The mix of convertible and inert
 * declarations matters more than the exact selectors: the cheap-rejection path
 * only looks good if most declarations really are inert, which is true of real
 * stylesheets.
 */

const COLORS = ['#fff', '#1f2933', 'rgba(0, 0, 0, .32)', 'currentColor'] as const
const SPACES = [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const
const FONTS = [12, 13, 14, 16, 18, 20, 24, 28, 32] as const

/**
 * Indexes a non-empty table by wrapping.
 *
 * The assertion is what `noUncheckedIndexedAccess` cannot see: the modulo keeps
 * the index inside a tuple the compiler already knows is non-empty.
 */
function cycle<T>(table: readonly T[], index: number): T {
  return table[index % table.length] as T
}

/** Declarations with no length at all — the majority in most real sheets. */
function inertDeclarations(index: number): string[] {
  return [
    `color: ${cycle(COLORS, index)};`,
    'display: flex;',
    'align-items: center;',
    `background-color: ${cycle(COLORS, index + 1)};`,
    'transition: opacity .2s ease;',
    'text-overflow: ellipsis;',
  ]
}

function lengthDeclarations(index: number): string[] {
  const pad = cycle(SPACES, index)
  const gap = cycle(SPACES, index + 3)
  const font = cycle(FONTS, index)
  return [
    `padding: ${pad}px ${gap}px;`,
    `margin-block: ${gap}px;`,
    `font-size: ${font}px;`,
    `line-height: ${font + 6}px;`,
    `border-radius: ${cycle(SPACES, index + 5)}px;`,
    'border: 1px solid;',
    `width: calc(100% - ${pad * 2}px);`,
    `box-shadow: 0 ${gap}px ${gap * 2}px rgba(0, 0, 0, .08);`,
  ]
}

/** A component-library-shaped sheet: many small rules, heavy length usage. */
export function componentLibrary(ruleCount: number): string {
  const rules: string[] = []
  for (let index = 0; index < ruleCount; index += 1) {
    const body = [...lengthDeclarations(index), ...inertDeclarations(index)]
    rules.push(`.ui-component-${index} {\n  ${body.join('\n  ')}\n}`)
    rules.push(
      `.ui-component-${index}__label {\n  ${inertDeclarations(index).join('\n  ')}\n}`,
    )
  }
  return rules.join('\n\n')
}

/** A utility-framework-shaped sheet: enormous rule count, one declaration each. */
export function utilityFramework(ruleCount: number): string {
  const rules: string[] = []
  for (let index = 0; index < ruleCount; index += 1) {
    rules.push(`.p-${index} { padding: ${cycle(SPACES, index)}px }`)
    rules.push(`.text-${index} { color: ${cycle(COLORS, index)} }`)
  }
  return rules.join('\n')
}

/** An application sheet: nesting, media queries and mixed content. */
export function application(ruleCount: number): string {
  const rules: string[] = []
  for (let index = 0; index < ruleCount; index += 1) {
    rules.push(`.page-${index} {
  ${lengthDeclarations(index).join('\n  ')}

  & .title {
    font-size: ${cycle(FONTS, index)}px;
    letter-spacing: 1px;
  }

  &:hover { background-image: url('/assets/bg-16px.png') }
}

@media (min-width: 768px) {
  .page-${index} { padding: ${cycle(SPACES, index + 2)}px }
}`)
  }
  return rules.join('\n\n')
}

export interface Corpus {
  name: string
  css: string
}

export const CORPORA: Corpus[] = [
  { name: 'component-library', css: componentLibrary(600) },
  { name: 'utility-framework', css: utilityFramework(4000) },
  { name: 'application', css: application(400) },
]
