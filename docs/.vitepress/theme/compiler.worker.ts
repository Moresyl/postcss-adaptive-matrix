import postcss from 'postcss'
import * as matrix from '../../../src/index'

// Configuration is authored JavaScript. Run it away from the document so the
// UI can terminate a slow compilation, including a non-terminating callback.
const names = Object.keys(matrix).filter((name) => name !== 'default')
const values = names.map((name) => (matrix as Record<string, unknown>)[name])

self.onmessage = (event: MessageEvent<{ css: string; options: string }>) => {
  try {
    const start = performance.now()
    // Authored JavaScript expressions are an intentional playground feature.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const build = new Function(...names, `"use strict"; return (${event.data.options});`) as (
      ...helpers: unknown[]
    ) => unknown
    const config = build(...values) as matrix.AdaptiveMatrixOptions
    const result = postcss([matrix.adaptiveMatrix(config)]).process(event.data.css, {
      from: 'playground.css',
    })
    const css = result.css
    self.postMessage({
      css,
      warnings: result.warnings().map((warning) => ({ text: warning.text })),
      duration: performance.now() - start,
    })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
