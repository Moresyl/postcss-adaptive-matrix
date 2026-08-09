# postcss-adaptive-matrix

[![CI](https://github.com/Moresyl/postcss-adaptive-matrix/actions/workflows/ci.yml/badge.svg)](https://github.com/Moresyl/postcss-adaptive-matrix/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/postcss-adaptive-matrix.svg)](https://www.npmjs.com/package/postcss-adaptive-matrix)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![PostCSS 8](https://img.shields.io/badge/PostCSS-8-dd3a0a.svg)](https://postcss.org/)

一个面向多端设计系统的 PostCSS 8 响应式编译器。你按设计稿写 `px`，它负责换算——但换算的前提是先知道这个 `px` 画在哪张稿子上。

**一张设计稿一个画布，这是整个项目的核心模型。** 页面画在 750 上，Vant 画在 375 上，Element Plus 根本没有画布而是按真实像素绘制。同一个 `16px`，在这三处的含义完全不同。把它们塞进同一个换算公式，得到的一定是三个错误里挑一个。

- App、PC、平板、车机各有独立画布、断点、流体区间与单位；
- 尺寸默认输出有上下界的 `clamp()`，不会无限放大或缩小；
- 文字使用 `rem + vw/cqi` 混合公式，浏览器文字缩放依然有效；
- **主流组件库开箱适配**，无需配置，也不靠忽略名单；
- 居中列布局下自动修正 `position: fixed` 的包含块；
- 可选 VisualViewport 运行时，覆盖 WebView、软键盘与动态视口；
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

@adaptive pc {
  .page {
    padding: 48px 64px;
  }
}
```

输出：

```css
.page {
  padding: clamp(13.65333px, 4.26667vw, 20.48px);
  font-size: clamp(0.94867rem, calc(0.65rem + 1.49333vw), 1.098rem);
}

@media (min-width: 768px) {
  .page {
    padding: clamp(34.13333px, 3.33333vw, 64px) clamp(45.51111px, 4.44444vw, 85.33333px);
  }
}
```

到这里，组件库适配、安全区变量、根列布局和 `position: fixed` 修正已经全部生效，不需要再写一行配置。

## 设计取舍

| 问题 | 本项目的做法 |
| --- | --- |
| 一个项目有多张设计稿 | 每张稿子一个 profile，`@adaptive <profile>` 显式归属 |
| 纯 `vw` 在大屏无限放大 | 默认 `clamp()`，流体区间两端都有界 |
| 纯 `vw` 字号使浏览器缩放失效 | 文字走 `rem + vw` 混合，`fontFluidity` 控制流体比例（WCAG 1.4.4） |
| 组件库画布与项目不同 | 给它自己的画布换算，而不是加进忽略名单 |
| 组件库主题 token 声明在 `:root`，无类名可依 | 独立的属性名匹配通道，优先级高于选择器与路径 |
| 打包后路径消失，路径匹配失效 | 类名与属性名优先于文件路径 |
| 居中列布局下 `position: fixed` 贴到视口边 | 发布列宽与留白变量，自动修正 inset 与宽度 |
| 组件容器需要独立于视口的尺寸 | `unit: 'cqi'` + `@container` 查询 |
| 旧 WebView 不支持 `clamp()` | `strategy: 'viewport'`，配合 `preserveOriginal` 输出回退 |

## 两种创作方式

### 渐进迁移

不写任何新语法。普通 CSS 全部由 `defaultProfile` 转换，适合旧 H5 工程逐步接入。

```css
.button { min-height: 44px; }
```

### 多设计稿模式

用 `@adaptive <profile>` 表达设计稿归属。同一组件只覆盖真正不同的端，不需要复制整份 CSS。

```css
.toolbar { gap: 12px; }

@adaptive pc {
  .toolbar { gap: 24px; grid-template-columns: 240px 1fr; }
}
```

## 组件库自动适配

第三方组件库有自己的设计稿。Vant 画在 375 上，你的项目可能画在 750 上——同样一个 `16px`，含义并不相同。

只把组件库加进忽略名单，页面缩放而组件不动；直接按项目画布转换，组件被拉变形。两种做法都不对，而这正是忽略名单唯一能给出的两个选项。

正确的做法是给它自己的画布，**而这是默认行为**：

```js
adaptiveMatrix({
  defaultProfile: 'app',
  profiles: {
    app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 } },
  },
})
```

```css
/* 输入 */
:root {
  --van-padding-md: 16px;
  --van-font-size-md: 14px;
}
.van-button { height: 44px; }
.el-button  { height: 32px; }
.page-hero  { height: 44px; }
```

```css
/* 输出：项目画布 750，Vant 画布 375，Element Plus 保留像素 */
:root {
  --van-padding-md: clamp(13.65333px, 4.26667vw, 25.6px);
  --van-font-size-md: clamp(0.83008rem, calc(0.56875rem + 1.30667vw), 1.05875rem);
}
.van-button { height: clamp(37.54667px, 11.73333vw, 70.4px); }
.el-button  { height: 32px; }
.page-hero  { height: clamp(18.77333px, 5.86667vw, 35.2px); }
```

三点值得注意：

- **`.van-button` 与 `.page-hero` 同为 `44px`，输出不同**——各自按所属画布换算，这正是目的所在。
- **`--van-font-size-md` 走的是 `rem + vw`**，与真实的 `font-size` 声明逐字节一致。组件库字号几乎全部通过 token 定义，若按普通长度处理会输出纯 `vw`，浏览器缩放随即失效。
- **`.el-button` 原样保留**。桌面端组件库本就按真实像素绘制，不缩放才是正确适配。

### 匹配方式

三条独立通道，任一命中即可：类名前缀、自定义属性前缀、文件路径。

类名与属性名优先于路径，因为打包器会把依赖的 CSS 内联进产物，路径随即消失，而 `.van-` 和 `--van-` 不会。主题 token 声明在 `:root` 上不带任何类名，只能靠名字识别——这也是必须有属性通道的原因。

### 内置清单

移动端画布：`vant`、`nutui`、`varlet`、`antd-mobile`、`taro-ui`。

桌面端保留像素：`element-plus`、`antd`、`arco-design`、`naive-ui`、`quasar`、`mui`。

清单可以在运行时读取：

```js
import { BUILT_IN_LIBRARIES } from 'postcss-adaptive-matrix'
```

收录标准有意从严：前缀必须无歧义，画布必须来自官方文档而非推测。像 `.p-`、`.v-` 这类会与工具类框架和业务代码相撞的前缀不予收录——误命中是静默的，比不收录更糟。

同样出于这个理由，`naive-ui`（`.n-`）、`quasar`（`.q-`）、`taro-ui`（`.at-`）这三个库在自动模式下**只按路径匹配**：它们的前缀确实是官方前缀，但也和普通业务类名长得一模一样。显式写出库名，就是在告诉编译器这个前缀在你的代码库里是安全的：

```js
adaptiveMatrix({ libraries: ['vant', 'naive-ui'] })
```

### 覆盖与扩展

某个内置条目和你的实际情况不符时，用 `extends` 只改那一项，其余继承：

```js
adaptiveMatrix({
  libraries: [
    { extends: 'vant', designWidth: 750 },   // 定制主题改了画布
    { extends: 'element-plus', designWidth: 375 }, // 桌面库用在移动端
  ],
})
```

没收录的库直接写完整定义：

```js
adaptiveMatrix({
  libraries: [
    { name: 'internal-kit', designWidth: 414, prefix: 'ik-', tokenPrefix: '--ik-' },
  ],
})
```

`designWidth: false` 表示保留像素。`libraries: false` 整体关闭。`routes` 中的显式规则优先于 `libraries`——路由是决定，库条目只是默认值。

## 居中列与 position: fixed

给 `root` 配置 `rootMaxWidth`（`appPcPreset` 默认如此），页面就成了一个居中的列。此时 `position: fixed` 会退回以视口为包含块——底部导航栏贴到浏览器窗口两端，和它所在的内容列错开。

编译器发布两个变量并据此修正：

```css
/* 输入 */
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 50px;
}
```

```css
/* 输出 */
.tabbar {
  position: fixed;
  left: var(--adaptive-root-gutter);
  right: var(--adaptive-root-gutter);
  bottom: 0;
  width: min(100%, var(--adaptive-root-width));
  height: clamp(42.66667px, 13.33333vw, 64px);
}
```

`--adaptive-root-gutter` 在列宽等于视口时为 `0`，因此窄屏输出与手写完全一致，只有列真正收窄时才产生偏移。修正是幂等的，重复处理不会叠加留白。

只处理自身声明了 `position: fixed` 的规则——从别处继承定位是 CSS 不允许静态观察的，猜测比漏掉更糟。仅作用于行内轴，块轴（`top` / `bottom`）不受居中列约束。

不需要时：`root: { ..., fixedContainingBlock: false }`。

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

默认保留绝对值不超过 `1px` 的细线；字符串、`url()`、`local()`、`format()` 不会误转换。自己写的 CSS 自定义属性默认也不转换，由 `transformCustomProperties` 控制——被组件库认领的 token 不在此列，认领本身即是开关。

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
- [旧项目迁移指南](./docs/migration.md)
- [发布与兼容性](./docs/release.md)
- [完整示例](./examples/app-pc/)

## 兼容性

- Node.js 18+
- PostCSS 8.4+
- `clamp()`、`min()`：现代浏览器基线能力
- 容器查询配置需要支持 `@container`/`cqi` 的浏览器
- 需要兼容更老的 WebView 时使用 `strategy: 'viewport'`，或结合 `preserveOriginal: true` 自行提供降级值

## 开发

```bash
npm install
npm run check          # 类型检查 + 覆盖率测试 + 构建
npm run conformance    # 语言无关的行为一致性套件
npm run bench          # 编译开销测量
npm run pack:check
```

行为一致性套件以纯数据形式（`case.json` + `input.css` + `expected.css`）描述预期输出，不依赖任何一种测试框架或宿主语言，任何实现只要能读 JSON 与 CSS 就能验证自己是否符合同一份规范。

## License

MIT

欢迎阅读[贡献指南](./CONTRIBUTING.md)并参与开发。安全问题请按照[安全策略](./SECURITY.md)私下报告。
