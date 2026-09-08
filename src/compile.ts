import postcss, { type ProcessOptions, type Result, type Warning } from 'postcss'
import { adaptiveMatrix } from './postcss/plugin.js'
import { auditCompatibility, type CompatAudit } from './core/compat.js'
import type { AdaptiveMatrixOptions } from './core/types.js'
import { isPlainObject, rejectUnknownKeys } from './core/validation.js'

export interface AdaptiveCompileOptions {
  /** PostCSS paths, parser and source-map options. */
  process?: ProcessOptions
  /** Optional oldest browser versions to audit against. */
  targets?: Readonly<Record<string, string | number>>
}

export interface AdaptiveCompileResult {
  css: string
  map: Result['map']
  warnings: Warning[]
  compatibility: CompatAudit | null
  /** Full PostCSS result for downstream AST processing and messages. */
  result: Result
}

/** Reuse one compiler configuration across files; per-file rulers still refresh. */
export function createAdaptiveCompiler(options: AdaptiveMatrixOptions = {}) {
  const processor = postcss([adaptiveMatrix(options)])
  return async function compile(
    css: string,
    request: AdaptiveCompileOptions = {},
  ): Promise<AdaptiveCompileResult> {
    if (typeof css !== 'string') throw new TypeError('CSS input must be a string.')
    if (!isPlainObject(request)) throw new TypeError('Compile options must be an object.')
    rejectUnknownKeys('compile options', request, ['process', 'targets'])
    if (request.process !== undefined && !isPlainObject(request.process)) {
      throw new TypeError('Compile options.process must be a PostCSS options object.')
    }
    // Validate before compiling so invalid targets do not invoke user callbacks.
    const suppliedTargets = request.targets as Readonly<Record<string, string | number>> | undefined
    if (suppliedTargets !== undefined && !isPlainObject(suppliedTargets)) {
      throw new TypeError('Compile options.targets must be a browser target object.')
    }
    // Capture the same target set for validation and the post-await audit.
    // Otherwise mutating a shared request could silently change its verdict.
    const targets = suppliedTargets === undefined ? undefined : { ...suppliedTargets }
    if (targets !== undefined) auditCompatibility('', targets)
    const result = await processor.process(css, { from: undefined, ...request.process })
    return {
      css: result.css,
      map: result.map,
      warnings: result.warnings(),
      compatibility: targets === undefined ? null : auditCompatibility(result.css, targets),
      result,
    }
  }
}

/** Compile one stylesheet without manually wiring a PostCSS processor. */
export async function compileAdaptiveCss(
  css: string,
  options: AdaptiveMatrixOptions = {},
  request: AdaptiveCompileOptions = {},
): Promise<AdaptiveCompileResult> {
  return createAdaptiveCompiler(options)(css, request)
}
