# 配置参考

[English](./configuration.md) · **简体中文**

全部选项、类型与默认值。上手请先读[快速上手](./getting-started.zh-CN.md)。

## 顶层配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `profiles` | App/PC 预设 | 多设计画布映射 |
| `defaultProfile` | `app` | 普通 CSS 使用的画布 |
| `routes` | `[]` | 按选择器、属性名、断点或文件改派画布 |
| `libraries` | `'auto'` | 组件库适配，默认启用全部内置项 |
| `atRuleName` | `adaptive` | 自定义 At-rule 名称 |
| `strategy` | `clamp` | `clamp` 或兼容型 `viewport` |
| `unit` | `vw` | `vw`、`vi`、`cqw`、`cqi` |
| `precision` | `5` | 0~12 位小数 |
| `unitToConvert` | `'px'` | 读取的输入单位，可传数组同时读多种 |
| `rootValue` | `16` | 一个 `rem` 折合多少像素 |
| `minPixelValue` | `0` | 小于该绝对值不转换 |
| `hairline` | `1` | 不转换的细线阈值 |
| `fontFluidity` | `0.35` | 文字流体比例，0~1 |
| `textProperties` | 字体相关属性 | 使用可缩放混合公式的属性 |
| `propList` | `['*']` | 支持 `*` 与 `!` 的属性表 |
| `selectorExclude` | `[]` | 字符串包含或正则排除 |
| `valueExclude` | `[]` | 属性值排除 |
| `include` / `exclude` | 无 | 文件字符串、正则、函数或数组 |
| `transformCustomProperties` | `false` | 是否转换 `--token` 值 |
| `preserveOriginal` | `false` | 是否保留原声明作为前置回退 |
| `root` | `false` | 可选根布局基础样式 |
| `unknownProfile` | `warn` | `warn`、`error`、`ignore` |

`propList` 示例：

```js
propList: ['*', '!border*', '!box-shadow']
```

`*` 不能省。只写排除项的 `['!border*']` 在语义上匹配不到任何属性，等于整份样式表都不换算——这种配置会直接报错，不会静默生效。

### 配置一律先校验

配置多半写在 `.mjs` 里，没有任何类型检查兜底，而这些字段写错的后果都是**静默的**——所以下列情况一律在读第一个样式文件之前就报错：

| 写法 | 后果 |
| --- | --- |
| `unit: 'vm'` | 输出 `4.267vm`。它不是长度，浏览器整条声明丢弃，元素保留继承值 |
| `strategy: 'viewpoint'` | 静默回退到 `clamp`，看起来像设置生效了 |
| `unitToConvert: ''` / `[]` | 匹配不到任何长度，与没装插件无法区分 |
| `rootValue: 0` | 每个 `rem` 读成 0，输出侧再除零 |
| `atRuleName: 'media'` | 样式表里每个 `@media` 都被当成画布名读取并改写。At-keyword 大小写不敏感，`MEDIA` 是同一个冲突 |
| `root.selector: ''` | 编译成 `:where()`，这是解析错误——整段基础样式连同安全区变量一起被丢弃 |
| `textAnchorWidth: 0` | 除零，文字长度整列变成 `Infinity` |

`unit` 与 `strategy` 在 profile 级别同样校验。

### unknownProfile

`@adaptive ghost` 里的画布名不存在时：

| 取值 | 行为 |
| --- | --- |
| `warn` | 告警，at-rule 原样保留 |
| `error` | 直接中断构建 |
| `ignore` | 不出声，at-rule 原样保留 |

`warn` 与 `ignore` 都保留原文，而浏览器读不懂 `@adaptive`，会把**整块丢弃**——块里的样式全部消失。区别只在于有没有人告诉你。画布名区分大小写（它是你自己在 `profiles` 里写的键），`@adaptive PC` 找不到 `pc`。

`@adaptive pc;` 这种没有块的写法会单独告警：没有块就没有任何东西被编译到那张画布上，它不会被改写成 `@media`。

### unitToConvert 与 rootValue

```ts
unitToConvert?: string | readonly string[]   // 默认 'px'
rootValue?: number                           // 默认 16
```

默认只读 `px`。传数组可以一次读多种单位——原子化 CSS 项目需要这个，见[构建工具集成](./integration.zh-CN.md#原子化-csstailwind-与-unocss)：

```js
unitToConvert: ['px', 'rem']
```

单位之间的换算规则只有一条：**`rem` 按 `rootValue` 折成像素，其它单位按面值读。**

`em` 也按面值读，这是刻意的。`em` 相对的是元素继承来的字号，那是运行时才知道的事，构建期没有任何常数能替它。把 `em` 当 `rem` 处理，只在两者恰好相等的地方是对的——而那在一份样式表里是少数。

`rootValue` 同时管两头：

- 读的时候，`1rem` 折成多少像素；
- 写的时候，文字的静态部分除以多少变成 `rem`。

所以页面写了 `html { font-size: 62.5% }` 就配 `rootValue: 10`，`3.2rem` 与 `32px` 会得到完全一样的产物，两边都对。只配一头会错一头，因此这里没有第二个选项可配。

`minPixelValue` 与 `hairline` 的阈值是**像素**，不是面值。框架把发丝线写成 `0.0625rem`、你手写成 `1px`，是同一根线，都会被 `hairline` 拦下。

## AdaptiveRoute

```ts
interface AdaptiveRoute {
  profile: string | false
  file?: FileMatcher | FileMatcher[]
  selector?: (string | RegExp) | (string | RegExp)[]
  property?: string | string[]
  media?: MediaMatcher | MediaMatcher[]
}

interface MediaMatcher {
  minWidth?: number
  maxWidth?: number
}
```

把匹配到的 CSS 改派到另一张画布，`profile: false` 则保留像素不转换。字符串按「包含」匹配，正则按 `test` 匹配；`property` 按前缀匹配自定义属性名；`media` 匹配的是外层 `@media` 把这条规则限死在哪段宽度里——见[断点](#断点)。

一条路由声明了几条通道，就要几条同时命中。想让类名和文件各自独立生效，写成两条路由。

按目录划分两套互不响应的端口，是最常见的用法：

```js
adaptiveMatrix({
  defaultProfile: 'pc',
  profiles: {
    pc:     { designWidth: 1920, fluid: { minWidth: 1280, maxWidth: 2560 } },
    mobile: { designWidth: 750,  fluid: { minWidth: 320,  maxWidth: 600  } },
  },
  routes: [{ profile: 'mobile', file: [/[\\/]mobile[\\/]/] }],
})
```

两张画布在同一个插件实例里判定，因此不会互相覆盖，也不需要为每一端各挂一次插件——同一段 CSS 只会被换算一次，先命中的画布就是最终结果。

判定优先级从高到低：

1. 外层 `@adaptive <profile>`——作者已经明确指定；
2. 命中的 `property` 路由；
3. 命中的 `selector` 路由；
4. 命中的 `media` 路由；
5. 命中的 `file` 路由；
6. `defaultProfile`。

选择器高于文件路径，是因为选择器属于 CSS 本身，而路径只反映构建工具当时怎么摆放文件；打包器一旦把依赖内联进产物，路径就没了。属性名的理由相同且更强：主题 token 声明在 `:root` 上，除了名字之外不留任何来源痕迹。

选择器高于宽度区间，理由则是另一回事：组件库在任何视口宽度下都画在它自己那张画布上，跨过一个断点并不会改变这个组件出自哪份设计稿。要在断点处覆盖组件库自己的组件，就把两者都写上——见下文。

## 断点

一份响应式样式表，是一个文件里装着两份设计稿。手机端那些数字量自 750 的稿子，`@media (min-width: 1024px)` 里那些量自 1440 的稿子。CSS 里没有任何地方写着这件事，而整个文件按一张画布编译，也不是「差一点」这么简单：

```css
/* defaultProfile 'app'：designWidth 750，fluid 320–600 */
@media (min-width: 1024px) {
  .hero { padding: 40px }        /* → clamp(17.07px, 5.33vw, 32px) */
}
```

这条规则只在 1024px 以上生效，而那已经越过手机画布停止缩放的地方——所以在它生效的每一个宽度上，`clamp()` 早就顶死在上界了。这个 padding 永远是 32px。编译器跑过了，产物看着也像编译过，可没有一个值动过。

`media` 路由把这段断点交还给它原本那份设计稿：

```js
adaptiveMatrix({
  defaultProfile: 'app',
  profiles: {
    app: { designWidth: 750,  fluid: { minWidth: 320,  maxWidth: 600  } },
    pc:  { designWidth: 1440, fluid: { minWidth: 1024, maxWidth: 1920 } },
  },
  routes: [{ media: { minWidth: 1024 }, profile: 'pc' }],
})
// .hero → clamp(28.44px, 2.78vw, 53.33px)
```

匹配靠的是**蕴含关系，不是文本**。`{ minWidth: 1024 }` 认领的是「不可能在 1024px 以下生效」的规则，所以下面这些都算：

| 查询 | 生效区间 | 是否认领 |
| --- | --- | --- |
| `(min-width: 1024px)` | 1024px 及以上 | 是 |
| `screen and (min-width: 1200px)` | 1200px 及以上 | 是 |
| `(min-width: 64rem)` | 1024px 及以上 | 是 |
| `(min-width: 1024px) and (max-width: 1600px)` | 1024–1600px | 是 |
| `(min-width: 768px)` | 768px 及以上 | 否——它够得到 1024 以下 |

嵌套是「且」的关系，所以 `@media (min-width: 900px) { @media (min-width: 1100px) { … } }` 的生效区间是 1100px 及以上，会被认领。

`rem` 与 `em` 一律按 **16px** 折算，既不看 `rootValue`，也不看根元素的字号。媒体查询在任何声明能改动 `font-size` 之前就要求值，因此它不能依赖它自己所筛选的那一层层叠——哪怕样式表里 `html` 写着 `62.5%`，`64rem` 也还是 1024px。原子化框架的断点全都是这么写的。

编译器读不懂的查询——带逗号、带 `not`、带 `only`，或者任何非宽度特性——**谁都不认领**。这是「拒绝作答」，不是「全都匹配」：按一个没人核对过的条件去改派规则，正是画布错误产生的方式，而不是被抓住的方式。`@container` 同样从不参与计数；它约束的是元素，而 `vw` 从来就与元素无关。

要在断点处重画组件库自己的组件，两者都得写上——只写选择器会在所有宽度上生效，只写宽度区间又会输给组件库：

```js
routes: [{ selector: ['.van-'], media: { minWidth: 1024 }, profile: 'pc' }]
```

### 白送的那条告警

上面这些你一条都不用先知道，也能发现问题。只要一条规则确实换算了长度、而它的生效区间又整个落在所属画布的流体区间之外，编译器就会说出来：

```
Every converted length here is a constant: this rule is live from 1024px up, but canvas
"app" stops scaling outside 320px–600px, so its clamp() is pinned to its maximum across
that whole range. The numbers in a breakpoint are usually measured on a different design
file — give it one with a route: { media: { minWidth: 1024 }, profile: '…' }.
```

这是算术，不是启发式：两个区间的数字压根不相交。每个文件里，同一张画布配同一段区间只报一次，而且只对真的换算了东西的规则报——一段只改 `display` 和 `color` 的断点里没有长度，也就无所谓常量不常量。

## libraries

```ts
type LibraryEntry =
  | string                                              // 内置名称
  | LibraryAdaptation                                   // 完整定义
  | (Partial<LibraryAdaptation> & { extends: string })  // 基于内置项修改

libraries?: LibraryEntry[] | 'auto' | false
```

默认 `'auto'`：全部内置库生效，使用 Vant 或 Element Plus 的项目不需要任何配置。`false` 整体关闭。给出数组则只启用列出的条目。

条目展开成若干条路由，追加在 `routes` 之后——显式路由永远优先。

内置清单、匹配通道、覆盖与扩展方式见 [组件库适配](./libraries.zh-CN.md)。

## Profile

```ts
interface AdaptiveProfile {
  designWidth: number | ((context: { file: string; profile: string }) => number)
  fluid: { minWidth: number; maxWidth: number }
  query?: string | {
    type?: 'media' | 'container'
    condition: string
    name?: string
  } | false
  unit?: 'vw' | 'vi' | 'cqw' | 'cqi'
  strategy?: 'clamp' | 'viewport'
  fontFluidity?: number
  textAnchorWidth?: number | ((context: { file: string; profile: string }) => number)
  rootMaxWidth?: number
}
```

`query: false` 会移除 `@adaptive` 外壳但保留内部规则，适合构建不同产物时由环境选择 profile。

`textAnchorWidth` 默认等于 `designWidth`，只影响文字：文字有一段固定的 `rem`（用于保留浏览器缩放），固定长度必须相对某个宽度才有意义。手写画布用自己的设计宽度是对的；但当两张画布描述的是**同一份设计的两套单位**时（组件库画在 375、页面画在 750，Vant 的 16px 就是页面的 32px），各自锚在自己身上会让两边在任何视口下都对不上。组件库画布因此一律继承所属 profile 的锚点，无需配置。原理与实测见[静态部分锚在哪张画布上](./architecture.zh-CN.md#静态部分锚在哪张画布上)。

## RootFoundationOptions

```ts
interface RootFoundationOptions {
  selector: string
  center?: boolean
  container?: boolean
  containerName?: string
  safeAreaVariables?: boolean
  layer?: string | false
  logical?: boolean
  fixedContainingBlock?: boolean
  injectTo?: FileMatcher | FileMatcher[]
}
```

默认不注入全局样式。只有显式配置 `root` 或在 `appPcPreset` 传 `rootSelector` 才启用。

### injectTo

限定哪些文件接收这段基础样式，默认全部。

基础样式是全局的，而 PostCSS 一次只看见一个文件，无法跨文件去重。单一样式表的项目正需要默认行为；Vue / Svelte 项目里每个组件的 `<style>` 块都是独立文件，默认就变成了每个组件一份。

```js
root: { selector: '#app', injectTo: 'src/styles/main' }
```

匹配方式与 `include` 相同：字符串按包含判断，正则按路径测试，函数自行决定。`appPcPreset` 的对应字段是 `rootInjectTo`。

匹配不上不报错，只是一份都不注入——用[命令行预览](./cli.zh-CN.md)确认入口文件里出现了新增声明。

### logical

默认 `true`，基础样式写逻辑属性：`inline-size`、`margin-inline`、`max-inline-size`。

设为 `false` 改写 `width`、`margin-left` / `margin-right`、`max-width`。横排页面上两者等价，所以这个开关只有一个用途：**给读不懂逻辑属性的浏览器兜底**（Safari 15 / iOS 15.0 / Chrome 89 以下）。

它值得单独有个开关，是因为这是本插件产出的语法里唯一一个失败之后页面看起来还正常的：丢掉 `margin-inline: auto`，列宽完全正确、贴在屏幕左边；丢掉 `max-inline-size`，列铺满整屏。两种都不像故障。完整的失败清单与降级路径见[浏览器特性支持与降级](./compatibility.zh-CN.md)。

`appPcPreset` 的对应字段是 `rootLogical`；同理还有 `rootLayer`，透传到 `layer`。

### fixedContainingBlock

某个 profile 设了 `rootMaxWidth` 时，页面成为居中的列，而 `position: fixed` 会退回以视口为包含块——固定元素贴到窗口两端，与它所在的内容列错开。

开启后编译器发布两个变量：

| 变量 | 含义 |
| --- | --- |
| `--adaptive-root-width` | 当前断点下的根列宽，未设上限时为 `100vw` |
| `--adaptive-root-gutter` | `max(0px, (100vw - 列宽) / 2)`，即单侧留白 |

并对自身声明了 `position: fixed` 的规则做三件事：

- `left` / `right` / `inset-inline-*` 为 `0` 时替换为留白，非零时改为 `calc(原值 + 留白)`，`auto` 不动；
- `width` / `inline-size` 等为 `100%` 时改为 `min(100%, 列宽)`；
- 块轴（`top` / `bottom`）不处理——居中列只约束行内轴。

列宽等于视口时留白为 `0`，因此窄屏输出与手写完全一致。修正幂等，已含这两个变量的值不再二次处理。

只看规则自身的 `position` 声明：从别处继承定位是 CSS 不允许静态观察的，猜测比漏掉更糟。

`appPcPreset` 传了 `rootSelector` 时默认开启——该预设的两张 profile 都设了 `rootMaxWidth`，正是会出现这一问题的配置。用 `appPcPreset({ rootSelector: '#app', fixedContainingBlock: false })` 关闭。

## 旧 WebView 模式

```js
adaptiveMatrix({
  ...appPcPreset(),
  strategy: 'viewport',
  preserveOriginal: true,
})
```

这会输出原始 `px` 后再输出 `vw`。是否使用该方案应由真实目标浏览器决定；现代项目优先使用默认 `clamp`。

「真实目标浏览器」不必靠猜——`npx adaptive-matrix src/app.css --targets "ios_saf 13, chrome 90"` 会把产物里每一处超出目标的语法列出来，连同不支持时丢掉的东西和关掉它的开关。见[浏览器特性支持与降级](./compatibility.zh-CN.md)。
