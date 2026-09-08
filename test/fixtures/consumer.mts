import adaptiveMatrix, {
  compileAdaptiveCss,
  createAdaptiveCompiler,
  type AdaptiveCompileOptions,
  type AdaptiveCompileResult,
  type AdaptiveCompileGate,
} from 'postcss-adaptive-matrix'
import { observeAdaptiveViewport } from 'postcss-adaptive-matrix/runtime'

adaptiveMatrix()
adaptiveMatrix({ profiles: { app: { designWidth: 375, fluid: { maxWidth: 600 } } } })
observeAdaptiveViewport().destroy()
const request: AdaptiveCompileOptions = { targets: { safari: 14 }, failOn: ['compatibility'] }
const compile = createAdaptiveCompiler()
const output: AdaptiveCompileResult = await compile('.a { width: 24px }', request)
const gate: AdaptiveCompileGate | null = output.gate
void gate
await compileAdaptiveCss('')
// @ts-expect-error unknown gate categories must not be accepted
await compile('', { failOn: ['security'] })
// @ts-expect-error CSS input remains required
await compileAdaptiveCss()
