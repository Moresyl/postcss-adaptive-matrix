# 构建工具集成

插件是标准 PostCSS 8 插件，凡是能配 PostCSS 的地方都能用。下面是各工具的接法，以及几个会静默出错的点。

## Vite

`postcss.config.mjs`（推荐，与 `vite.config.ts` 解耦）：

```js
import adaptiveMatrix, { appPcPreset } from 'postcss-adaptive-matrix'
import autoprefixer from 'autoprefixer'

export default {
  plugins: [
    adaptiveMatrix(appPcPreset({ rootSelector: '#app' })),
    autoprefixer(),
  ],
}
```

或写在 `vite.config.ts` 里：

```ts
export default defineConfig({
  css: {
    postcss: {
      plugins: [adaptiveMatrix(appPcPreset({ rootSelector: '#app' }))],
    },
  },
})
```

**两者不能同时存在。** Vite 一旦发现 `css.postcss` 是内联对象，就不再读 `postcss.config.*`。

## Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  postcss: {
    plugins: {
      'postcss-adaptive-matrix': { /* 选项 */ },
      autoprefixer: {},
    },
  },
})
```

Nuxt 用的是对象形式，键是包名。要用 `appPcPreset` 就得改回 `postcss.config.mjs` 数组形式——预设返回的是一个对象，没法用包名键表达。

## Webpack

```js
// postcss.config.js
module.exports = {
  plugins: [
    require('postcss-adaptive-matrix')(require('postcss-adaptive-matrix').appPcPreset()),
    require('autoprefixer'),
  ],
}
```

`postcss-loader` 要排在 `css-loader` 之后、预处理器 loader 之前：

```js
use: ['style-loader', 'css-loader', 'postcss-loader', 'sass-loader']
```

## Taro

```js
// config/index.js
const config = {
  mini: { postcss: { /* Taro 自己的插件配置 */ } },
  h5: {
    postcss: {
      'postcss-adaptive-matrix': {
        enable: true,
        config: { defaultProfile: 'app', profiles: { /* ... */ } },
      },
    },
  },
}
```

小程序端建议只用单画布：小程序没有 `@media`，`query: false` 是必须的，`rpx` 也已经在做类似的事，两套换算叠加会翻倍。

---

## 四个静默出错的点

### 1. 插件顺序

放在 `autoprefixer` **之前**。`autoprefixer` 不会给 `clamp()` 加前缀，顺序反了不报错，只是白跑一趟。

放在 `postcss-nesting` 这类展开嵌套的插件**之后**也可以——两种顺序都正确，因为嵌套的 `@adaptive` 现在能正常处理（见[架构](./architecture.md#嵌套)）。

Sass / Less 不属于这个话题：预处理器在 PostCSS 之前跑完，PostCSS 拿到的已经是展开后的 CSS。

### 2. `from` 必须传

按文件路径判定画布的功能——`routes` 的 `file` 通道、`include` / `exclude`、组件库的路径匹配——全部依赖 PostCSS 的 `from`。

Vite、Webpack、Nuxt、Taro 都会传。但如果你手写 `postcss(...).process(css)` 而不传 `from`，文件路径退化成空串，所有 `file` 匹配静默失效——不报错，只是组件库不再被认领。

```js
// 错
await postcss([adaptiveMatrix(options)]).process(css)

// 对
await postcss([adaptiveMatrix(options)]).process(css, { from: '/abs/path/app.css' })
```

### 3. Vue SFC 的路径带 query 串

Vite 给 `<style>` 块的 `from` 长这样：

```
/project/src/views/mobile/home/index.vue?vue&type=style&index=0&lang.scss
```

写 `file` 匹配时按**包含**去写，不要锚定结尾：

```js
routes: [{ profile: 'mobile', file: [/[\\/]mobile[\\/]/] }]   // 对
routes: [{ profile: 'mobile', file: [/\.mobile\.scss$/] }]     // SFC 匹配不到
```

Windows 与 POSIX 的分隔符不同，所以用 `[\\/]` 而不是 `/`。

### 4. 组件化项目的根容器基础样式会逐文件重复

配了 `rootSelector` / `root` 之后，插件会追加一段全局基础样式。它是全局的，但 PostCSS 一次只看见一个文件，没有跨文件去重的余地——所以默认**每个文件各一份**。

Vue / Svelte 里每个组件的 `<style>` 块都是独立文件，于是 150 个组件就是 150 份安全区变量和根列规则。不报错，只是产物白白变大。

```js
appPcPreset({
  rootSelector: '#app',
  rootInjectTo: 'src/styles/main',   // 只注入入口这一份
})
```

反过来，匹配不上就一份都没有，同样不报错。用 `npx adaptive-matrix src/styles/main.css` 确认入口文件里出现了新增声明。

---

## 原子化 CSS

UnoCSS、Tailwind 生成的工具类 CSS 会经过 PostCSS，因此同样会被换算。这通常正是你要的：`p-4` 生成的 `padding: 16px` 和你手写的 `padding: 16px` 应该得到同一个结果。

两点注意：

- 如果原子化框架配了 rem 输出，产出的是 `rem` 而不是 `px`，本插件默认只认 `px`，不会处理。需要处理就把框架切回 px 输出（UnoCSS 的 `@unocss/preset-rem-to-px` 就是干这个的）。
- 工具类没有类名前缀特征，所以它们走 `defaultProfile`。要让某一批工具类走别的画布，用 `routes` 的 `selector` 通道。

## 组件库按需引入

`unplugin-vue-components` 之类的按需引入，最终仍然是从 `node_modules` 里引 CSS 文件，路径通道照常命中，不需要额外配置。

但**不要**为了"性能"加 `exclude: [/node_modules/]`——那会把组件库的 CSS 整个排除在外，组件就回到原始像素，和你缩放后的页面对不齐。这正是[组件库适配](./libraries.md)要解决的问题。

## 校验

改完配置，跑一遍产物比看配置可靠：

```bash
npx adaptive-matrix src/styles/app.css -c postcss.config.mjs
```

输出是逐条声明的前后对照，不用启动构建、不用开浏览器。上面那个「`from` 必须传」的坑，也可以用 `--from` 先试一遍再上线。完整用法见[命令行预览](./cli.md)。

## 这一篇是跑过真实构建的

本文关于 Vite 的每一条说法都由 `test/vite.test.ts` 里的**真实 Vite 构建**验证，而不是靠 `postcss().process` 模拟。构建脚手架包含一个自动发现的 `postcss.config.mjs`、一份从 `node_modules` 里引入的依赖 CSS、以及一个由 `@vitejs/plugin-vue` 同款方式提供的 `<style>` 块，然后断言：

- 配置文件确实被 Vite 找到并生效（没生效时构建照样成功、样式表原样输出，没有任何地方会说话）；
- 依赖的 CSS 按 `node_modules` 路径落到组件库画布，产出与页面上等价尺寸**逐字节相同**；
- 带 query 串的 SFC id 能被包含式 `file` 路由命中；
- 同样的输入再构建一次，产物完全一致（watch / HMR 会反复跑同一条流水线）；
- 反过来，用 `/\.mobile\.css$/` 这种锚定结尾的写法，SFC 块确实静默留在默认画布上——上面第 3 条说的就是这件事，这条测试让它成为验证过的事实而不是记忆。

Webpack 侧没有起真实构建。`postcss-loader` 做的事就是带着 `from` 调 `postcss.process`，而 Webpack 场景真正出过问题的是 CommonJS 入口能不能直接调用（0.4.0 修复），那一条由 `test/package.test.ts` 针对构建产物本身验证。为一条几乎没有独立风险的路径引入整套 Webpack 依赖，不划算。
