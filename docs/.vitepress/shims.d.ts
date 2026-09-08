/**
 * Plain tsc uses this shim for configuration imports. Component scripts and
 * templates are independently checked by docs:typecheck (vue-tsc with strict
 * templates), which is included in the main typecheck gate.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
