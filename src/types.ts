import type { Plugin } from 'postcss'

export type Pattern = string | RegExp
export type FileMatcher = Pattern | ((file: string) => boolean)
export type QueryType = 'media' | 'container'
export type ScaleUnit = 'vw' | 'vi' | 'cqw' | 'cqi'
export type OutputStrategy = 'clamp' | 'viewport'

export interface ProfileContext {
  file: string
  profile: string
}

export interface AdaptiveQuery {
  type?: QueryType
  condition: string
  name?: string
}

export interface AdaptiveProfile {
  /** Width of the design canvas used while authoring this profile. */
  designWidth: number | ((context: ProfileContext) => number)
  /** Viewport/container interval in which lengths are allowed to scale. */
  fluid: {
    minWidth: number
    maxWidth: number
  }
  /** Wrapper generated for `@adaptive <profile>`. `false` unwraps it. */
  query?: string | AdaptiveQuery | false
  /** Width unit used by the preferred fluid expression. */
  unit?: ScaleUnit
  strategy?: OutputStrategy
  /** 0 is static text, 1 is pure viewport text. Kept below 1 for zoom support. */
  fontFluidity?: number
  /** Optional maximum width applied to the configured root inside this profile. */
  rootMaxWidth?: number
}

export interface RootFoundationOptions {
  selector: string
  center?: boolean
  container?: boolean
  containerName?: string
  safeAreaVariables?: boolean
  layer?: string | false
}

export interface AdaptiveMatrixOptions {
  profiles?: Record<string, AdaptiveProfile>
  defaultProfile?: string
  atRuleName?: string
  strategy?: OutputStrategy
  unit?: ScaleUnit
  precision?: number
  unitToConvert?: string
  minPixelValue?: number
  /** Values with an absolute size at or below this number stay in px. */
  hairline?: number
  fontFluidity?: number
  textProperties?: string[]
  propList?: string[]
  selectorExclude?: Pattern[]
  valueExclude?: Pattern[]
  include?: FileMatcher | FileMatcher[]
  exclude?: FileMatcher | FileMatcher[]
  transformCustomProperties?: boolean
  preserveOriginal?: boolean
  root?: RootFoundationOptions | false
  unknownProfile?: 'warn' | 'error' | 'ignore'
}

export interface ResolvedAdaptiveMatrixOptions
  extends Omit<
    Required<AdaptiveMatrixOptions>,
    'root' | 'include' | 'exclude'
  > {
  root: RootFoundationOptions | false
  include?: FileMatcher | FileMatcher[]
  exclude?: FileMatcher | FileMatcher[]
}

export interface AppPcPresetOptions {
  appDesignWidth?: number
  pcDesignWidth?: number
  breakpoint?: number
  appFluidMin?: number
  appFluidMax?: number
  pcFluidMin?: number
  pcFluidMax?: number
  rootSelector?: string
  container?: boolean
}

export type AdaptiveMatrixPlugin = Plugin & { postcssPlugin: string }
