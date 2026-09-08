import assert from 'node:assert/strict'
import postcss, { type AcceptedPlugin } from 'postcss'

/** Untimed preflight: retain declarations and prove conversion actually ran. */
export async function verifyConversion(
  plugin: AcceptedPlugin,
  files: readonly { css: string; from: string }[],
  mode: 'all' | 'some' = 'all',
): Promise<number> {
  const processor = postcss([plugin])
  let count = 0
  for (const file of files) {
    const original: { prop: string; value: string }[] = []
    postcss.parse(file.css).walkDecls((declaration) => {
      original.push({ prop: declaration.prop, value: declaration.value })
    })
    const result = await processor.process(file.css, { from: file.from })
    // The mixed application corpus intentionally includes media rules outside
    // the default canvas range, exercising diagnostics as part of the workload.
    // The all-converted custom-property corpus must remain warning-free.
    if (mode === 'all') {
      assert.equal(result.warnings().length, 0, `Unexpected benchmark warning in ${file.from}`)
    }
    let index = 0
    let converted = 0
    result.root.walkDecls((declaration) => {
      const before = original[index++]
      assert.ok(before, `Unexpected extra benchmark declaration in ${file.from}`)
      assert.equal(declaration.prop, before.prop, `Benchmark property changed in ${file.from}`)
      if (declaration.value !== before.value) converted++
      if (mode === 'all')
        assert.notEqual(
          declaration.value,
          before.value,
          `Unconverted benchmark value: ${before.prop}`,
        )
    })
    assert.equal(index, original.length, `Benchmark lost declarations in ${file.from}`)
    assert.ok(converted > 0, `No benchmark values converted in ${file.from}`)
    count += converted
  }
  assert.ok(count > 0, 'Benchmark conversion preflight received no declarations')
  return count
}
