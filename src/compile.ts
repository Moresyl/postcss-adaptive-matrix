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
  /** Optional build gate. Compatibility gates require targets. */
  failOn?: AdaptiveCompileGateCategory | readonly AdaptiveCompileGateCategory[]
}

export type AdaptiveCompileGateCategory = 'warnings' | 'compatibility'

export interface AdaptiveCompileGate {
  failOn: AdaptiveCompileGateCategory[]
  passed: boolean
}

export interface AdaptiveCompileResult {
  css: string
  map: Result['map']
  warnings: Warning[]
  compatibility: CompatAudit | null
  /** Null unless a nonempty failOn list was requested; compilation still succeeds. */
  gate: AdaptiveCompileGate | null
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
    rejectUnknownKeys('compile options', request, ['process', 'targets', 'failOn'])
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
    const suppliedGate = request.failOn
    const categories: readonly unknown[] =
      suppliedGate === undefined ? [] : Array.isArray(suppliedGate) ? suppliedGate : [suppliedGate]
    if (
      Array.from(categories).some(
        (category) => category !== 'warnings' && category !== 'compatibility',
      )
    ) {
      throw new TypeError(
        'Compile options.failOn must be warnings, compatibility, or an array of these categories.',
      )
    }
    const failOn = [...new Set(categories as readonly AdaptiveCompileGateCategory[])]
    if (failOn.includes('compatibility') && targets === undefined) {
      throw new TypeError('Compile options.failOn compatibility requires targets.')
    }
    const processOptions: ProcessOptions = { from: undefined, ...request.process }
    // Syntax hooks are read again during deferred stringification. Capture
    // both hooks while retaining the function objects supplied by the caller.
    if (processOptions.syntax && typeof processOptions.syntax === 'object') {
      processOptions.syntax = {
        ...processOptions.syntax,
        parse: processOptions.syntax.parse,
        stringify: processOptions.syntax.stringify,
      }
    }
    if (processOptions.stringifier && typeof processOptions.stringifier === 'object') {
      processOptions.stringifier = {
        ...processOptions.stringifier,
        stringify: processOptions.stringifier.stringify,
      }
    }
    // PostCSS consumes map settings during deferred stringification. Capture
    // the option bag, while preserving parser and previous-map object identity.
    if (processOptions.map && typeof processOptions.map === 'object') {
      processOptions.map = { ...processOptions.map }
    }
    const result = await processor.process(css, processOptions)
    const warnings = result.warnings()
    const compatibility = targets === undefined ? null : auditCompatibility(result.css, targets)
    return {
      css: result.css,
      map: result.map,
      warnings,
      compatibility,
      gate:
        failOn.length === 0
          ? null
          : {
              failOn,
              passed: !(
                (failOn.includes('warnings') && warnings.length > 0) ||
                (failOn.includes('compatibility') &&
                  ((compatibility?.findings.length ?? 0) > 0 ||
                    (compatibility?.unknownBrowsers.length ?? 0) > 0))
              ),
            },
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
