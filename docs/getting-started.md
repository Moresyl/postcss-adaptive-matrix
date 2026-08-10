# 快速上手

## 安装

```bash
npm i -D postcss postcss-adaptive-matrix
```

## 最小配置

只有一张设计稿时：

```js
// postcss.config.mjs
import adaptiveMatrix from 'postcss-adaptive-matrix'

export default {
  plugins: [
    adaptiveMatrix({
      defaultProfile: 'app',
      profiles: {
        app: {
          designWidth: 375,
          fluid: { minWidth: 320, maxWidth: 480 },
        },
      },
    }),
  ],
}
```

`designWidth` 是设计稿宽度，`fluid` 是尺寸继续跟随视口变化的区间。区间之外尺寸停住——这是与纯 `vw` 方案最大的区别，详见[有界流体](#有界流体)。

## 双设计稿：App + PC

设计团队交付两个画布时用 `appPcPreset`：

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

预设给出的约定：

| | App | PC |
| --- | --- | --- |
| 设计宽度 | 375 | 1440 |
| 流体区间 | 320 ~ 480 | 1024 ~ 1920 |
| 生效条件 | 默认 | `@media (min-width: 768px)` |

## 写业务 CSS

基础选择器写两端共有的部分——布局结构、颜色、交互状态。只把尺寸真正不同的内容放进 `@adaptive pc`，不要维护两份页面：

```css
.product-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
}

@adaptive pc {
  .product-card {
    grid-template-columns: 320px 1fr;
    gap: 32px;
    padding: 32px;
  }
}
```

输出：

```css
.product-card {
  display: grid;
  gap: clamp(10.24px, 3.2vw, 15.36px);
  padding: clamp(13.65333px, 4.26667vw, 20.48px);
  border-radius: clamp(10.24px, 3.2vw, 15.36px);
}

@media (min-width: 768px) {
  .product-card {
    grid-template-columns: clamp(227.55556px, 22.22222vw, 426.66667px) 1fr;
    gap: clamp(22.75556px, 2.22222vw, 42.66667px);
    padding: clamp(22.75556px, 2.22222vw, 42.66667px);
  }
}
```

普通规则按默认 `app` 画布转换；`@adaptive pc` 块按 1440 画布转换，并包裹进 PC 媒体查询。

## 另一种双端：两套页面代码，按文件夹分

上面那种写法是**一套页面、两张稿**——共有的部分只写一遍，差异放进 `@adaptive pc`。

还有一种常见做法是**两套页面代码**：`src/mobile/**` 和 `src/pc/**` 各自完整一份，路由或入口决定进哪一套。这种项目不需要在 CSS 里写 `@adaptive`，用文件路由就够了：

```js
{
  defaultProfile: 'app',
  profiles: {
    app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 } },
    pc:  { designWidth: 1440, fluid: { minWidth: 1024, maxWidth: 1920 } },
  },
  routes: [
    { profile: 'pc',  file: [/[\\/]pc[\\/]/] },
    { profile: 'app', file: [/[\\/]mobile[\\/]/] },
  ],
}
```

同样一行 `padding: 32px`，落在哪个文件夹就按哪张稿换算：

| 文件 | 产物 |
| --- | --- |
| `src/mobile/home/index.vue` | `clamp(13.65333px, 4.26667vw, 25.6px)` |
| `src/pc/home/index.vue` | `clamp(22.75556px, 2.22222vw, 42.66667px)` |

**关键一点：文件路由只决定"按哪张稿换算"，不会给规则套媒体查询。** 这正是这类项目需要的——哪套页面显示已经由路由/入口决定了，CSS 不该再管一遍。上面两条产物都是无条件的。

SFC 的 `from` 带 query 串（`index.vue?vue&type=style&index=0&lang.css`），所以 `file` 要按包含写、不要锚定结尾，见[构建工具集成](./integration.md#3-vue-sfc-的路径带-query-串)。

### 共用组件落在哪张画布上

`src/components/**` 两边都用，两条路由都不命中，于是走 `defaultProfile`。三个选择：

1. **就用默认画布**——组件本来就该在移动端和 PC 端长一样时，这是对的；
2. **按用途再拆一层文件夹**，`src/components/mobile/**` 与 `src/components/pc/**`，各自命中路由；
3. **在组件里用 `@adaptive pc`**——但这条在本节的配置下有个坑，见下。

### 坑：`query` 没设置时 `@adaptive` 会变成无条件规则

这一节的两个 profile 都没有 `query`，因为切换本来就不由 CSS 负责。但一旦有人在共用组件里写：

```css
.shared-card { padding: 32px }
@adaptive pc { .shared-card { padding: 48px } }
```

`pc` 画布没有 `query`,外壳无处可套,于是被拆开——两条规则都是无条件的,而后一条在文件里更靠后,**在任何视口都会赢**:

```css
.shared-card { padding: clamp(13.65333px, 4.26667vw, 25.6px) }
.shared-card { padding: clamp(34.13333px, 3.33333vw, 64px) }   /* 永远是这条生效 */
```

编译器会为此告警并给出两个出口：给 `pc` 加上 `query`，或者写 `query: false` 表明切换发生在 CSS 之外（一端一个产物、或按环境变量选画布）。写了 `query: false` 就不再提示——那是你已经回答过的问题。

同一张画布上的 `@adaptive app` 不告警：没有切换，拆开也不丢东西。

### 组件库不用管

移动端的 Vant、PC 端的 Element Plus 都在 `node_modules` 里，两条文件夹路由都不命中，各自由内置注册表认领——Vant 走 375 画布，Element Plus 保留像素。不需要额外配置。

唯一要注意的是**你写的路由优先于组件库路由**，所以文件夹正则要写得足够具体：`/[\\/]pc[\\/]/` 只匹配路径里独立的 `pc` 段，而 `/pc/` 这种写法会误伤任何路径里带 `pc` 三个字母的依赖。

## 有界流体

![有界流体区间](./assets/fluid-range.svg)

**断点和流体区间不是一回事。** 断点决定哪套布局生效，流体区间决定尺寸在哪段区间里继续缩放。

上面的配置里，App 规则在 768px 之前一直生效，但尺寸到 480px 就停止放大——600px 宽的小平板因此不会看到被粗暴放大的手机 UI。PC 从 768px 起生效，但尺寸在 1024px 以下保持下限，窄窗口不会被过度压缩。

## 文字

字号不走纯 `vw`，而是 `rem + vw` 的混合公式：

```css
.title { font-size: 16px }
```

```css
.title { font-size: clamp(0.94867rem, calc(0.65rem + 1.49333vw), 1.098rem) }
```

静态部分用 `rem`，因此浏览器的文字缩放设置依然有效（WCAG 1.4.4）。纯 `vw` 文字会把用户的缩放选择完全吃掉。混合比例由 `fontFluidity` 控制，默认 `0.35`；在设计宽度处结果仍严格等于设计值。

## 根容器

传入 `rootSelector` 后，插件追加一个低优先级的 `@layer adaptive-matrix`：

- 根元素 `inline-size: 100%`，水平居中；
- App 与 PC 各自在流体上限处停止增长；
- 注入 `env(safe-area-inset-*)` 安全区变量；
- 发布根列宽与留白变量，并据此修正 `position: fixed`。

最后一条值得单独说：页面一旦成为居中的列，`position: fixed` 会退回以视口为包含块，底部导航栏就贴到了窗口两端，与它所在的内容列错开。`appPcPreset` 默认修正这一点，不需要时传 `fixedContainingBlock: false`。参见[配置参考](./configuration.md#fixedcontainingblock)。

已经自己管理根容器的项目省略 `rootSelector` 即可，插件不会注入任何全局 CSS。

### 组件化项目要指定注入位置

这段基础样式是全局的，但 PostCSS 一次只看见一个文件，没有跨文件去重的余地。所以默认每个被处理的文件都会拿到一份。

只有一份全局样式表的项目，这正是想要的。Vue / Svelte 项目则相反：**每个组件的 `<style>` 块都是独立的一个文件**，默认行为等于给 150 个组件各塞一份安全区变量和根列规则。

指到入口样式表上，就只注入一次：

```js
appPcPreset({
  rootSelector: '#app',
  rootInjectTo: 'src/styles/main',   // 字符串按「包含」匹配
})
```

也接受正则和函数，规则与 `include` 一致。直接写 `root` 时对应字段是 `root.injectTo`。

匹配不上不会报错，只是一份都不注入。用[命令行](./cli.md)确认一下最稳妥——入口文件应当出现 `+ inline-size 100%` 这类新增声明：

```bash
npx adaptive-matrix src/styles/main.css -c postcss.config.mjs
```

## 组件库

不需要配置。内置的 11 个主流库按各自设计画布换算，桌面端组件库保留真实像素，主题 token 按名字识别并走文字混合公式。完整清单与覆盖方式见[组件库适配](./libraries.md)。

## 局部关闭

```css
/* adaptive-ignore-next */
width: 320px;

height: 44px; /* adaptive-ignore */

/* adaptive-ignore-rule */
.widget { width: 300px }
```

这三个注释会**保留在产物里**。被忽略的 `40px` 和没人管过的 `40px` 长得一模一样，注释一旦被吃掉，产物再过一遍编译（预编译的依赖被消费方再编译一次就是这种情况）就会把它换算了。注释本身会被任何压缩器去掉。

范围更大的排除用 `propList`、`selectorExclude`、`valueExclude`、`exclude`，或用 `routes` 把某一片 CSS 改派到 `profile: false`。

## 验收尺寸

建议至少在这些宽度做视觉回归：320、375、480、767、768、1024、1440、1920、2560。

另测：浏览器 200% 文字缩放、iOS 安全区、Android WebView 软键盘、横屏、以及使用容器查询的组件。
