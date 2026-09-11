<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

const { lang } = useData()
const zh = computed(() => lang.value.startsWith('zh'))
const path = computed(() => (zh.value ? '/zh/docs/' : '/docs/'))
</script>

<template>
  <section class="home-start" aria-labelledby="home-start-title">
    <div class="home-start-copy">
      <p class="home-start-label">POSTCSS 8 · TYPESCRIPT · OPEN SOURCE</p>
      <h2 id="home-start-title">{{ zh ? '从一条 CSS 开始。' : 'Start with one line of CSS.' }}</h2>
      <p>
        {{
          zh
            ? '先看输出，再选择画布与边界。无需一次填满所有配置。'
            : 'See the output first. Choose your canvas and bounds when you need them.'
        }}
      </p>
    </div>
    <div class="home-start-actions">
      <code>npm i -D postcss-adaptive-matrix</code>
      <nav :aria-label="zh ? '下一步' : 'Next steps'">
        <a class="home-start-primary" :href="withBase(path + 'getting-started')"
          >{{ zh ? '开始接入' : 'Get started' }} <span aria-hidden="true">→</span></a
        >
        <a :href="withBase(path + 'playground')">{{ zh ? '先试一下' : 'Try the playground' }}</a>
      </nav>
    </div>
  </section>
</template>

<style scoped>
.home-start {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 48px;
  align-items: center;
  max-width: 1152px;
  margin: 64px auto;
  padding: 48px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 24px;
  background: linear-gradient(120deg, var(--vp-c-bg-soft), var(--vp-c-bg));
}
.home-start-label {
  color: var(--vp-c-brand-1);
  font-size: 11px;
  letter-spacing: 0.12em;
  font-weight: 700;
}
h2 {
  margin: 16px 0;
  font-size: clamp(28px, 3vw, 40px);
  line-height: 1.2;
  letter-spacing: -0.04em;
  font-weight: 650;
  text-wrap: balance;
}
.home-start-copy > p:last-child {
  color: var(--vp-c-text-2);
  line-height: 1.8;
}
.home-start-actions {
  min-width: 0;
}
code {
  display: block;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg);
  font-size: 13px;
  overflow-wrap: anywhere;
}
nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px 24px;
  margin-top: 20px;
}
a {
  color: var(--vp-c-brand-1);
  font-size: 14px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.home-start-primary {
  display: inline-flex;
  gap: 24px;
  padding: 12px 20px;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-bg);
  text-decoration: none;
}
a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}
@media (max-width: 760px) {
  .home-start {
    grid-template-columns: 1fr;
    margin: 40px 24px;
    padding: 28px;
    gap: 24px;
  }
}
</style>
