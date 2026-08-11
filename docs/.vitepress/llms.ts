/**
 * The machine-readable half of the documentation.
 *
 * A coding agent asked to wire this plugin into a project does not browse. It
 * fetches one URL, and whatever is at that URL is what it knows. `llms.txt`
 * (llmstxt.org) is the convention for that URL: a curated index in Markdown,
 * one line per page, so an agent can pick the two pages it actually needs
 * instead of guessing from a search result. `llms-full.txt` is the other half
 * of the bargain — the whole documentation set in one file, for when the model
 * has the context window and would rather read everything once.
 *
 * Both are generated from the same page list the site is built from, so a page
 * cannot be added to one and forgotten in the other.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { rewrite, SRC_DIR } from './paths'

/** One curated entry: a source page and why a reader would open it. */
interface Entry {
  source: string
  title: string
  summary: string
  /** Left out of `llms-full.txt` when the page is a live component, not prose. */
  index?: 'only'
}

const SUMMARY = `Adaptive Matrix is a PostCSS 8 plugin that compiles px to responsive
units against the design width of the file each px was drawn on, rather than against a
single global width. Pages, a mobile component library and a desktop component library
come from different design files; giving each its own canvas is what lets all three
scale correctly at once. Output is bounded fluid clamp(), with text kept zoomable for
WCAG 1.4.4. Component-library canvases are built in, so the default configuration is
already correct for a project that uses one.`.replace(/\s+/g, ' ')

// One line on purpose: collapsing the whitespace of a wrapped Chinese string
// either leaves the wrap points as spaces mid-sentence or, if they are dropped,
// welds `PostCSS 8` into `PostCSS8` along with every other Latin word in it.
const SUMMARY_ZH =
  'Adaptive Matrix 是一个 PostCSS 8 插件：每个 px 按它所在设计稿的宽度换算，而不是按全局唯一的宽度换算。页面、移动端组件库、桌面端组件库来自不同的设计稿，给每张稿子一张自己的画布，是让三者同时缩放正确的前提。产物是有上下界的 clamp()，文字保持可缩放以满足 WCAG 1.4.4。常见组件库的画布已经内置，用了组件库的项目默认配置就是对的。'

const DOCS: Entry[] = [
  {
    source: 'docs/getting-started.md',
    title: 'Getting started',
    summary: 'Install it, configure one design width, and get a first page converting.',
  },
  {
    source: 'docs/playground.md',
    title: 'Playground',
    summary: 'Compile CSS against any configuration in the browser and read the output.',
    index: 'only',
  },
  {
    source: 'docs/integration.md',
    title: 'Build tool integration',
    summary: 'Vite, Nuxt, Webpack, Rspack, Taro and uni-app, with a working config each.',
  },
  {
    source: 'docs/cli.md',
    title: 'CLI preview',
    summary: 'Compile a stylesheet and read the output before committing a config change.',
  },
  {
    source: 'docs/libraries.md',
    title: 'Component libraries',
    summary: 'The built-in canvases, how a library is detected, and how to add one.',
  },
  {
    source: 'docs/configuration.md',
    title: 'Configuration reference',
    summary: 'Every option, its default, its type, and what changing it does to the output.',
  },
  {
    source: 'docs/architecture.md',
    title: 'Architecture and formulas',
    summary: 'Where every number comes from: the canvas model and the conversion formulas.',
  },
  {
    source: 'docs/runtime.md',
    title: 'Optional runtime',
    summary: 'The opt-in runtime for soft keyboards, collapsing address bars and WebViews.',
  },
  {
    source: 'docs/compatibility.md',
    title: 'Browser support',
    summary: 'Feature support for clamp(), vi, env(), @layer, container queries, and fallbacks.',
  },
  {
    source: 'docs/migration.md',
    title: 'Migration guide',
    summary: 'Moving over from an existing px-to-viewport setup without changing the design.',
  },
  {
    source: 'docs/release.md',
    title: 'Release and compatibility',
    summary: 'Published artifacts, supported Node versions, and the versioning policy.',
  },
  {
    source: 'docs/agents.md',
    title: 'Documentation for agents',
    summary: 'Every machine-readable endpoint, and what to put in a prompt so the answer is right.',
  },
]

const DOCS_ZH: Entry[] = [
  {
    source: 'docs/getting-started.zh-CN.md',
    title: '快速上手',
    summary: '装上去，配一张设计稿的宽度，把第一个页面跑通。',
  },
  {
    source: 'docs/playground.zh-CN.md',
    title: '在线试验场',
    summary: '在浏览器里用任意配置编译一段 CSS，直接读输出。',
    index: 'only',
  },
  {
    source: 'docs/integration.zh-CN.md',
    title: '构建工具集成',
    summary: 'Vite、Nuxt、Webpack、Rspack、Taro、uni-app，每个都给可用的配置。',
  },
  {
    source: 'docs/cli.zh-CN.md',
    title: '命令行预览',
    summary: '改配置之前先编译一份样式表，把输出看清楚。',
  },
  {
    source: 'docs/libraries.zh-CN.md',
    title: '组件库适配',
    summary: '内置了哪些画布、组件库是怎么识别的、怎么自己加一个。',
  },
  {
    source: 'docs/configuration.zh-CN.md',
    title: '配置参考',
    summary: '每个选项的类型、默认值，以及改了它输出会变成什么样。',
  },
  {
    source: 'docs/architecture.zh-CN.md',
    title: '架构与转换公式',
    summary: '每个数字是怎么来的：多画布模型与换算公式。',
  },
  {
    source: 'docs/runtime.zh-CN.md',
    title: '可选运行时',
    summary: '软键盘、会收起的地址栏、WebView——需要时才引入的那一小段运行时。',
  },
  {
    source: 'docs/compatibility.zh-CN.md',
    title: '浏览器支持与降级',
    summary: 'clamp()、vi、env()、@layer、容器查询的支持情况与降级路径。',
  },
  {
    source: 'docs/migration.zh-CN.md',
    title: '迁移指南',
    summary: '从现有的 px 换算方案换过来，且不改设计稿。',
  },
  {
    source: 'docs/release.zh-CN.md',
    title: '发布与兼容性',
    summary: '发布产物、支持的 Node 版本、版本号策略。',
  },
  {
    source: 'docs/agents.zh-CN.md',
    title: '面向 AI 的文档',
    summary: '所有机器可读的入口，以及提示词里该写什么才能得到对的答案。',
  },
]

const EXTRA: Entry[] = [
  {
    source: 'conformance/README.md',
    title: 'Conformance suite',
    summary: 'A language-agnostic behavioural definition as pure data, usable as acceptance tests.',
  },
  {
    source: 'examples/app-pc/README.md',
    title: 'Runnable example',
    summary: 'A complete project with a 375 app design and a 1440 desktop design.',
  },
  { source: 'CHANGELOG.md', title: 'Changelog', summary: 'Every released change, newest first.' },
]

const EXTRA_ZH: Entry[] = [
  {
    source: 'conformance/README.zh-CN.md',
    title: '一致性套件',
    summary: '语言无关的行为定义，纯数据，任何语言的实现都能拿它做验收。',
  },
  {
    source: 'examples/app-pc/README.zh-CN.md',
    title: '可运行示例',
    summary: 'App 375 + PC 1440 的完整工程。',
  },
  { source: 'CHANGELOG.zh-CN.md', title: '更新日志', summary: '每个已发布版本的改动，最新在前。' },
]

/** The URL of a page's raw Markdown, which is what an agent should fetch. */
function rawUrl(base: string, source: string): string {
  return base + rewrite(source)
}

function read(source: string): string {
  return readFileSync(path.resolve(SRC_DIR, source), 'utf8').replace(/\r\n/g, '\n').trim()
}

function section(base: string, heading: string, entries: Entry[]): string {
  const lines = entries.map(
    (entry) => `- [${entry.title}](${rawUrl(base, entry.source)}): ${entry.summary}`,
  )
  return `## ${heading}\n\n${lines.join('\n')}\n`
}

/**
 * The one link here is not a page, so it is built from a URL rather than from
 * an `Entry`. Prose is the wrong shape for a question like "is `precision` an
 * integer, and what is its ceiling"; the schema answers that without being read
 * as English at all, and both languages travel inside the one document.
 */
function machineSection(base: string, chinese: boolean): string {
  return chinese
    ? `## 机器可读\n\n- [配置项 JSON Schema](${base}schema/options.json)：全部配置项的类型、取值范围与默认值。默认值取自编译器本身，中文描述在 \`x-description-zh\`。\n`
    : `## Machine-readable\n\n- [Options JSON Schema](${base}schema/options.json): every option's type, range and default. Defaults are read out of the compiler itself; Chinese descriptions travel as \`x-description-zh\`.\n`
}

export function llmsTxt(base: string, chinese: boolean): string {
  const docs = chinese ? DOCS_ZH : DOCS
  const extra = chinese ? EXTRA_ZH : EXTRA
  const head = chinese
    ? `# Adaptive Matrix\n\n> ${SUMMARY_ZH}\n\n每个链接都指向该页的原始 Markdown，可以直接抓取。整套文档拼在一起是 ${base}llms-full.txt。\n`
    : `# Adaptive Matrix\n\n> ${SUMMARY}\n\nEvery link below is the page's raw Markdown and can be fetched directly. The whole set concatenated is at ${base}llms-full.txt.\n`
  return [
    head,
    section(base, chinese ? '文档' : 'Docs', docs),
    section(base, chinese ? '规范与示例' : 'Specification and examples', extra),
    machineSection(base, chinese),
  ].join('\n')
}

export function llmsFullTxt(base: string, chinese: boolean): string {
  const entries = [...(chinese ? DOCS_ZH : DOCS), ...(chinese ? EXTRA_ZH : EXTRA)].filter(
    (entry) => entry.index !== 'only',
  )
  const head = chinese
    ? `# Adaptive Matrix — 全部文档\n\n> ${SUMMARY_ZH}\n\n下面是全部文档页面，按阅读顺序拼接。每一节的开头标注了它在仓库中的路径。\n`
    : `# Adaptive Matrix — full documentation\n\n> ${SUMMARY}\n\nEvery documentation page follows, concatenated in reading order. Each section is labelled with its path in the repository.\n`
  const bodies = entries.map((entry) => `\n---\n\n<!-- source: ${entry.source} -->\n\n${read(entry.source)}\n`)
  return [head, ...bodies].join('\n')
}
