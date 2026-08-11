import { defineConfig } from 'vitepress'
import { generatedAssets, writeGeneratedAssets } from './generated'
import { localeLinks } from './links'
import { rewrite } from './paths'

const REPO = 'https://github.com/Moresyl/postcss-adaptive-matrix'

/** GitHub Pages serves the project at a sub-path. Override for a custom domain. */
const BASE = process.env.DOCS_BASE ?? '/postcss-adaptive-matrix/'

/**
 * The site is built out of the repository itself rather than a copy of it.
 *
 * `srcDir` is the repository root, so `docs/README.md` linking to
 * `../conformance/README.md` links to a real page here for the same reason it
 * does on GitHub. See `./paths.ts` for how the two layouts are reconciled.
 */
export default defineConfig({
  srcDir: '..',
  base: BASE,
  title: 'Adaptive Matrix',
  description:
    'Multi-canvas responsive CSS compiler for PostCSS 8 — one design width per design file.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  metaChunk: true,
  head: [
    ['link', { rel: 'icon', href: `${BASE}favicon.svg`, type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#4c6ef5' }],
  ],

  rewrites: rewrite,
  // The two repository front pages carry npm badges and a install-me pitch that
  // the site's own home page says better. Everything else is published.
  srcExclude: [
    'README.md',
    'README.zh-CN.md',
    '**/node_modules/**',
    'bench/**',
    'test/**',
    'conformance/cases/**',
  ],

  markdown: {
    config: localeLinks,
    lineNumbers: false,
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/docs/getting-started' },
          { text: 'Playground', link: '/docs/playground' },
          { text: 'Configuration', link: '/docs/configuration' },
          { text: 'Component libraries', link: '/docs/libraries' },
          {
            text: 'More',
            items: [
              { text: 'For AI agents', link: '/docs/agents' },
              { text: 'Changelog', link: '/CHANGELOG' },
              { text: 'Conformance suite', link: '/conformance/' },
              { text: 'npm', link: 'https://www.npmjs.com/package/postcss-adaptive-matrix' },
            ],
          },
        ],
        sidebar: [
          {
            text: 'Guide',
            items: [
              { text: 'Documentation index', link: '/docs/' },
              { text: 'Getting started', link: '/docs/getting-started' },
              { text: 'Playground', link: '/docs/playground' },
              { text: 'Build tool integration', link: '/docs/integration' },
              { text: 'CLI preview', link: '/docs/cli' },
              { text: 'Component libraries', link: '/docs/libraries' },
              { text: 'Migration guide', link: '/docs/migration' },
            ],
          },
          {
            text: 'Reference',
            items: [
              { text: 'Configuration', link: '/docs/configuration' },
              { text: 'Architecture and formulas', link: '/docs/architecture' },
              { text: 'Optional runtime', link: '/docs/runtime' },
              { text: 'Browser support', link: '/docs/compatibility' },
              { text: 'Release and compatibility', link: '/docs/release' },
              { text: 'Documentation for agents', link: '/docs/agents' },
            ],
          },
          {
            text: 'Specification',
            items: [
              { text: 'Conformance suite', link: '/conformance/' },
              { text: 'Runnable example', link: '/examples/app-pc/' },
            ],
          },
          {
            text: 'Project',
            items: [
              { text: 'Changelog', link: '/CHANGELOG' },
              { text: 'Contributing', link: '/CONTRIBUTING' },
              { text: 'Security policy', link: '/SECURITY' },
              { text: 'Code of conduct', link: '/CODE_OF_CONDUCT' },
            ],
          },
        ],
        editLink: {
          pattern: `${REPO}/edit/main/:path`,
          text: 'Edit this page on GitHub',
        },
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © Moresyl and contributors',
        },
        outline: { level: [2, 3], label: 'On this page' },
      },
    },

    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Adaptive Matrix',
      description: '面向 PostCSS 8 的多画布响应式 CSS 编译器——一张设计稿一个换算基准。',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/docs/getting-started' },
          { text: '试验场', link: '/zh/docs/playground' },
          { text: '配置', link: '/zh/docs/configuration' },
          { text: '组件库', link: '/zh/docs/libraries' },
          {
            text: '更多',
            items: [
              { text: '面向 AI 的文档', link: '/zh/docs/agents' },
              { text: '更新日志', link: '/zh/CHANGELOG' },
              { text: '一致性套件', link: '/zh/conformance/' },
              { text: 'npm', link: 'https://www.npmjs.com/package/postcss-adaptive-matrix' },
            ],
          },
        ],
        sidebar: [
          {
            text: '指南',
            items: [
              { text: '文档索引', link: '/zh/docs/' },
              { text: '快速上手', link: '/zh/docs/getting-started' },
              { text: '在线试验场', link: '/zh/docs/playground' },
              { text: '构建工具集成', link: '/zh/docs/integration' },
              { text: '命令行预览', link: '/zh/docs/cli' },
              { text: '组件库适配', link: '/zh/docs/libraries' },
              { text: '迁移指南', link: '/zh/docs/migration' },
            ],
          },
          {
            text: '参考',
            items: [
              { text: '配置参考', link: '/zh/docs/configuration' },
              { text: '架构与转换公式', link: '/zh/docs/architecture' },
              { text: '可选运行时', link: '/zh/docs/runtime' },
              { text: '浏览器支持与降级', link: '/zh/docs/compatibility' },
              { text: '发布与兼容性', link: '/zh/docs/release' },
              { text: '面向 AI 的文档', link: '/zh/docs/agents' },
            ],
          },
          {
            text: '规范',
            items: [
              { text: '一致性套件', link: '/zh/conformance/' },
              { text: '可运行示例', link: '/zh/examples/app-pc/' },
            ],
          },
          {
            text: '项目',
            items: [
              { text: '更新日志', link: '/zh/CHANGELOG' },
              { text: '参与贡献', link: '/zh/CONTRIBUTING' },
              { text: '安全策略', link: '/zh/SECURITY' },
              { text: '行为准则', link: '/zh/CODE_OF_CONDUCT' },
            ],
          },
        ],
        editLink: {
          pattern: `${REPO}/edit/main/:path`,
          text: '在 GitHub 上编辑此页',
        },
        footer: {
          message: '基于 MIT 协议发布',
          copyright: 'Copyright © Moresyl and contributors',
        },
        outline: { level: [2, 3], label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdatedText: '最后更新',
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '目录',
        darkModeSwitchLabel: '外观',
        langMenuLabel: '切换语言',
      },
    },
  },

  themeConfig: {
    logo: `${BASE}favicon.svg`,
    siteTitle: 'Adaptive Matrix',
    socialLinks: [{ icon: 'github', link: REPO }],
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                displayDetails: '显示详细列表',
                resetButtonTitle: '清除查询条件',
                backButtonTitle: '返回',
                noResultsText: '无法找到相关结果',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },
  },

  ignoreDeadLinks: [
    // Source files and directories that exist in the repository but are not
    // pages. They resolve on GitHub, which is where they are meant to be read.
    /^(?:\.\.?\/)+(?:src|test|bench|scripts|conformance\/cases|examples\/[^/]+\/(?:src|css|dist))\//,
  ],

  vite: {
    plugins: [generatedAssets()],
  },

  async buildEnd(site) {
    await writeGeneratedAssets(site.outDir)
  },
})
