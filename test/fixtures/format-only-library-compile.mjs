import postcss from 'postcss'

// Replace compilation with an idempotent formatting-only pass.
const processCss = postcss.Processor.prototype.process
postcss.Processor.prototype.process = function (css, options) {
  const processor = postcss([
    {
      postcssPlugin: 'format-only-fixture',
      Once(root) {
        root.raws.after = '\n'
      },
    },
  ])
  return processCss.call(processor, css, options)
}
