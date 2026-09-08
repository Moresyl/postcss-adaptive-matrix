import postcss from 'postcss'

// Child-process fault injection: parsing remains real; only compilation fails.
const processCss = postcss.Processor.prototype.process
postcss.Processor.prototype.process = function (css, options) {
  if (typeof css === 'string' && css.includes('reject-compile-fixture')) {
    throw new Error('fixture compilation rejected')
  }
  return processCss.call(this, css, options)
}
