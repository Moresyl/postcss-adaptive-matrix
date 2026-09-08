import { describe, expect, it } from 'vitest'
import { verifyConversion } from '../bench/verify-conversion.js'

const files = [{ css: '.a { --one: 12px; --two: 24px }', from: 'bench.css' }]

describe('benchmark conversion preflight', () => {
  it('rejects a no-op plugin instead of reporting skipped work as fast', async () => {
    await expect(verifyConversion({ postcssPlugin: 'noop', Once() {} }, files)).rejects.toThrow(
      'Unconverted benchmark value',
    )
  })

  it('counts converted declarations across files', async () => {
    await expect(
      verifyConversion(
        {
          postcssPlugin: 'convert',
          Once(root) {
            root.walkDecls((declaration) => {
              declaration.value = 'calc(1vw)'
            })
          },
        },
        [...files, ...files],
      ),
    ).resolves.toBe(4)
  })

  it('rejects dropped declarations', async () => {
    await expect(
      verifyConversion(
        {
          postcssPlugin: 'drop',
          Once: (root) => {
            root.removeAll()
          },
        },
        files,
      ),
    ).rejects.toThrow('lost declarations')
  })
})
