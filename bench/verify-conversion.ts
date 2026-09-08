import assert from 'node:assert/strict'
import postcss, { type AcceptedPlugin } from 'postcss'

/** Untimed preflight for corpora where every declaration must be converted. */
export async function verifyConversion(
  plugin: AcceptedPlugin,
  files: readonly { css: string; from: string }[],
): Promise<number> {
  const processor = postcss([plugin])
  let count = 0
  for (const file of files) {
    const original: { prop: string; value: string }[] = []
    postcss.parse(file.css).walkDecls((declaration) => {
      original.push({ prop: declaration.prop, value: declaration.value })
    })
    const result = await processor.process(file.css, { from: file.from })
    assert.equal(result.warnings().length, 0, `Unexpected benchmark warning in ${file.from}`)
    let index = 0
    result.root.walkDecls((declaration) => {
      const before = original[index++]
      assert.ok(before, `Unexpected extra benchmark declaration in ${file.from}`)
      assert.equal(declaration.prop, before.prop, `Benchmark property changed in ${file.from}`)
      assert.notEqual(
        declaration.value,
        before.value,
        `Unconverted benchmark value: ${before.prop}`,
      )
    })
    assert.equal(index, original.length, `Benchmark lost declarations in ${file.from}`)
    count += index
  }
  assert.ok(count > 0, 'Benchmark conversion preflight received no declarations')
  return count
}
