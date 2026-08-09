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

| 名称 | 设计宽度 | 类名前缀 | Token 前缀 |
| --- | --- | --- | --- |
| `vant` | 375 | `van-` | `--van-` |
| `nutui` | 375 | `nut-` | `--nut-` |
| `varlet` | 375 | `var-` | `--var-` |
| `antd-mobile` | 375 | `adm-` | `--adm-` |
| `taro-ui` | 750 | `at-` * | — |

桌面端——按真实像素绘制，正确的适配就是不动它：

| 名称 | 设计宽度 | 类名前缀 | Token 前缀 |
| --- | --- | --- | --- |
| `element-plus` | 保留像素 | `el-` | `--el-` |
| `antd` | 保留像素 | `ant-` | — |
| `arco-design` | 保留像素 | `arco-` | — |
| `naive-ui` | 保留像素 | `n-` * | — |
| `quasar` | 保留像素 | `q-` * | — |
| `mui` | 保留像素 | `Mui` | — |

每一项同时按包路径匹配（如 `/vant/`、`/@nutui/`），因此产物是否分文件都能工作。

标 `*` 的三个前缀在自动模式下不启用，原因见下。

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

## 主题 token

名字含有文字属性词段的 token 走 `rem + vw` 混合公式，而不是普通长度的纯 `vw`：

```css
:root {
  --van-font-size-md: 14px;
  --van-cell-font-size: 14px;
}
```

两个都识别为字号。若按普通长度输出，组件库的文字将不再响应浏览器缩放——用户调大字号，页面上你写的文字变大了，组件里的没变。

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
  basedOn?: string
}
```

`basedOn` 指定借用哪张 profile 的流体区间、单位与策略，默认 `defaultProfile`。派生画布只替换 `designWidth`，因此它与页面在同一个视口宽度上停止增长——这正是组件和页面能保持对齐的原因。

条目展开成若干条路由，追加在 `routes` 之后，所以你写的显式路由永远优先。
