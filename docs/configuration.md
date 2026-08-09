# 配置参考

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
  | string                                          // 内置名称
  | LibraryAdaptation                               // 完整定义
  | (Partial<LibraryAdaptation> & { extends: string })  // 基于内置项修改

libraries?: LibraryEntry[] | 'auto' | false
```

默认 `'auto'`：全部内置库生效，使用 Vant 或 Element Plus 的项目不需要任何配置。`false` 整体关闭。给出数组则只启用列出的条目。

条目展开成若干条路由，追加在 `routes` 之后——显式路由永远优先。

### 自动模式下被保留的前缀

`naive-ui`（`.n-`）、`quasar`（`.q-`）、`taro-ui`（`.at-`）的前缀确实是官方前缀，但也和普通业务类名难以区分。自动模式下这三项**只按文件路径匹配**；显式写出库名即表示该前缀在当前代码库中安全，此时前缀通道恢复：

```js
adaptiveMatrix({ libraries: ['vant', 'naive-ui'] })
```

误命中是静默的——它会按错误画布缩放某个元素，或跳过本该缩放的元素。默认从严，是因为错误的适配比没有适配更难发现。

### extends

只修改内置条目的某一项，其余继承。`name` 也随之继承，诊断信息与派生画布名仍指向读者认得的那个库：

```js
adaptiveMatrix({
  libraries: [{ extends: 'vant', designWidth: 750 }],
})
```

## LibraryAdaptation

```ts
interface LibraryAdaptation {
  name: string
  designWidth: number | false
  prefix?: string | string[]
  tokenPrefix?: string | string[]
  file?: FileMatcher | FileMatcher[]
  basedOn?: string
}
```

- `designWidth`：组件库自己的设计画布；`false` 表示保留像素。
- `prefix`：类名前缀，不带点。`'van-'` 匹配 `.van-cell` 与 `.page .van-cell`，不匹配 `.caravan-slot`。
- `tokenPrefix`：自定义属性前缀，如 `'--van-'`。被认领本身即是开关，因此不受 `transformCustomProperties` 约束——那个开关管的是你自己写的变量。
- `basedOn`：借用哪张 profile 的流体区间、单位与策略，默认 `defaultProfile`。派生画布只替换 `designWidth`，因此它与页面在同一个视口宽度上停止增长。
- `file`：构建产物仍然分文件时的兜底通道。

名字含有文字属性词段的 token 会走 `rem + vw` 混合公式：`--van-font-size-md` 与 `--van-cell-font-size` 都识别为字号。若按普通长度输出纯 `vw`，组件库文字将不再响应浏览器缩放。

内置库可从 `BUILT_IN_LIBRARIES` 读取：

```js
import { BUILT_IN_LIBRARIES } from 'postcss-adaptive-matrix'
```

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
  rootMaxWidth?: number
}
```

`query: false` 会移除 `@adaptive` 外壳但保留内部规则，适合构建不同产物时由环境选择 profile。

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
}
```

默认不注入全局样式。只有显式配置 `root` 或在 `appPcPreset` 传 `rootSelector` 才启用。

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
