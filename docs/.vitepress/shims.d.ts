/**
 * Single-file components have no types of their own until `vue-tsc` runs, and
 * `vue-tsc` is a second type checker to install, configure and keep in step
 * with the first one for the sake of one 60-line component. This shim buys the
 * rest of the configuration — which is where the logic lives — full checking
 * under the same `tsc --noEmit` as `src`, at the cost of not checking the
 * component's own template. VitePress compiles the component either way, so a
 * mistake in it fails `npm run docs:build`.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
