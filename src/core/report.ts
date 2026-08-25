import type { CompatAudit } from './compat.js'
import type { ContinuityIssue } from './continuity.js'

/** Schema version written by `adaptive-matrix --json`. */
export const CLI_REPORT_FORMAT_VERSION = 1 as const

export interface CliDeclarationChange {
  context: string
  prop: string
  /** Null means the compiler generated the declaration. */
  before: string | null
  after: string
}

export interface CliCompatibilityReport {
  findings: Array<{
    id: string
    title: string
    sample: string
    emittedBy: string
    failure: string
    fallback: string
    shortfalls: CompatAudit['findings'][number]['shortfalls']
  }>
  satisfied: CompatAudit['satisfied']
  unknownBrowsers: string[]
}

export interface CliFileReport {
  /** Path displayed by the CLI, relative to its working directory when possible. */
  file: string
  converted: number
  unchanged: number
  /** Converted declarations only unless the command also receives `--all`. */
  changes: CliDeclarationChange[]
  warnings: string[]
  continuity: ContinuityIssue[]
  compatibility: CliCompatibilityReport | null
}

export interface CliReportSummary {
  files: number
  declarations: number
  converted: number
  unchanged: number
  warnings: number
  continuityIssues: number
  compatibilityFindings: number
}

export interface CliSuccessReport {
  formatVersion: typeof CLI_REPORT_FORMAT_VERSION
  ok: true
  profiles: {
    default: string
    authored: string[]
    libraries: number
  }
  targets: Record<string, string> | null
  summary: CliReportSummary
  files: CliFileReport[]
}

export interface CliErrorReport {
  formatVersion: typeof CLI_REPORT_FORMAT_VERSION
  ok: false
  error: { message: string }
}

/** Every JSON document the CLI can write, discriminated by `ok`. */
export type CliJsonReport = CliSuccessReport | CliErrorReport
