<script setup lang="ts">
/**
 * The page, in the form a model can read.
 *
 * Rendered documentation is a bad thing to paste into a chat: it arrives as
 * HTML-flavoured text with a navigation sidebar, a search box and a footer
 * attached, and the model spends attention on the furniture. Every page here is
 * also served as its own source Markdown at the page URL plus `.md`, which is
 * what these three actions hand over — copied to the clipboard, opened raw, or
 * handed to an assistant with the URL and a question already written.
 */
import { computed, ref } from 'vue'
import { useData, withBase } from 'vitepress'

const { page, lang, site } = useData()

const chinese = computed(() => lang.value.startsWith('zh'))

/** `relativePath` is already the site-side path, so this is the served file. */
const rawPath = computed(() => withBase(page.value.relativePath))

const absolute = computed(() => {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return origin + rawPath.value
})

const text = computed(() =>
  chinese.value
    ? { copy: '复制为 Markdown', copied: '已复制', failed: '复制失败', raw: '查看原始 Markdown', ask: '用 Claude 提问' }
    : { copy: 'Copy as Markdown', copied: 'Copied', failed: 'Copy failed', raw: 'View raw Markdown', ask: 'Ask Claude' },
)

const state = ref<'idle' | 'copied' | 'failed'>('idle')

async function copy() {
  try {
    const response = await fetch(rawPath.value)
    if (!response.ok) throw new Error(String(response.status))
    await navigator.clipboard.writeText(await response.text())
    state.value = 'copied'
  } catch {
    state.value = 'failed'
  }
  setTimeout(() => (state.value = 'idle'), 2000)
}

const ask = computed(() => {
  const question = chinese.value
    ? `请阅读 ${absolute.value} ——这是 ${site.value.title} 的一页文档。读完后回答我关于它的问题。`
    : `Read ${absolute.value} — one page of the ${site.value.title} documentation — and then answer my questions about it.`
  return `https://claude.ai/new?q=${encodeURIComponent(question)}`
})
</script>

<template>
  <div class="copy-page">
    <button class="copy-page-action" type="button" @click="copy">
      {{ state === 'copied' ? text.copied : state === 'failed' ? text.failed : text.copy }}
    </button>
    <a class="copy-page-action" :href="rawPath" target="_blank" rel="noreferrer">{{ text.raw }}</a>
    <a class="copy-page-action" :href="ask" target="_blank" rel="noreferrer">{{ text.ask }}</a>
  </div>
</template>

<style scoped>
.copy-page {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.copy-page-action {
  padding: 0;
  font-size: 13px;
  line-height: 22px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  background: none;
  border: 0;
  cursor: pointer;
  transition: color 0.25s;
}

.copy-page-action:hover {
  color: var(--vp-c-brand-1);
}
</style>
