<script setup lang="ts">
import { computed, ref } from 'vue'
import { useData, withBase } from 'vitepress'

const { lang } = useData()
const zh = computed(() => lang.value.startsWith('zh'))
const width = ref(375)
const bounded = ref(true)
const size = computed(
  () => (24 * (bounded.value ? Math.min(600, Math.max(320, width.value)) : width.value)) / 375,
)
const prefix = computed(() => (zh.value ? '/zh/docs/' : '/docs/'))
const text = computed(() =>
  zh.value
    ? {
        eyebrow: '从设计到浏览器',
        title: '拖动宽度，看懂每一个数值。',
        description: '以 375px 画布上的 24px 间距为例。边界可选，转换规则清晰可见。',
        width: '视口宽度',
        bounds: '限制在 320–600px',
        input: '设计稿',
        output: '浏览器中的间距',
        note: '这是普通长度的公式演示；完整 CSS、文字和组件库请进入试验场编译。',
        playground: '打开完整试验场',
        start: '接入项目',
        reference: '查询配置',
      }
    : {
        eyebrow: 'FROM DESIGN TO BROWSER',
        title: 'Move the viewport. Understand the numbers.',
        description:
          'Start with 24px of spacing on a 375px canvas. Bounds are optional and the formula stays visible.',
        width: 'Viewport width',
        bounds: 'Limit to 320–600px',
        input: 'Design canvas',
        output: 'Spacing in the browser',
        note: 'This illustrates ordinary lengths. Compile complete CSS, typography and component libraries in the playground.',
        playground: 'Open full playground',
        start: 'Integrate the compiler',
        reference: 'Explore configuration',
      },
)
</script>

<template>
  <section class="canvas-demo" aria-labelledby="canvas-demo-title">
    <div class="canvas-intro">
      <p class="canvas-eyebrow">{{ text.eyebrow }}</p>
      <h2 id="canvas-demo-title">{{ text.title }}</h2>
      <p>{{ text.description }}</p>
      <nav class="canvas-links" :aria-label="zh ? '开始使用' : 'Start building'">
        <a :href="withBase(prefix + 'playground')"
          >{{ text.playground }} <span aria-hidden="true">↗</span></a
        >
        <a :href="withBase(prefix + 'getting-started')">{{ text.start }}</a>
        <a :href="withBase(prefix + 'configuration')">{{ text.reference }}</a>
      </nav>
    </div>
    <div class="canvas-workbench">
      <div class="canvas-toolbar">
        <span>spacing.css</span><span>375px → {{ width }}px</span>
      </div>
      <div class="canvas-readings">
        <div>
          <span>{{ text.input }}</span
          ><strong>24<span>px</span></strong>
        </div>
        <span class="canvas-arrow" aria-hidden="true">→</span>
        <div>
          <span>{{ text.output }}</span
          ><strong>{{ Number(size.toFixed(2)) }}<span>px</span></strong>
        </div>
      </div>
      <pre><code>padding: {{ bounded ? 'clamp(20.48px, 6.4vw, 38.4px)' : '6.4vw' }};</code></pre>
      <label class="canvas-slider-label" for="canvas-viewport"
        >{{ text.width }}<output for="canvas-viewport">{{ width }}px</output></label
      >
      <input
        id="canvas-viewport"
        v-model.number="width"
        type="range"
        min="240"
        max="1440"
        step="1"
      />
      <label class="canvas-toggle"
        ><input v-model="bounded" type="checkbox" />{{ text.bounds }}</label
      >
      <p class="canvas-note">{{ text.note }}</p>
    </div>
  </section>
</template>

<style scoped>
.canvas-demo {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 64px;
  max-width: 1152px;
  margin: 24px auto 80px;
  padding: 40px 32px;
  align-items: center;
}
.canvas-eyebrow {
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.13em;
}
h2 {
  font-size: clamp(26px, 3vw, 38px);
  letter-spacing: -0.04em;
  line-height: 1.25;
  margin: 16px 0;
  font-weight: 650;
}
.canvas-intro > p:not(.canvas-eyebrow) {
  color: var(--vp-c-text-2);
  line-height: 1.85;
}
.canvas-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin-top: 24px;
}
.canvas-links a {
  font-size: 14px;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 5px;
}
.canvas-workbench {
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 18px;
  background: var(--vp-c-bg);
  box-shadow: 0 16px 56px rgb(15 23 42 / 6%);
  padding: 24px;
}
.canvas-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font: 12px var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  border-bottom: 1px solid var(--vp-c-divider);
  padding-bottom: 16px;
}
.canvas-readings {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 24px 0;
}
.canvas-readings > div > span {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.canvas-readings strong {
  display: block;
  font-size: 38px;
  line-height: 1.4;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.canvas-readings strong span {
  font-size: 16px;
  color: var(--vp-c-text-2);
  margin-left: 4px;
}
.canvas-arrow {
  color: var(--vp-c-brand-1);
  font-size: 24px;
}
pre {
  font-size: 12px;
  padding: 14px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  overflow: auto;
}
.canvas-slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-top: 24px;
}
input[type='range'] {
  display: block;
  width: 100%;
  margin: 16px 0;
  accent-color: var(--vp-c-brand-1);
}
.canvas-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
input[type='checkbox'] {
  accent-color: var(--vp-c-brand-1);
}
.canvas-note {
  font-size: 12px;
  color: var(--vp-c-text-2);
  line-height: 1.7;
  margin-top: 16px;
}
:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}
@media (max-width: 760px) {
  .canvas-demo {
    grid-template-columns: 1fr;
    gap: 28px;
    padding: 24px;
    margin-bottom: 40px;
  }
  .canvas-workbench {
    padding: 20px;
  }
}
</style>
