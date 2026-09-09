import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const built = existsSync(new URL('../dist/index.d.cts', import.meta.url))
describe.skipIf(!built)('consumer type resolution', () => {
  it.each([false, true])(
    'typechecks NodeNext consumers with exactOptionalPropertyTypes=%s',
    (exactOptionalPropertyTypes) => {
      const files = ['consumer.mts', 'consumer.cts'].map((file) =>
        fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)),
      )
      const program = ts.createProgram(files, {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        exactOptionalPropertyTypes,
        noEmit: true,
        skipLibCheck: false,
        types: ['node'],
      })
      const diagnostics = ts.getPreEmitDiagnostics(program)
      const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getCanonicalFileName: (file) => file,
        getNewLine: () => '\n',
      })
      expect(diagnostics.length, formatted).toBe(0)
      // A real TypeScript program with dependency declarations is materially more
      // expensive under coverage than an ordinary unit test on a loaded CI runner.
    },
    30000,
  )
})
