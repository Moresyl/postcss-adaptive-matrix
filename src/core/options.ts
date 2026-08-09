import { expandLibraries, resolveLibraries } from './libraries.js'
import { appPcPreset } from './presets.js'
import type {
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  ResolvedAdaptiveMatrixOptions,
} from './types.js'

// `libraries` is absent because its default is computed, not a constant: see
// `resolveLibraries`, which expands an omitted option into every built-in.
const DEFAULTS: Omit<
  ResolvedAdaptiveMatrixOptions,
  'profiles' | 'root' | 'libraries'
> & { root: false } = {
  defaultProfile: 'app',
  routes: [],
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
  const authored = input.profiles ?? preset.profiles!
  const libraries = resolveLibraries(input.libraries)
  const options: ResolvedAdaptiveMatrixOptions = {
    ...DEFAULTS,
    ...input,
    libraries,
    profiles: authored,
    root: input.root ?? false,
  }

  if (!authored[options.defaultProfile]) {
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
  for (const [name, profile] of Object.entries(authored)) {
    validateProfile(name, profile)
  }

  // Expanded last, so library canvases can be cloned from profiles already
  // known to be valid. Library routes go after the authored ones because an
  // explicit route is a decision, while a library entry is a default.
  if (libraries.length) {
    const expansion = expandLibraries(libraries, authored, options.defaultProfile)
    options.profiles = { ...authored, ...expansion.profiles }
    options.routes = [...options.routes, ...expansion.routes]
  }
  return options
}
