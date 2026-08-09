import valueParser, { type Node } from 'postcss-value-parser'
import type {
  AdaptiveProfile,
  OutputStrategy,
  ProfileContext,
  ResolvedAdaptiveMatrixOptions,
  ScaleUnit,
} from './types.js'

const SKIPPED_FUNCTIONS = new Set(['url', 'local', 'format'])

export function round(value: number, precision: number): number {
  const factor = 10 ** precision
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

function format(value: number, precision: number): string {
  return String(round(value, precision))
}

function resolveDesignWidth(
  profileName: string,
  profile: AdaptiveProfile,
  file: string,
): number {
  const context: ProfileContext = { file, profile: profileName }
  const width =
    typeof profile.designWidth === 'function'
      ? profile.designWidth(context)
      : profile.designWidth
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(
      `[postcss-adaptive-matrix] Profile "${profileName}" returned an invalid designWidth. Expected a positive finite number.`,
    )
  }
  return width
}

function preferredValue(
  pixels: number,
  designWidth: number,
  fluidity: number,
  unit: ScaleUnit,
  accessibleText: boolean,
  precision: number,
): string {
  const fluidPart = format((pixels * fluidity * 100) / designWidth, precision)
  const staticPixels = pixels * (1 - fluidity)
  if (Math.abs(staticPixels) < 10 ** -precision) return `${fluidPart}${unit}`
  const staticPart = accessibleText
    ? `${format(staticPixels / 16, precision)}rem`
    : `${format(staticPixels, precision)}px`
  const operator = Number(fluidPart) < 0 ? '-' : '+'
  return `calc(${staticPart} ${operator} ${format(Math.abs(Number(fluidPart)), precision)}${unit})`
}

function boundaryValue(
  pixels: number,
  designWidth: number,
  fluidity: number,
  width: number,
): number {
  return pixels * (1 - fluidity) + (pixels * fluidity * width) / designWidth
}

export function convertLength(
  pixels: number,
  property: string,
  profileName: string,
  profile: AdaptiveProfile,
  options: ResolvedAdaptiveMatrixOptions,
  file: string,
): string {
  if (!Number.isFinite(pixels)) return `${pixels}${options.unitToConvert}`
  if (pixels === 0 || Math.abs(pixels) < options.minPixelValue) {
    return `${format(pixels, options.precision)}${options.unitToConvert}`
  }
  if (options.hairline > 0 && Math.abs(pixels) <= options.hairline) {
    return `${format(pixels, options.precision)}${options.unitToConvert}`
  }

  const designWidth = resolveDesignWidth(profileName, profile, file)
  const unit = profile.unit ?? options.unit
  const strategy: OutputStrategy = profile.strategy ?? options.strategy
  if (strategy === 'viewport') {
    return `${format((pixels * 100) / designWidth, options.precision)}${unit}`
  }

  const accessibleText = options.textProperties.some(
    (candidate) =>
      candidate === property ||
      (candidate.endsWith('*') && property.startsWith(candidate.slice(0, -1))),
  )
  const fluidity = accessibleText
    ? (profile.fontFluidity ?? options.fontFluidity)
    : 1
  const start = boundaryValue(
    pixels,
    designWidth,
    fluidity,
    profile.fluid.minWidth,
  )
  const end = boundaryValue(
    pixels,
    designWidth,
    fluidity,
    profile.fluid.maxWidth,
  )
  const lower = Math.min(start, end)
  const upper = Math.max(start, end)
  const boundaryUnit = accessibleText ? 'rem' : 'px'
  const lowerValue = accessibleText ? lower / 16 : lower
  const upperValue = accessibleText ? upper / 16 : upper
  const preferred = preferredValue(
    pixels,
    designWidth,
    fluidity,
    unit,
    accessibleText,
    options.precision,
  )
  return `clamp(${format(lowerValue, options.precision)}${boundaryUnit}, ${preferred}, ${format(upperValue, options.precision)}${boundaryUnit})`
}

function shouldSkipFunction(node: Node): boolean {
  return (
    node.type === 'function' && SKIPPED_FUNCTIONS.has(node.value.toLowerCase())
  )
}

export function convertValue(
  value: string,
  property: string,
  profileName: string,
  profile: AdaptiveProfile,
  options: ResolvedAdaptiveMatrixOptions,
  file: string,
): string {
  const unit = options.unitToConvert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `(^|[^a-zA-Z0-9_.-])(-?(?:\\d*\\.\\d+|\\d+\\.?\\d*))${unit}(?![a-zA-Z0-9_-])`,
    'gi',
  )
  const parsed = valueParser(value)
  parsed.walk((node) => {
    if (shouldSkipFunction(node)) return false
    if (node.type !== 'word') return undefined
    node.value = node.value.replace(pattern, (match, prefix: string, number: string) => {
      const pixels = Number.parseFloat(number)
      if (
        pixels === 0 ||
        Math.abs(pixels) < options.minPixelValue ||
        (options.hairline > 0 && Math.abs(pixels) <= options.hairline)
      ) {
        return match
      }
      const converted = convertLength(
        pixels,
        property,
        profileName,
        profile,
        options,
        file,
      )
      return `${prefix}${converted}`
    })
    return undefined
  })
  return parsed.toString()
}
