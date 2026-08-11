<p align="center">
  <img src="https://raw.githubusercontent.com/Moresyl/postcss-adaptive-matrix/main/docs/assets/banner.svg" alt="postcss-adaptive-matrix — 一张设计稿，一个画布" width="900">
</p>

<p align="center">
  <a href="https://github.com/Moresyl/postcss-adaptive-matrix/actions/workflows/ci.yml"><img src="https://github.com/Moresyl/postcss-adaptive-matrix/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/postcss-adaptive-matrix"><img src="https://img.shields.io/npm/v/postcss-adaptive-matrix.svg" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"></a>
  <a href="https://postcss.org/"><img src="https://img.shields.io/badge/PostCSS-8-dd3a0a.svg" alt="PostCSS 8"></a>
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>简体中文</b>
</p>

<p align="center">
  <a href="https://moresyl.github.io/postcss-adaptive-matrix/zh/"><b>文档站</b></a> ·
  <a href="https://moresyl.github.io/postcss-adaptive-matrix/zh/docs/playground">在线试验场</a> ·
  <a href="https://moresyl.github.io/postcss-adaptive-matrix/zh/docs/configuration">配置参考</a> ·
  <a href="https://moresyl.github.io/postcss-adaptive-matrix/zh/llms.txt">llms.txt</a>
</p>

你按设计稿写 `px`，编译器负责换算。但换算的前提是先知道这个 `px` 画在哪张稿子上——**这就是整个项目的核心模型**。

## 同一个 16px，三个正确答案

<p align="center">
  <img src="https://raw.githubusercontent.com/Moresyl/postcss-adaptive-matrix/main/docs/assets/canvas-model.svg" alt="多画布模型：同一个 16px 来自三张设计稿，各按所属画布换算" width="900">
</p>

页面画在 750 上，装进来的移动端组件库画在 375 上，桌面端组件库根本没有画布而是按真实像素绘制。把它们塞进同一个换算公式，得到的一定是三个错误里挑一个。

把组件库加进忽略名单也解决不了：页面缩放而组件不动，或者组件按错误画布被拉变形——这正是忽略名单唯一能给出的两个选项。

给每张设计稿一个**画布**，才是对的。**而这是默认行为，不需要配置。**

## 安装

```bash
npm i -D postcss postcss-adaptive-matrix
```

## 快速开始

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

业务 CSS 照常写：

```css
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

## 能力

| | |
| --- | --- |
| **多画布** | App、PC、平板、车机各有独立设计宽度、断点、流体区间与单位 |
| **有界流体** | 默认输出 `clamp()`，不会无限放大或无限压缩 |
| **文字可访问** | `rem + vw` 混合公式，浏览器文字缩放依然有效（WCAG 1.4.4） |
| **组件库开箱适配** | 内置 11 个主流库，按各自画布换算，无需忽略名单 |
| **主题 token** | `:root` 上的库变量按名字识别，字号自动走文字公式 |
| **固定定位修正** | 居中列布局下 `position: fixed` 不再贴到视口边 |
| **容器查询** | `unit: 'cqi'` + `@container`，尺寸依赖容器而非窗口 |
| **原子化 CSS** | Tailwind 与 UnoCSS 两个大版本，连它们工具类读的主题 token 一起认领 |
| **可选运行时** | VisualViewport 观察器，覆盖 WebView、软键盘与动态视口 |
| **命令行预览** | 改完配置不用构建，一行命令看到逐条声明的换算结果 |
| **断点接缝检查** | 自动找出「窗口变宽、尺寸反而变小」的位置——两张设计稿没对齐的地方 |
| **浏览器支持审计** | 拿产物去对你要支持的最低浏览器版本，逐条列出超标的语法 |
| **工程化** | 完整 TypeScript 类型，ESM + CJS 双产物，语言无关一致性套件 |

## 有界流体尺寸

<p align="center">
  <img src="https://raw.githubusercontent.com/Moresyl/postcss-adaptive-matrix/main/docs/assets/fluid-range.svg" alt="clamp 在流体区间两端都有界，纯 vw 没有尽头" width="900">
</p>

纯 `vw` 在大屏无限放大、小屏无限压缩。默认策略给每个尺寸加上下界：区间内跟随视口，区间外停住。600px 宽的小平板因此不会看到被粗暴放大的手机 UI。

## 组件库开箱适配

```js
adaptiveMatrix({
  defaultProfile: 'app',
  profiles: {
    app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 } },
  },
})
```

```css
/* 输入 —— 四处都写 16px */
:root       { --van-padding-md: 16px }
.van-cell   { padding: 16px }
.el-input   { padding: 16px }
.page-hero  { padding: 16px }
```

```css
/* 输出 —— 各按所属画布 */
:root       { --van-padding-md: clamp(13.65333px, 4.26667vw, 25.6px) }
.van-cell   { padding: clamp(13.65333px, 4.26667vw, 25.6px) }
.el-input   { padding: 16px }
.page-hero  { padding: clamp(6.82667px, 2.13333vw, 12.8px) }
```

内置：`vant`、`nutui`、`varlet`、`antd-mobile`、`taro-ui`、`element-plus`、`antd`、`arco-design`、`naive-ui`、`quasar`、`mui`。

未收录的库写一行定义即可，收录的库用 `extends` 改一项即可。完整说明见[组件库适配](./docs/libraries.zh-CN.md)。

## 精准控制

```css
/* adaptive-ignore-next */
width: 320px;              /* 忽略下一条声明 */

height: 44px;              /* adaptive-ignore */   /* 忽略当前行 */

/* adaptive-ignore-rule */
.widget { width: 300px }   /* 忽略下一整个规则 */
```

这三个注释会保留在产物里，因此产物再过一遍编译时仍然生效（压缩器会去掉它们）。默认保留不超过 `1px` 的细线；字符串、`url()`、`local()`、`format()` 不会误转换。

## 改一个数字，立刻看到结果

```bash
npx adaptive-matrix src/styles/app.css
```

```
src/styles/app.css
  profiles: app (default), pc, +5 library canvases
  .page
    padding    16px → clamp(13.65333px, 4.26667vw, 20.48px)
    font-size  16px → clamp(0.94867rem, calc(0.65rem + 1.49333vw), 1.098rem)
  @media (min-width: 768px) › .page
    padding    48px → clamp(34.13333px, 3.33333vw, 64px)
  shrinks .card font-size gets smaller at 768px: 17.57px → 16.18px
  3 converted, 0 left as authored
```

不用启动构建，不用开浏览器。

最后那行是断点接缝检查：App 稿写 16px、PC 稿写 18px，两个数字单独看都合理，但把窗口拉宽一个像素，正文字号会突然变小。编译器输出的公式在视口宽度上都是单调不减的，所以尺寸倒退只可能来自跨断点换画布——两张稿子在这个元素上没对齐。

`--from` 还能把文件路由先试一遍——这是最容易配错又最不容易发现的一项。详见[命令行预览](./docs/cli.zh-CN.md)。

## 产物到底要求浏览器做到什么

```bash
npx adaptive-matrix src/app.css --targets "ios_saf 13, chrome 90"
```

```
  needs @layer — iOS Safari 13 < 15.4, Chrome 90 < 99
          if unsupported: The whole @layer block is dropped, so the entire root
          foundation goes with it — the centred column, the safe-area variables
          and the fixed-position correction all vanish at once.
          instead: root.layer: false emits the same rules unwrapped. ...
  needs clamp(), min(), max() — iOS Safari 13 < 13.4-13.7
```

CSS 不会优雅降级，它**丢弃**，而且全程不说话：值读不懂丢一条声明，选择器读不懂丢一整条规则，`@` 规则读不懂丢一整块。所以审计读的是**编译产物**而不是配置——这是让两者永远不会走偏的唯一做法——并且对每一项先说丢什么，再说换成什么。

版本数据在构建期烘焙进包，因此不增加任何运行时依赖，离线可用。见[浏览器特性支持与降级](./docs/compatibility.zh-CN.md)。

## 文档

| | |
| --- | --- |
| [快速上手与双设计稿工作流](./docs/getting-started.zh-CN.md) | 从安装到 App/PC 双稿协作 |
| [构建工具集成](./docs/integration.zh-CN.md) | Vite、Nuxt、Webpack、Taro，以及四个静默出错的点 |
| [命令行预览](./docs/cli.zh-CN.md) | `npx adaptive-matrix`：不用构建就能看到换算结果 |
| [组件库适配](./docs/libraries.zh-CN.md) | 内置清单、匹配方式、覆盖与扩展 |
| [配置参考](./docs/configuration.zh-CN.md) | 全部选项、类型与默认值 |
| [架构与转换公式](./docs/architecture.zh-CN.md) | 编译流程、数学公式、幂等、实现边界 |
| [可选运行时](./docs/runtime.zh-CN.md) | VisualViewport 观察器：软键盘、地址栏、WebView |
| [浏览器特性支持与降级](./docs/compatibility.zh-CN.md) | 特性 × 版本表、不支持时丢什么、每一项怎么关 |
| [迁移指南](./docs/migration.zh-CN.md) | 从其它 px 换算方案迁移 |
| [发布与兼容性](./docs/release.zh-CN.md) | 产物、Node 版本、版本策略 |
| [一致性套件](./conformance/README.zh-CN.md) | 语言无关的行为规范 |
| [完整示例](./examples/app-pc/) | 可运行的 App + PC 工程 |

## 兼容性

- Node.js 18+，PostCSS 8.4+
- `clamp()`、`min()`：现代浏览器基线能力
- 容器查询配置需要支持 `@container` / `cqi` 的浏览器
- 更老的 WebView 使用 `strategy: 'viewport'`，或配合 `preserveOriginal: true` 自行提供降级值——用 `--targets` 可以直接看到产物到底要求了什么

## 开发

```bash
npm install
npm run check          # 类型检查 + 覆盖率测试 + 构建
npm run conformance:update
npm run bench
```

## License

MIT。欢迎阅读[贡献指南](./CONTRIBUTING.zh-CN.md)参与开发；安全问题请按[安全策略](./SECURITY.zh-CN.md)私下报告。
