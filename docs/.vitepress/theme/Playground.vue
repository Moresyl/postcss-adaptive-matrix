<script setup lang="ts">
/**
 * The compiler, running in the reader's own browser.
 *
 * There is no service behind this. The plugin has one runtime dependency and no
 * Node API in its path, so the same `src` the package publishes is imported
 * straight into the page and PostCSS runs client-side. What you read here is
 * what the build would emit, not a recorded approximation of it — the fastest
 * honest answer to "what does this option actually do to my CSS".
 *
 * The options pane evaluates as JavaScript rather than parsing as JSON, because
 * half of what is worth trying cannot be written in JSON: a regular expression
 * in `selectorExclude`, a function `designWidth`, a spread of `appPcPreset`.
 * It runs in a disposable worker with a five-second deadline. This protects
 * document responsiveness, not confidentiality: only run trusted expressions.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useData } from 'vitepress'
import { createCompilerTask } from './compiler-task'

const { lang } = useData()
const chinese = computed(() => lang.value.startsWith('zh'))

interface Sample {
  label: string
  labelZh: string
  css: string
  options: string
}

const SAMPLES: Sample[] = [
  {
    label: 'Zero configuration',
    labelZh: '零配置',
    css: `.card { padding: 24px; font-size: 16px; border: 1px solid #ddd; }`,
    options: `{}`,
  },
  {
    label: 'Only a maximum',
    labelZh: '只设上限',
    css: `.card { padding: 24px; font-size: 16px; }`,
    options: `{
  profiles: { app: { designWidth: 375, fluid: { maxWidth: 600 } } },
}`,
  },
  {
    label: 'Container sizing',
    labelZh: '容器内缩放',
    css: `.container { container-type: inline-size; }
.card { padding: 24px; font-size: 16px; }`,
    options: `{
  profiles: { card: { designWidth: 375, unit: 'cqi' } },
}`,
  },
  {
    label: 'One canvas',
    labelZh: '单画布',
    css: `.card {
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #eee;
  font-size: 16px;
}`,
    options: `{
  profiles: {
    app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } },
  },
  defaultProfile: 'app',
}`,
  },
  {
    label: 'App + desktop',
    labelZh: '移动端 + 桌面端',
    css: `.hero {
  padding: 24px;
  font-size: 16px;
}

/* Compiled against the desktop canvas, because the band starts at 768. */
@media (min-width: 768px) {
  .hero {
    padding: 48px;
    font-size: 20px;
  }
}`,
    options: `appPcPreset({ app: 375, pc: 1440, breakpoint: 768 })`,
  },
  {
    label: 'Static text',
    labelZh: '文字不流体',
    css: `/* fontFluidity: 0 makes text plain rem — fluid layout, fixed type. */
.title {
  font-size: 32px;
  line-height: 44px;
  margin-bottom: 16px;
}`,
    options: `{
  profiles: {
    app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } },
  },
  defaultProfile: 'app',
  fontFluidity: 0,
}`,
  },
  {
    label: 'Old WebView',
    labelZh: '旧 WebView',
    css: `/* strategy: 'viewport' emits a bare vw instead of clamp(), for engines
   that never got clamp(); preserveOriginal leaves the px in front of it as
   the fallback those engines will use. */
.banner {
  height: 200px;
  padding: 16px;
}`,
    options: `{
  profiles: {
    app: {
      designWidth: 375,
      fluid: { minWidth: 320, maxWidth: 480 },
      strategy: 'viewport',
    },
  },
  defaultProfile: 'app',
  preserveOriginal: true,
}`,
  },
  {
    label: 'A warning worth having',
    labelZh: '一条值得看的告警',
    css: `/* This rule is only live from 1024px up, and the canvas stops scaling
   at 480px — so every clamp() below is pinned to its maximum across the
   whole range the rule applies at. The values are constants, and the
   compiler says so rather than letting it look like it worked. */
@media (min-width: 1024px) {
  .sidebar {
    width: 320px;
    padding: 24px;
  }
}`,
    options: `{
  profiles: {
    app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } },
  },
  defaultProfile: 'app',
}`,
  },
  {
    label: 'Leave some pixels alone',
    labelZh: '保留部分像素',
    css: `.panel {
  /* hairline: 1px borders are never converted. */
  border: 1px solid #ddd;
  padding: 20px;
  /* Excluded by propList below. */
  box-shadow: 0 2px 8px rgb(0 0 0 / 12%);
}

.no-touch {
  width: 100px;
}`,
    options: `{
  profiles: {
    app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } },
  },
  defaultProfile: 'app',
  propList: ['*', '!box-shadow'],
  selectorExclude: [/^\\.no-touch$/],
}`,
  },
]

const css = ref(SAMPLES[0]!.css)
const options = ref(SAMPLES[0]!.options)
const active = ref(0)

/** `null` until the first client-side run; SSR renders the input, not a result. */
const output = shallowRef<string | null>(null)
const warnings = shallowRef<{ text: string }[]>([])
const failure = ref<string | null>(null)
const compiling = ref(false)
const duration = ref<number | null>(null)
const task = createCompilerTask(
  () => new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' }),
  (result) => {
    failure.value = result.error ?? null
    if (result.css !== undefined) output.value = result.css
    warnings.value = result.warnings ?? []
    duration.value = result.duration ?? null
    compiling.value = false
  },
  (reason) => {
    failure.value =
      reason instanceof Error
        ? reason.message
        : reason === 'timeout'
          ? text.value.timeout
          : text.value.workerFailed
    compiling.value = false
  },
)
const stop = task.stop

function load(index: number): void {
  const sample = SAMPLES[index]
  if (!sample) return
  active.value = index
  css.value = sample.css
  options.value = sample.options
}

/**
 * Use a fresh worker for each run so authored code cannot leave state behind
 * and stale messages cannot overwrite a newer compilation.
 */
function run(): void {
  stop()
  compiling.value = true
  failure.value = null
  warnings.value = []
  duration.value = null
  task.run({ css: css.value, options: options.value })
}

let timer: ReturnType<typeof setTimeout> | undefined
watch([css, options], () => {
  stop()
  compiling.value = true
  duration.value = null
  failure.value = null
  warnings.value = []
  clearTimeout(timer)
  timer = setTimeout(run, 180)
})
onMounted(run)
onBeforeUnmount(() => {
  clearTimeout(timer)
  stop()
})

const text = computed(() =>
  chinese.value
    ? {
        samples: '示例',
        css: '输入 CSS',
        options: '配置（JavaScript 表达式）',
        output: '编译结果',
        warnings: '告警',
        failed: '编译未完成',
        empty: '正在编译…',
        timeout: '编译超过 5 秒，已停止。请简化输入或检查配置中的循环。',
        workerFailed: '编译 Worker 无法运行，请检查浏览器支持或刷新重试。',
        hint: '配置里可以直接用 appPcPreset、presets、withAtomicCss、defineLibraries——包导出的东西都在作用域里。',
      }
    : {
        samples: 'Samples',
        css: 'Input CSS',
        options: 'Options (a JavaScript expression)',
        output: 'Compiled',
        warnings: 'Warnings',
        failed: 'Compilation did not complete',
        empty: 'Compiling…',
        timeout:
          'Compilation exceeded 5 seconds and was stopped. Simplify the input or check for loops.',
        workerFailed: 'The compiler worker could not run. Check browser support or reload.',
        hint: 'appPcPreset, presets, withAtomicCss and defineLibraries are in scope — everything the package exports is.',
      },
)
</script>

<template>
  <div class="playground">
    <div class="playground-samples">
      <span class="playground-samples-label">{{ text.samples }}</span>
      <button
        v-for="(sample, index) in SAMPLES"
        :key="sample.label"
        type="button"
        class="playground-sample"
        :class="{ 'is-active': active === index }"
        :aria-pressed="active === index"
        @click="load(index)"
      >
        {{ chinese ? sample.labelZh : sample.label }}
      </button>
    </div>

    <div class="playground-grid">
      <div class="playground-pane">
        <label class="playground-title" for="playground-css">{{ text.css }}</label>
        <textarea id="playground-css" v-model="css" class="playground-editor" spellcheck="false" />

        <label class="playground-title" for="playground-options">{{ text.options }}</label>
        <textarea
          id="playground-options"
          v-model="options"
          class="playground-editor playground-editor-short"
          spellcheck="false"
        />
        <p class="playground-hint">{{ text.hint }}</p>
      </div>

      <div class="playground-pane">
        <span class="playground-title" role="status"
          >{{ compiling ? text.empty : text.output
          }}<template v-if="duration !== null"> · {{ duration.toFixed(1) }} ms</template></span
        >
        <pre
          class="playground-output"
          :aria-busy="compiling"
          :class="{ 'is-stale': failure || compiling }"
          >{{ output ?? text.empty }}</pre>

        <p v-if="failure" class="playground-failure" role="alert">
          <strong>{{ text.failed }}</strong
          ><br />{{ failure }}
        </p>

        <template v-if="warnings.length">
          <span class="playground-title">{{ text.warnings }}</span>
          <ul class="playground-warnings">
            <li v-for="(warning, index) in warnings" :key="index">{{ warning.text }}</li>
          </ul>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playground {
  margin: 24px 0;
}

.playground-samples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.playground-samples-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.playground-sample {
  padding: 4px 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s;
}

.playground-sample:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.playground-sample.is-active {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.playground-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 960px) {
  .playground-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.playground-pane {
  min-width: 0;
}

.playground-title {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.playground-title:not(:first-child) {
  margin-top: 16px;
}

.playground-editor,
.playground-output {
  width: 100%;
  min-height: 260px;
  padding: 12px 14px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.7;
  tab-size: 2;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  resize: vertical;
}

.playground-editor:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.playground-editor-short {
  min-height: 160px;
}

.playground-output {
  overflow: auto;
  white-space: pre;
  transition: opacity 0.2s;
}

.playground-output.is-stale {
  opacity: 0.45;
}

.playground-hint {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

.playground-failure {
  margin-top: 12px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-danger-1, #d64545);
  background: var(--vp-c-danger-soft, rgb(214 69 69 / 10%));
  border-radius: 8px;
}

.playground-warnings {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}
</style>
