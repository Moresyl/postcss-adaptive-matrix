/**
 * Refreshes the `conformance/cases/atomic/*` inputs from real framework output.
 *
 * Those fixtures pin how this compiler treats Tailwind CSS and UnoCSS, and the
 * only trustworthy input is what the frameworks actually emit — their output
 * shape changed completely between major versions, from literal `rem` lengths
 * to a scale hidden behind theme tokens. Guessing at it in a hand-written
 * fixture would pin the guess.
 *
 * The frameworks are not devDependencies: they would tie `npm test` to someone
 * else's release cadence for no extra signal, since the captured CSS is the
 * whole input. Install them where you run this:
 *
 *   npm i --no-save tailwindcss @tailwindcss/postcss unocss
 *   node scripts/capture-atomic.mjs
 *
 * Then regenerate the expectations and read the diff:
 *
 *   UPDATE_CONFORMANCE=1 npm test
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'

const CASES = join(dirname(fileURLToPath(import.meta.url)), '..', 'conformance', 'cases', 'atomic')

/**
 * One of each shape that behaves differently, and nothing else.
 *
 * `p-4` and `gap-8` read the spacing scale, `max-w-md` and `rounded-lg` read a
 * token directly, `text-lg` and `leading-7` carry the type scale, `border` is a
 * hairline that must survive, `border-2` is a real length that must not, and
 * `p-[13px]` is the escape hatch back to literal pixels.
 */
const CLASSES = 'p-4 px-6 gap-8 text-lg leading-7 w-64 max-w-md rounded-lg border border-2 p-[13px]'

const version = (pkg) =>
  JSON.parse(readFileSync(join('node_modules', pkg, 'package.json'), 'utf8')).version

function write(name, source, css) {
  mkdirSync(join(CASES, name), { recursive: true })
  writeFileSync(
    join(CASES, name, 'input.css'),
    `/* Captured from ${source}. Regenerate with scripts/capture-atomic.mjs. */\n${css.trim()}\n`,
    'utf8',
  )
  console.log(`  ${name}  <-  ${source}`)
}

const { default: tailwind } = await import('@tailwindcss/postcss')
const { createGenerator } = await import('unocss')

// The theme and utility layers, without the reset. The reset is a page-wide
// concern shared with every other stylesheet and tests nothing about how an
// atomic scale is read; including it would bury the fixture in a thousand
// columns of vendor-prefixed normalisation.
const tailwindOut = await postcss([tailwind()]).process(
  [
    '@theme { --default-font-family: initial; }',
    '@layer theme, utilities;',
    '@import "tailwindcss/theme.css" layer(theme);',
    // `source(none)` matters: without it Tailwind scans the working directory
    // for anything class-shaped, so the fixture would depend on where the
    // script was run from and on unrelated files in this repository.
    '@import "tailwindcss/utilities.css" layer(utilities) source(none);',
    `@source inline("${CLASSES}");`,
  ].join('\n'),
  { from: join(process.cwd(), 'capture.css') },
)
write('tailwind-v4', `Tailwind CSS ${version('tailwindcss')}`, tailwindOut.css)

for (const [name, entry] of [
  ['unocss-wind3', '@unocss/preset-wind3'],
  ['unocss-wind4', '@unocss/preset-wind4'],
]) {
  const { default: preset } = await import(entry)
  const generator = await createGenerator({ presets: [preset()] })
  const { css } = await generator.generate(CLASSES, { preflights: true })
  // Same reasoning as above: keep the theme layer, drop the reset.
  const trimmed = css
    .split(/(?=\/\* layer: )/)
    .filter((layer) => !layer.startsWith('/* layer: base */'))
    .join('')
  write(name, `UnoCSS ${version('unocss')} ${entry.split('/').pop()}`, trimmed)
}
