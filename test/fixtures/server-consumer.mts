import { compileAdaptiveCss, createAdaptiveCompiler } from 'postcss-adaptive-matrix'

const compile = createAdaptiveCompiler({ profiles: { app: 375 } })
const result = await compile('.card { width: 24px }', {
  targets: { safari: 14 },
  process: { from: 'card.css' },
})
const css: string = result.css
void css
await compileAdaptiveCss('')
