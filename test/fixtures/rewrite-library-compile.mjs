import postcss from 'postcss'

// An idempotent but incorrect first-pass rewrite of an exempt library.
const processCss = postcss.Processor.prototype.process
postcss.Processor.prototype.process = function (css, options) {
  return processCss.call(this, typeof css === 'string' ? css.replace('24px', '25px') : css, options)
}
