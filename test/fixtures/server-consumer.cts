import adaptive = require('postcss-adaptive-matrix')

const compile = adaptive.createAdaptiveCompiler()
const pending: Promise<adaptive.AdaptiveCompileResult> = compile('.card { width: 24px }')
void pending
