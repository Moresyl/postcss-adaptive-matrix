# 配置参考

全部选项、类型与默认值。上手请先读[快速上手](./getting-started.md)。

## 顶层配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `profiles` | App/PC 预设 | 多设计画布映射 |
| `defaultProfile` | `app` | 普通 CSS 使用的画布 |
| `routes` | `[]` | 按选择器、属性名或文件改派画布 |
| `libraries` | `'auto'` | 组件库适配，默认启用全部内置项 |
| `atRuleName` | `adaptive` | 自定义 At-rule 名称 |
| `strategy` | `clamp` | `clamp` 或兼容型 `viewport` |
| `unit` | `vw` | `vw`、`vi`、`cqw`、`cqi` |
| `precision` | `5` | 0~12 位小数 |
| `unitToConvert` | `px` | 输入单位 |
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
| `unitToConvert: ''` | 匹配不到任何长度，与没装插件无法区分 |
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

## AdaptiveRoute

```ts
interface AdaptiveRoute {
  profile: string | false
  file?: FileMatcher | FileMatcher[]
  selector?: (string | RegExp) | (string | RegExp)[]
  property?: string | string[]
}
```

把匹配到的 CSS 改派到另一张画布，`profile: false` 则保留像素不转换。字符串按「包含」匹配，正则按 `test` 匹配；`property` 按前缀匹配自定义属性名。

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
4. 命中的 `file` 路由；
5. `defaultProfile`。

选择器高于文件路径，是因为选择器属于 CSS 本身，而路径只反映构建工具当时怎么摆放文件；打包器一旦把依赖内联进产物，路径就没了。属性名的理由相同且更强：主题 token 声明在 `:root` 上，除了名字之外不留任何来源痕迹。

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

内置清单、匹配通道、覆盖与扩展方式见 [组件库适配](./libraries.md)。

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

`textAnchorWidth` 默认等于 `designWidth`，只影响文字：文字有一段固定的 `rem`（用于保留浏览器缩放），固定长度必须相对某个宽度才有意义。手写画布用自己的设计宽度是对的；但当两张画布描述的是**同一份设计的两套单位**时（组件库画在 375、页面画在 750，Vant 的 16px 就是页面的 32px），各自锚在自己身上会让两边在任何视口下都对不上。组件库画布因此一律继承所属 profile 的锚点，无需配置。原理与实测见[静态部分锚在哪张画布上](./architecture.md#静态部分锚在哪张画布上)。

## RootFoundationOptions

```ts
interface RootFoundationOptions {
  selector: string
  center?: boolean
  container?: boolean
  containerName?: string
  safeAreaVariables?: boolean
  layer?: string | false
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

匹配不上不报错，只是一份都不注入——用[命令行预览](./cli.md)确认入口文件里出现了新增声明。

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
