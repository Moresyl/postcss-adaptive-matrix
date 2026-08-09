# postcss-adaptive-matrix

[![CI](https://github.com/Moresyl/postcss-adaptive-matrix/actions/workflows/ci.yml/badge.svg)](https://github.com/Moresyl/postcss-adaptive-matrix/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/postcss-adaptive-matrix.svg)](https://www.npmjs.com/package/postcss-adaptive-matrix)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![PostCSS 8](https://img.shields.io/badge/PostCSS-8-dd3a0a.svg)](https://postcss.org/)

一个面向多端设计系统的 PostCSS 8 响应式编译器。同一项目可以让 App/H5 按一套设计宽度开发，让 PC 按另一套设计宽度开发，并在各自区间内连续自适应。

它吸收了 `postcss-px-to-viewport-8-plugin` 的低迁移成本和 `postcss-mobile-forever` 的多屏、限宽思想，但核心模型不再是“把所有端都缩放成同一张移动端设计稿”，而是：

- App 与 PC 拥有独立设计画布，例如 `375` 与 `1440`；
- 每个画布拥有独立断点、流体区间、单位和容器查询；
- 尺寸默认输出为有上下界的 `clamp()`，不会无限放大或缩小；
- 文字使用 `rem + vw/cqi` 混合公式，支持浏览器文字缩放；
- 可选 VisualViewport 运行时，覆盖 App WebView、软键盘和动态视口；
- 完整 TypeScript 类型，同时发布 ESM 与 CommonJS。

## 快速开始

```bash
npm i -D postcss postcss-adaptive-matrix
```

`postcss.config.mjs`：

```js
import adaptiveMatrix, { appPcPreset } from 'postcss-adaptive-matrix'

export default {
  plugins: [
    adaptiveMatrix(
      appPcPreset({
        appDesignWidth: 375,
        pcDesignWidth: 1440,
        rootSelector: '#app',
      }),
    ),
  ],
}
```

业务 CSS：

```css
/* 普通规则默认按 app 画布处理 */
.page {
  padding: 16px;
  font-size: 16px;
}

@adaptive app {
  .hero {
    height: 240px;
  }
}

@adaptive pc {
  .page {
    padding: 48px 64px;
  }

  .hero {
    height: 560px;
  }
}
```

关键输出类似：

```css
.page {
  padding: clamp(13.65333px, 4.26667vw, 20.48px);
  font-size: clamp(
    0.94867rem,
    calc(0.65rem + 1.49333vw),
    1.098rem
  );
}

@media (max-width: 767.98px) {
  /* 375 设计画布，320~480 流体区间 */
}

@media (min-width: 768px) {
  /* 1440 设计画布，1024~1920 流体区间 */
}
```

这意味着开发者仍然按照设计稿写熟悉的 `px`；编译器负责把它转换成连续、有限、有语义的多端尺寸。

## 为什么不是再做一个 px → vw

| 能力 | px-to-viewport-8 | mobile-forever | adaptive-matrix |
| --- | --- | --- | --- |
| PostCSS 8 | 是 | 是 | 是 |
| App/PC 独立设计宽度 | 否 | 否，单移动画布缩放 | 是 |
| 流体尺寸上下限 | 否 | 部分模式 | 默认 |
| 容器查询与 `cqi` | 否 | 否 | 是 |
| 文字缩放可访问性 | 纯 vw 有限制 | 文档提示风险 | 默认混合 `rem` |
| 文件动态设计宽度 | 是 | 是 | 是，且带上下文 |
| 可选 WebView 视口运行时 | 否 | 需其它库 | 内置独立入口 |
| ESM/CJS/TypeScript | 部分 | CJS + 声明 | 完整 |

## 两种创作方式

### 渐进迁移

不写任何新语法。普通 CSS 全部由 `defaultProfile` 转换，适合从 px-to-viewport、pxtorem 或旧 H5 工程迁移。

```css
.button { min-height: 44px; }
```

### 双设计稿模式

用 `@adaptive <profile>` 表达设计稿归属。同一组件只覆盖真正不同的端，不需要复制整份 CSS。

```css
.toolbar { gap: 12px; }

@adaptive pc {
  .toolbar { gap: 24px; grid-template-columns: 240px 1fr; }
}
```

## 自定义平板、车机、折叠屏和组件容器

```js
import adaptiveMatrix, { defineConfig } from 'postcss-adaptive-matrix'

const config = defineConfig({
  defaultProfile: 'app',
  profiles: {
    app: {
      designWidth: 375,
      fluid: { minWidth: 320, maxWidth: 480 },
      query: '(max-width: 767.98px)',
    },
    tablet: {
      designWidth: 834,
      fluid: { minWidth: 768, maxWidth: 1199 },
      query: '(min-width: 768px) and (max-width: 1199.98px)',
    },
    pc: {
      designWidth: 1440,
      fluid: { minWidth: 1200, maxWidth: 1920 },
      query: '(min-width: 1200px)',
    },
    dashboardPanel: {
      designWidth: 800,
      fluid: { minWidth: 400, maxWidth: 1200 },
      unit: 'cqi',
      query: {
        type: 'container',
        name: 'workspace',
        condition: '(min-width: 400px)',
      },
    },
  },
})

export default { plugins: [adaptiveMatrix(config)] }
```

```css
@adaptive dashboardPanel {
  .chart { padding: 24px; }
}
```

## 精准控制

```css
/* 忽略下一条声明 */
/* adaptive-ignore-next */
width: 320px;

/* 忽略当前行 */
height: 44px; /* adaptive-ignore */

/* 忽略下一整个规则 */
/* adaptive-ignore-rule */
.third-party-widget { width: 300px; }
```

默认保留绝对值不超过 `1px` 的细线；字符串、`url()`、`local()`、`format()` 和 CSS 自定义属性不会误转换。

## App/WebView 可选运行时

CSS 编译不需要 JavaScript。只有需要处理软键盘、VisualViewport 或原生壳动态高度时才引入：

```js
import { observeAdaptiveViewport } from 'postcss-adaptive-matrix/runtime'

const viewport = observeAdaptiveViewport()

// 页面卸载时
viewport.destroy()
```

运行时会发布：

- `--adaptive-width`、`--adaptive-height`；
- `--adaptive-layout-height`、`--adaptive-keyboard-height`；
- `--adaptive-scale`；
- `--adaptive-vh`、`--adaptive-vw`。

若启用 `rootSelector`，编译器还会注入 `env(safe-area-inset-*)` 对应的四个安全区变量。

## 框架接入

Vite、Vue、React、Svelte、Nuxt 等使用标准 `postcss.config.mjs` 即可。Next.js CommonJS 配置可写：

```js
const { adaptiveMatrix, appPcPreset } = require('postcss-adaptive-matrix')

module.exports = {
  plugins: [adaptiveMatrix(appPcPreset({ rootSelector: '#__next' }))],
}
```

插件应放在会生成新长度值的插件之后、压缩插件之前。若 Tailwind/UnoCSS 会生成 CSS，把 adaptive-matrix 放在它们之后。

## 文档

- [App + PC 工作流](./docs/app-pc-workflow.md)
- [完整配置参考](./docs/configuration.md)
- [架构与转换公式](./docs/architecture.md)
- [从两个参考插件迁移](./docs/migration.md)
- [发布与兼容性](./docs/release.md)
- [完整示例](./examples/app-pc/)

## 兼容性

- Node.js 18+
- PostCSS 8.4+
- `clamp()`：现代浏览器基线能力
- 容器查询配置需要支持 `@container`/`cqi` 的浏览器
- 需要兼容更老的 WebView 时使用 `strategy: 'viewport'`，或结合 `preserveOriginal: true` 自行提供降级值

## 开发

```bash
npm install
npm run check
npm run pack:check
```

项目测试覆盖普通/负值、文字、引号与 URL、忽略规则、文件匹配、动态画布、容器查询、根布局、错误配置、SSR 与 VisualViewport。

## License

MIT

欢迎阅读[贡献指南](./CONTRIBUTING.md)并参与开发。安全问题请按照[安全策略](./SECURITY.md)私下报告。
