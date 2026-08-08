import { appPcPreset } from './presets.js'
import type {
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  ResolvedAdaptiveMatrixOptions,
} from './types.js'

const DEFAULTS: Omit<
  ResolvedAdaptiveMatrixOptions,
  'profiles' | 'root'
> & { root: false } = {
  defaultProfile: 'app',
  atRuleName: 'adaptive',
  strategy: 'clamp',
  unit: 'vw',
  precision: 5,
  unitToConvert: 'px',
  minPixelValue: 0,
  hairline: 1,
  fontFluidity: 0.35,
  textProperties: [
    'font',
    'font-size',
    'line-height',
    'letter-spacing',
    'word-spacing',
  ],
  propList: ['*'],
  selectorExclude: [],
  valueExclude: [],
  transformCustomProperties: false,
  preserveOriginal: false,
  root: false,
  unknownProfile: 'warn',
}

function validateProfile(name: string, profile: AdaptiveProfile): void {
  if (!profile || typeof profile !== 'object') {
    throw new TypeError(
      `[postcss-adaptive-matrix] Profile "${name}" must be an object.`,
    )
  }
  const { minWidth, maxWidth } = profile.fluid ?? {}
  if (
    !Number.isFinite(minWidth) ||
    !Number.isFinite(maxWidth) ||
    minWidth <= 0 ||
    maxWidth <= minWidth
  ) {
    throw new RangeError(
      `[postcss-adaptive-matrix] Profile "${name}" requires fluid.minWidth > 0 and fluid.maxWidth > fluid.minWidth.`,
    )
  }
  if (
    typeof profile.designWidth !== 'function' &&
    (!Number.isFinite(profile.designWidth) || profile.designWidth <= 0)
  ) {
    throw new RangeError(
      `[postcss-adaptive-matrix] Profile "${name}" requires a positive designWidth.`,
    )
  }
  if (
    profile.fontFluidity != null &&
    (profile.fontFluidity < 0 || profile.fontFluidity > 1)
  ) {
    throw new RangeError(
      `[postcss-adaptive-matrix] Profile "${name}" fontFluidity must be between 0 and 1.`,
    )
  }
}

export function resolveOptions(
  input: AdaptiveMatrixOptions = {},
): ResolvedAdaptiveMatrixOptions {
  const preset = appPcPreset()
  const profiles = input.profiles ?? preset.profiles!
  const options: ResolvedAdaptiveMatrixOptions = {
    ...DEFAULTS,
    ...input,
    profiles,
    root: input.root ?? false,
  }

  if (!profiles[options.defaultProfile]) {
    throw new Error(
      `[postcss-adaptive-matrix] defaultProfile "${options.defaultProfile}" does not exist.`,
    )
  }
  if (!Number.isInteger(options.precision) || options.precision < 0 || options.precision > 12) {
    throw new RangeError(
      '[postcss-adaptive-matrix] precision must be an integer from 0 to 12.',
    )
  }
  if (options.fontFluidity < 0 || options.fontFluidity > 1) {
    throw new RangeError(
      '[postcss-adaptive-matrix] fontFluidity must be between 0 and 1.',
    )
  }
  if (!options.propList.length) {
    throw new Error('[postcss-adaptive-matrix] propList cannot be empty.')
  }
  for (const [name, profile] of Object.entries(profiles)) {
    validateProfile(name, profile)
  }
  return options
}
