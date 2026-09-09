import adaptiveMatrix = require('postcss-adaptive-matrix')
import runtime = require('postcss-adaptive-matrix/runtime')

adaptiveMatrix()
adaptiveMatrix({})
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
adaptiveMatrix({ profiles: { app: 375 } })
runtime.observeAdaptiveViewport().destroy()
runtime.observeAdaptiveViewport({}).destroy()
runtime.observeAdaptiveViewport({ signal: new AbortController().signal }).destroy()
runtime.observeAdaptiveViewport({ prefix: 'shell' }).destroy()
// @ts-expect-error omission does not permit null signals
runtime.observeAdaptiveViewport({ signal: null })
// @ts-expect-error abort controllers must supply their signal
runtime.observeAdaptiveViewport({ signal: new AbortController() })
// @ts-expect-error viewport options are closed, not an arbitrary property bag
runtime.observeAdaptiveViewport({ windw: window })
const request: adaptiveMatrix.AdaptiveCompileOptions = { failOn: ['warnings'] }
const compile = adaptiveMatrix.createAdaptiveCompiler()
const pending: Promise<adaptiveMatrix.AdaptiveCompileResult> = compile('', request)
void pending
const single: Promise<adaptiveMatrix.AdaptiveCompileResult> = adaptiveMatrix.compileAdaptiveCss('')
void single
// @ts-expect-error unknown gate categories must not be accepted
void compile('', { failOn: ['security'] })
// @ts-expect-error CSS input remains required
void adaptiveMatrix.compileAdaptiveCss()
