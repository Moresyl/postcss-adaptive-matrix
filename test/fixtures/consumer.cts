import adaptiveMatrix = require('postcss-adaptive-matrix')
import runtime = require('postcss-adaptive-matrix/runtime')

adaptiveMatrix()
adaptiveMatrix({ profiles: { app: 375 } })
runtime.observeAdaptiveViewport().destroy()
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
