# 组件库适配

## 问题

组件库有自己的设计稿，而且未必和你的一致。Vant 画在 375 上，你的页面可能画在 750 上，Element Plus 则根本没有设计稿——它按真实像素绘制，本来就不该缩放。

传统做法是把 `node_modules` 加进忽略名单。这只会把问题换个形状：页面缩放而组件不动，两者从此对不齐。反过来不忽略，组件就按错误的画布被拉变形。忽略名单能给出的选项只有这两个，都不对。

正确的做法是给每张设计稿一个画布。**这是默认行为，不需要配置。**

## 效果

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
/* 输出 */
:root       { --van-padding-md: clamp(13.65333px, 4.26667vw, 25.6px) }
.van-cell   { padding: clamp(13.65333px, 4.26667vw, 25.6px) }
.el-input   { padding: 16px }
.page-hero  { padding: clamp(6.82667px, 2.13333vw, 12.8px) }
```

Vant 的三项按 375 换算，Element Plus 原样保留，页面按 750 换算。三个不同的结果，各自都对。

## 内置清单

移动端——按各自设计画布换算：

| 名称 | 设计宽度 | 类名前缀 | Token 前缀 | 前缀命中率 |
| --- | --- | --- | --- | --- |
| `vant` | 375 | `van-` | `--van-` | 1288/1407 |
| `nutui` | 375 | `nut-` | `--nut-` | 1398/1497 |
| `varlet` | 375 | `var-` | — † | 1749/1879 |
| `antd-mobile` | 375 | `adm-` | `--adm-` | 798/829 |
| `antd-mobile-2x` | 750 | `adm-` ‡ | `--adm-` ‡ | 798/829 |
| `taro-ui` | 750 | `at-` * | — | 711/722 |

桌面端——按真实像素绘制，正确的适配就是不动它：

| 名称 | 设计宽度 | 类名前缀 | Token 前缀 | 前缀命中率 |
| --- | --- | --- | --- | --- |
| `element-plus` | 保留像素 | `el-` | `--el-` | 3180/3251 |
| `antd` | 保留像素 | `ant-` | — | 5941/6050 |
| `arco-design` | 保留像素 | `arco-` | — | 3462/3763 |
| `naive-ui` | 保留像素 | `n-` * | — | 运行时生成 |
| `quasar` | 保留像素 | `q-` * | — | 2080/3363 |
| `mui` | 保留像素 | `Mui` | — | 运行时生成 |

每一项同时按包路径匹配（如 `/vant/`、`/@nutui/`），因此产物是否分文件都能工作。

标 `*` 的三个前缀在自动模式下不启用，原因见下。† 见[没有前缀的 token](#没有前缀的-token)，‡ 见[同一个前缀，两张画布](#同一个前缀两张画布)。

### 这张表是核对过的

「前缀命中率」是该库**已发布样式表**里含此前缀的规则数 ÷ 总规则数，实测得到，不是照文档抄的。核对脚本在仓库里，可以自己跑：

```bash
npx tsx scripts/verify-libraries.ts          # 全部
npx tsx scripts/verify-libraries.ts vant     # 单个
```

它会下载每个库的发布产物，用真实的 `node_modules` 路径编译，然后检查：前缀与 token 前缀是否真的存在、路由落到哪张画布、是否幂等、有无告警、断点接缝检查是否误报。当前 12 项全部通过。

**未覆盖的一项：设计宽度。** 一张 CSS 里看不出它画在多宽的稿子上，这一列来自各库自己的文档，脚本核对不了。

`naive-ui` 与 `mui` 的样式在运行时生成，磁盘上没有样式表——不经过 PostCSS，也就无从核对。条目仍然有用：它们是「保留像素」，所以你手写的 `.n-button` 覆盖样式不会被缩放。

清单可以从代码读取：

```js
import { BUILT_IN_LIBRARIES } from 'postcss-adaptive-matrix'
```

## 匹配方式

一个条目最多提供三条通道，命中任意一条即归属该库的画布：

- **类名前缀**——不带点。`'van-'` 匹配 `.van-cell` 与 `.page .van-cell`，不匹配 `.caravan-slot`；
- **自定义属性前缀**——如 `'--van-'`。被认领本身就是开关，所以不受 `transformCustomProperties` 约束；那个开关管的是你自己写的变量；
- **文件路径**——构建产物仍然分文件时的兜底。

优先级：属性名 > 选择器 > 文件路径。

选择器高于文件路径，是因为选择器属于 CSS 本身，而路径只反映构建工具当时怎么摆放文件——打包器一旦把依赖内联进产物，路径就没了。属性名的理由相同且更强：主题 token 声明在 `:root` 上，除了名字之外不留任何来源痕迹。

## 一条规则只能有一个结果

选择器列表是有可能跨画布的：

```css
.van-cell, .page-hero { padding: 16px }
```

`.van-cell` 归 Vant 画布，`.page-hero` 归默认画布，但 `padding: 16px` 只有一个值可以输出——CSS 无法让同一条声明对列表里不同的选择器给出不同结果。编译器取第一个命中的画布编译整条规则，另一个选择器就拿到了不属于它的换算。

这种情况会告警，并指出是哪个选择器落空了。拆成两条规则即可：

```css
.van-cell { padding: 16px }
.page-hero { padding: 16px }
```

`:is()`、`:not()` 和属性值里的逗号是参数分隔符，不是选择器边界，不会被拆开——也因此 `:is(.van-cell, .page-hero)` 这种真正混合的写法查不出来。

## 主题 token

名字含有文字属性词段的 token 走 `rem + vw` 混合公式，而不是普通长度的纯 `vw`：

```css
:root {
  --van-font-size-md: 14px;
  --van-cell-font-size: 14px;
}
```

两个都识别为字号。若按普通长度输出，组件库的文字将不再响应浏览器缩放——用户调大字号，页面上你写的文字变大了，组件里的没变。

### 没有前缀的 token

Varlet 的自定义属性不带库前缀，直接叫 `--field-padding`、`--icon-size-md`、`--card-width`，声明在一个光秃秃的 `:root` 上。注册表因此**不给它写 `tokenPrefix`**：认领这些名字等于认领 `--card-width` 本身，而任何一个项目都可能自己定义同名变量，误命中是静默的。

影响范围有限——Varlet 自己的样式表按路径匹配，照常落到 375 画布。但如果你按官方做法在**项目 CSS 里**覆盖主题：

```css
/* 你自己的文件，路径不在 @varlet 下，名字也没有前缀可认 */
:root { --field-padding: 16px }
```

这一条不会被认领，需要显式写一条路由：

```js
adaptiveMatrix({
  routes: [{ profile: 'library:varlet', property: ['--field-', '--icon-size-'] }],
})
```

### 同一个前缀，两张画布

antd-mobile 把同一份样式表发布了两次：`bundle/` 画在 375 上，`2x/bundle/` 画在 750 上。类名和 token 名一模一样（实测 5.42.3：后者每一个长度恰好是前者的两倍，`font-size: 16px` 对应 `32px`），**只有路径能区分**。

只按 `.adm-` 前缀路由的话，2x 产物会按 375 换算，页面上每一个尺寸都是应有的两倍——没有报错，没有告警，全局偏大。

所以 `antd-mobile-2x` 这个条目是**限定路径**的：它的前缀通道要求路径同时命中才算数。限定路径的路由先于不限定的路由测试，因为「类名加路径」比「只有类名」更具体：

- 编译 `2x/bundle/style.css` → 750 画布；
- 编译 `bundle/style.css` → 375 画布；
- 打包器把依赖内联、路径已经不存在时 → 退回 375，因为那是默认产物。

自动模式下两条都在，不需要配置。自己的库有同样情况时，`scoped: true` 是同一个开关：

```js
adaptiveMatrix({
  libraries: [
    { name: 'acme-2x', designWidth: 750, prefix: 'acme-', file: [/[\\/]acme[\\/]2x[\\/]/], scoped: true },
  ],
})
```

`scoped` 却不给 `file` 会直接报错——限定路径是它认领别人前缀的全部理由，没有路径就退化成一个靠声明顺序决定胜负的重复条目。

## 自动模式下被保留的前缀

`naive-ui`（`.n-`）、`quasar`（`.q-`）、`taro-ui`（`.at-`）的前缀确实是官方前缀，但也和普通业务类名难以区分。自动模式下这三项**只按文件路径匹配**。

显式写出库名即表示该前缀在当前代码库中安全，此时前缀通道恢复：

```js
adaptiveMatrix({ libraries: ['vant', 'naive-ui'] })
```

误命中是静默的——它会按错误画布缩放某个元素，或跳过本该缩放的元素，没有报错也没有警告。默认从严，是因为错误的适配比没有适配更难发现。

## 覆盖内置项

用 `extends` 只改一项，其余继承。`name` 也随之继承，诊断信息与派生画布名仍指向读者认得的那个库：

```js
adaptiveMatrix({
  libraries: [{ extends: 'vant', designWidth: 750 }],
})
```

这是唯一的入口。每个库会合成一张名为 `library:<名字>` 的画布，`library:` 是保留前缀——在 `profiles` 里直接写 `'library:vant'` 会被合成结果覆盖，等于白写，所以这种配置直接报错并指回 `extends`。

## 添加未收录的库

```js
adaptiveMatrix({
  libraries: [
    'vant',
    {
      name: 'acme-ui',
      designWidth: 375,
      prefix: 'acme-',
      tokenPrefix: '--acme-',
      file: [/[\\/]@acme[\\/]ui[\\/]/],
    },
  ],
})
```

给出数组即表示只启用列出的条目——上面的配置里，除 Vant 和 acme-ui 外的内置库都不生效。

## 关闭

```js
adaptiveMatrix({ libraries: false })
```

之后仍可用 `routes` 显式改派、`exclude: /node_modules/`、`selectorExclude` 和注释指令自行处理。

## 类型

```ts
type LibraryEntry =
  | string                                              // 内置名称
  | LibraryAdaptation                                   // 完整定义
  | (Partial<LibraryAdaptation> & { extends: string })  // 基于内置项修改

interface LibraryAdaptation {
  name: string
  designWidth: number | false
  prefix?: string | string[]
  tokenPrefix?: string | string[]
  file?: FileMatcher | FileMatcher[]
  scoped?: boolean
  basedOn?: string
}
```

`basedOn` 指定借用哪张 profile 的流体区间、单位与策略，默认 `defaultProfile`。派生画布只替换 `designWidth`，因此它与页面在同一个视口宽度上停止增长——这正是组件和页面能保持对齐的原因。

派生画布还会继承所属 profile 的 `textAnchorWidth`（默认就是该 profile 的 `designWidth`），见下。

### 库画布的文字锚点

组件库画布与页面画布描述的是**同一份设计的两套单位**：Vant 画在 375、页面画在 750 时，Vant 的 16px 和页面的 32px 就是同一个尺寸，编译后在同一视口下必须渲染成同一个大小。

普通长度自动成立——两边都归结为 `值 ÷ 画布`。文字不然：为了让浏览器的文字缩放依然有效，文字保留了一段固定的 `rem`，而固定长度必须锚在某个宽度上。若两张画布各锚自己，这段 `rem` 会差整整一倍：

```text
页面 32px on 750  → clamp(1.59867rem, calc(1.3rem  + 1.49333vw), 1.86rem)
Vant  16px on 375  → clamp(0.94867rem, calc(0.65rem + 1.49333vw), 1.098rem)   ← 修正前
```

流体项两边本就相同，差的全在静态项。390px 视口下前者 26.62px、后者 16.22px——Vant 的文字小了约 40%，且 375 与 1440 上都看不出来（两张稿各自都对）。**750 稿的项目配 Vant 是国内移动端最常见的组合之一。**

因此派生画布的文字锚点取所属 profile 的设计宽度，两边产出同一个公式。这是默认行为，不需要配置。原理与推导见[静态部分锚在哪张画布上](./architecture.md#静态部分锚在哪张画布上)。

条目展开成若干条路由，追加在 `routes` 之后，所以你写的显式路由永远优先。
