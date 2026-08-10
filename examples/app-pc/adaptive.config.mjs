import { appPcPreset } from '../../dist/index.js'

/**
 * The options, on their own.
 *
 * Kept apart from `postcss.config.mjs` because the two runners want different
 * shapes — PostCSS wants `{ plugins: [...] }`, the `adaptive-matrix` CLI wants
 * the options themselves — and writing the canvases out twice is how the two
 * end up describing different designs.
 */
export default appPcPreset({
  appDesignWidth: 375,
  pcDesignWidth: 1440,
  rootSelector: '#app',
})
