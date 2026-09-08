import { describe, expect, it } from 'vitest'
import type { Declaration, Root } from 'postcss'
import { verifyConversion } from '../bench/verify-conversion.js'

const files = [{ css: '.a { --one: 12px; --two: 24px }', from: 'bench.css' }]

describe('benchmark conversion preflight', () => {
  it('rejects partial conversion and changes to deliberately inert properties', async () => {
    const mixed = [{ css: '.a { padding: 12px; margin: 24px; color: red }', from: 'mixed.css' }]
    for (const changed of [['padding'], ['padding', 'margin', 'color']]) {
      const plugin = {
        postcssPlugin: 'incorrect',
        Once(root: Root) {
          root.walkDecls((decl) => {
            if (changed.includes(decl.prop)) decl.value = '1vw'
          })
        },
      }
      await expect(verifyConversion(plugin, mixed, 'some', ['padding', 'margin'])).rejects.toThrow(
        'Unexpected conversion state',
      )
    }
  })

  it('allows inert declarations but requires actual conversion in every mixed file', async () => {
    const plugin = {
      postcssPlugin: 'mixed',
      Declaration: {
        padding(declaration: Declaration) {
          declaration.value = '1vw'
        },
      },
    }
    const mixed = [{ css: '.a { padding: 12px; color: red }', from: 'mixed.css' }]
    await expect(verifyConversion(plugin, mixed, 'some')).resolves.toBe(1)
    await expect(
      verifyConversion(plugin, [...mixed, { css: '.b { color: red }', from: 'inert.css' }], 'some'),
    ).rejects.toThrow('No benchmark values converted in inert.css')
    await expect(
      verifyConversion({ postcssPlugin: 'noop', Once() {} }, mixed, 'some'),
    ).rejects.toThrow('No benchmark values converted')
  })

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
