import adaptiveMatrix, {
  compileAdaptiveCss,
  createAdaptiveCompiler,
  findContinuityIssues,
  type AdaptiveCompileOptions,
  type AdaptiveCompileResult,
  type AdaptiveCompileGate,
} from 'postcss-adaptive-matrix'
import { observeAdaptiveViewport } from 'postcss-adaptive-matrix/runtime'

adaptiveMatrix()
adaptiveMatrix({})
adaptiveMatrix({ profiles: { app: 375 } })
adaptiveMatrix({ profiles: { app: { designWidth: 375 } } })
adaptiveMatrix({ profiles: { app: { designWidth: 375, fluid: {} } } })
adaptiveMatrix({ profiles: { app: { designWidth: 375, fluid: { minWidth: 320 } } } })
adaptiveMatrix({ profiles: { app: { designWidth: 375, fluid: { maxWidth: 600 } } } })
// @ts-expect-error a custom canvas still needs its design measurement
adaptiveMatrix({ profiles: { app: { fluid: {} } } })
// @ts-expect-error optional does not accept CSS strings in numeric bounds
adaptiveMatrix({ profiles: { app: { designWidth: 375, fluid: { minWidth: '320px' } } } })
// @ts-expect-error optional does not accept null instead of a numeric bound
adaptiveMatrix({ profiles: { app: { designWidth: 375, fluid: { maxWidth: null } } } })
observeAdaptiveViewport().destroy()
observeAdaptiveViewport({}).destroy()
observeAdaptiveViewport({ signal: new AbortController().signal }).destroy()
observeAdaptiveViewport({ prefix: 'shell' }).destroy()
// @ts-expect-error omission does not permit null signals
observeAdaptiveViewport({ signal: null })
// @ts-expect-error abort controllers must supply their signal
observeAdaptiveViewport({ signal: new AbortController() })
// @ts-expect-error viewport options are closed, not an arbitrary property bag
observeAdaptiveViewport({ windw: window })
const request: AdaptiveCompileOptions = { targets: { safari: 14 }, failOn: ['compatibility'] }
const compile = createAdaptiveCompiler()
const output: AdaptiveCompileResult = await compile('.a { width: 24px }', request)
const gate: AdaptiveCompileGate | null = output.gate
findContinuityIssues(output.result.root)
void gate
await compileAdaptiveCss('')
// @ts-expect-error unknown gate categories must not be accepted
await compile('', { failOn: ['security'] })
// @ts-expect-error CSS input remains required
await compileAdaptiveCss()
