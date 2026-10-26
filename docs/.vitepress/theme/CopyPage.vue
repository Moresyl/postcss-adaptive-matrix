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
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import { readMarkdown } from './markdown-request.js'
import { createMarkdownCopy } from './markdown-copy'
import type { CopyState } from './output-copy'

const { page, lang, site } = useData()

const chinese = computed(() => lang.value.startsWith('zh'))

/** `relativePath` is already the site-side path, so this is the served file. */
const rawPath = computed(() => withBase('/' + page.value.relativePath.replace(/^\/+/, '')))

const absolute = computed(() => {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return origin + rawPath.value
})

const text = computed(() =>
  chinese.value
    ? {
        copy: '复制为 Markdown',
        copying: '正在复制…',
        copied: '已复制',
        failed: '复制失败',
        raw: '查看原始 Markdown',
        ask: '用 Claude 提问',
      }
    : {
        copy: 'Copy as Markdown',
        copying: 'Copying…',
        copied: 'Copied',
        failed: 'Copy failed',
        raw: 'View raw Markdown',
        ask: 'Ask Claude',
      },
)

const state = ref<CopyState>('idle')
let resetTimer: ReturnType<typeof setTimeout> | undefined
const copyTask = createMarkdownCopy(
  readMarkdown,
  (value) => navigator.clipboard.writeText(value),
  (value) => {
    state.value = value
    if (value === 'copied' || value === 'failed') resetTimer = setTimeout(reset, 2000)
  },
)

function reset() {
  clearTimeout(resetTimer)
  copyTask.reset()
}
watch(rawPath, reset, { flush: 'sync' })
onBeforeUnmount(() => {
  clearTimeout(resetTimer)
  copyTask.dispose()
})

async function copy() {
  clearTimeout(resetTimer)
  await copyTask.copy(rawPath.value)
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
    <button class="copy-page-action" type="button" :disabled="state === 'copying'" @click="copy">
      <span role="status">{{
        state === 'copying'
          ? text.copying
          : state === 'copied'
            ? text.copied
            : state === 'failed'
              ? text.failed
              : text.copy
      }}</span>
    </button>
    <a class="copy-page-action" :href="rawPath" target="_blank" rel="noreferrer">{{ text.raw }}</a>
    <a class="copy-page-action" :href="ask" target="_blank" rel="noreferrer">{{ text.ask }}</a>
  </div>
</template>

<style scoped>
.copy-page {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  padding-bottom: 16px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.copy-page-action {
  padding: 6px 0;
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

.copy-page-action:disabled {
  cursor: progress;
}
</style>
