# 命令行预览

改一个 `designWidth`、挪一次 `fluid` 区间，要看效果就得重新构建，再去浏览器里肉眼比对。这条命令把这一步缩短成一次回车：

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
  3 converted, 0 left as authored
```

输出的是**逐条声明的前后对照**，不是整份 CSS。构建工具跑出来的产物动辄几千行，而你想确认的通常只有那么几个数字。

## 用法

```
adaptive-matrix <file...> [options]
cat app.css | adaptive-matrix --from src/app.css
```

| 选项 | 作用 |
| --- | --- |
| `-c, --config <path>` | 默认导出插件选项的模块 |
| `--from <path>` | 把输入当作位于这个路径 |
| `--profile <name>` | 覆盖 `defaultProfile` |
| `--all` | 连未改动的声明一起列出 |
| `--css` | 打印编译后的完整 CSS，而不是对照表 |
| `--color` / `--no-color` | 强制开/关颜色；都不写则跟随终端，并遵守 `NO_COLOR` |
| `-h, --help` | 帮助 |

退出码：一切正常为 `0`，参数错误、文件读不到、配置非法为 `1`。所以可以直接串进 shell 判断。

## 读配置

不传 `-c` 就用内置默认值，表头会告诉你当前是哪几个画布。

```bash
npx adaptive-matrix src/app.css -c postcss.config.mjs
```

配置模块要默认导出**插件选项对象**，不是 PostCSS 配置。两者不一样时单独写一个：

```js
// adaptive.config.mjs
import { appPcPreset } from 'postcss-adaptive-matrix'
export default appPcPreset({ appDesignWidth: 375, pcDesignWidth: 1440 })
```

TypeScript 配置需要一个加载器：

```bash
npx tsx node_modules/postcss-adaptive-matrix/dist/cli.js src/app.css -c adaptive.config.ts
```

（Node 22.6+ 自带类型擦除，直接 `npx adaptive-matrix -c adaptive.config.ts` 也能跑，但会打一条 experimental 警告，且只支持可擦除的写法。）

配置在读第一个样式文件之前就会被校验，所以 `defaultProfile` 写错、`fluid` 区间反了，报的是编译器自己的那句话，不会先刷一屏对照表再报错。

`default` 漏写（`export const options = {...}`）或预设忘了调用（`export default appPcPreset` 而不是 `appPcPreset({...})`）都会直接报错。这两种写法此前会静默地用内置默认值跑完——表头照样列出画布，对照表看着也对，没有任何地方说过你的配置根本没被读到。

## 验证文件路由

按路径判定画布是最容易配错、又最不容易发现的一项——写错了不报错，只是路由静默失效（见[构建工具集成](./integration.md#2-from-必须传)）。`--from` 就是用来在上线前把路由试一遍的：

```bash
# 同一份 CSS，假装它在 desktop 目录下
npx adaptive-matrix scratch.css -c adaptive.config.mjs --from src/desktop/scratch.css
```

两次输出的数字不一样，说明路由命中了。一样，就是没命中。

Vue SFC 的路径带 query 串，照抄进去即可：

```bash
npx adaptive-matrix scratch.css --from 'src/views/mobile/home/index.vue?vue&type=style&lang.scss'
```

## 断点处的倒退

两张设计稿各自都对，接缝处未必对。这个检查专门找一种情况：**窗口变宽，某个尺寸反而变小了。**

```
  shrinks .card font-size gets smaller at 768px: 17.57px → 16.18px
          clamp(0.94867rem, ...) → clamp(1.01125rem, ...). Widening the window makes this smaller — the two canvases disagree here.
```

`.card` 的字号在 App 稿上写 16px、PC 稿上写 18px，两个数字单独看都合理。但 App 稿到 767px 时已经流体放大到 17.57px，而 PC 稿从 768px 起步只有 16.18px。于是把浏览器拉宽一个像素，正文字号会突然变小。

之所以值得单独检查，是因为它**只在那一个宽度上出现**：两张稿子各自渲染都正常，日常调试的 375 和 1440 也都正常。

编译器输出的每一条公式，其**绝对值**在视口宽度上都是单调不减的，而且全程不变号。所以一旦出现倒退，来源只能是跨断点换了画布。这也意味着这个检查是完备的：这一类问题不会漏报到别的宽度上去。

### 只检查编译器自己产出的值

上面那句「来源只能是跨断点换了画布」只对**本编译器产出的公式**成立。没被换算的样式表在断点处变小，往往是作者有意为之：

```css
/* Quasar 2.19 自己的样式表 */
.q-tooltip { padding: 6px 10px }
@media (max-width: 599.98px) { .q-tooltip { padding: 8px 16px } }
```

手机上点击区域大一些，600px 往上收窄——两个数字都是人手写下的，作者比对过。Quasar 是「保留像素」条目，两侧都没被换算，报它没有意义。

所以只有**至少一侧是编译器产出的公式**时才报。有界流体尺寸没有不带包装的写法，编译器产出的视口相关长度一律在 `clamp()` / `min()` / `max()` / `calc()` 里（69 份一致性套件产物中无一例外），据此判断。一侧换算、另一侧没有，照样报——那正是一次跨画布，而且没有人比对过这两个数字。

代入发生在判断之前，所以「声明只写了 `var(--x)`、公式在 token 里」也算数。

比的是绝对值而不是数值：负长度（负外边距、外溢）本来就靠远离零来变大，`-16px` 编译出的公式是越宽越小的。断点两侧变号则一律不报——零是编译器自己不会跨过去的界，在这里遇到它说明两张稿的意图本就不同，谁对谁错不是这个检查能判断的。

怎么改由你决定——抬高 PC 稿的字号、把 `pcFluidMin` 从 1024 降到 768、或者收窄 App 稿的 `fluid.maxWidth`。工具只负责告诉你接缝在哪。

检查刻意收得很窄，宁可不报也不误报：只比对同一个选择器串、不做优先级推算、不展开简写；遇到 `@supports`、`@container`、非纯宽度的媒体查询、跨层叠层的分组，以及 `env()` / `%` / 容器单位这类算不出数值的值，整组跳过。

### 主题 token 会被代入

组件库的尺寸几乎不写字面量。Vant 4.10.0 的 3198 条普通声明里，有 1173 条完全经 `var()` 读取——检查若在第一个 `var(` 就放弃，看到的就只是一小片，而且恰好避开了本插件要适配的那一层。

所以同一份样式表里的自定义属性会先被代入，再求值：

```css
:root,:host { --card-width: 40px }
.card { width: var(--card-width) }
@media (min-width: 768px) { .card { width: 20px } }
```

这里 `.card` 在 768px 处从 40px 掉到 20px，代入之后才看得见。

代入只在值由**视口宽度单独决定**时进行，两条都要满足：

- 只声明在 `:root` / `:host` / `html` 上，别处没有第二份。`.van-theme-dark { --card-width: ... }` 一出现就整个放弃——元素的取值取决于祖先有没有那个 class，这不是宽度能回答的。
- 每一处声明要么无条件，要么位于纯像素宽度的 `@media` 里。`@supports`、`@container`、方向查询里的声明同样放弃。

token 本身在断点处被改写也算一次接缝，即使消费它的规则只写了一次：

```css
:root { --card-width: 40px }
@media (min-width: 768px) { :root { --card-width: 20px } }
.card { width: var(--card-width) }   /* 只有一条，照样报 */
```

`var(--x, 16px)` 的兜底值只在 `--x` 确实没被声明时使用——这与浏览器一致。若 `--x` 被声明了但取值不可知（比如上面的主题 class），则不报，而不是拿兜底值当答案。

自定义属性声明本身（`--x: ...` 这一条）仍然不检查。它不是屏幕上的长度，方向对不对由消费方决定——本插件自己的 `--adaptive-root-width` 就是反的：它喂给 `max(0px, (100vw - var(--adaptive-root-width)) / 2)`，值变小正是为了让留白变大。跳过它不等于忽略它：消费它的那条声明会被检查，代入之后它的方向才有意义。

实测（Vant 4.10.0 完整样式表，195 KB）：可求值的值分量从 622 条（17.6%）升到 1309 条（36.9%），收录 779 个 token。剩下的是关键字、颜色和百分比——本来就不是视口相关的长度。

误报方面：69 份一致性套件产物、本仓库示例工程，以及 10 个组件库的已发布样式表（Vant、NutUI、Varlet、antd-mobile 1x/2x、Taro UI、Element Plus、Ant Design、Arco Design、Quasar，合计约 3.2 MB CSS），`shrinks` 报告数均为 0。见[组件库适配](./libraries.md#这张表是核对过的)。

要让构建直接失败，同一个检查也从包里导出：

```js
import postcss from 'postcss'
import adaptiveMatrix, { findContinuityIssues } from 'postcss-adaptive-matrix'

const result = await postcss([adaptiveMatrix(options)]).process(css, { from })
const issues = findContinuityIssues(result.root)
if (issues.length) throw new Error(`${issues.length} 处断点倒退`)
```

## 看整份产物

要接着给别的工具处理，用 `--css`：

```bash
npx adaptive-matrix src/app.css --css > out.css
```

`--css` 模式的 stdout 只有 CSS，警告走 stderr。所以重定向出来的文件是干净的、可直接解析的 CSS，而警告依然会出现在终端里——不会被悄悄吞掉。

## 读懂输出

- `16px → clamp(...)` —— 换算了
- 灰色无箭头的一行 —— 原样保留（`--all` 才显示）。细线、`@font-face` 里的长度、被忽略注释标记的声明都在这里
- `+ ...` —— 编译器新增的声明，比如根容器基础样式、`preserveOriginal` 的降级值
- `@media (min-width: 768px) › .page` —— 声明所在位置由外向内。`@adaptive pc` 编译后就是这个样子，同一个 `.page` 出现两次是正常的
- `warning ...` —— 编译器的告警，原样透传
- `shrinks ...` —— 跨断点时尺寸倒退，见[断点处的倒退](#断点处的倒退)

表头的 `+5 library canvases` 是内置组件库各自的画布。它们由注册表生成，不是你能在 `@adaptive` 里写的名字，所以只报个数。完整清单见[组件库适配](./libraries.md)。
