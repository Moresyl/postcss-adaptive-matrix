# 浏览器特性支持与降级

编译器产出的不只是数字。`clamp()` 是语法，`@layer` 是语法，`:where(#app)`、`env(safe-area-inset-top)`、`inline-size` 全都是语法——每一项都有自己的支持门槛，而它们的门槛差了将近十年。

这一页把门槛列全，并且对每一项回答同一个问题：**不支持的时候，丢掉的是什么，以及关掉它要付什么代价。**

## CSS 不报错，它丢弃

这是整页的前提。浏览器遇到读不懂的 CSS 不会抛异常、不会退回上一个值、也不会在控制台留话，它只是把读不懂的那一段**当作没写过**。丢弃的范围取决于读不懂的东西在哪一层：

| 读不懂的是 | 作废的是 | 例子 |
| --- | --- | --- |
| 一个值 | 这条声明 | `padding: clamp(...)` → 这个元素没有 padding |
| 一个选择器 | 这条规则整块 | `:where(#app) { ... }` → 根容器的所有声明 |
| 一条 @规则 | 这个块里的全部 | `@layer { ... }` → 整套根基础样式 |

所以排查顺序不是按「哪个特性更新」，而是按**丢得多**。下面的顺序、以及 `COMPAT_FEATURES` 表在代码里的顺序，都是这么排的。

## 最低版本

| 特性 | Chrome | Edge | Safari | iOS Safari | Firefox | Samsung |
| --- | --- | --- | --- | --- | --- | --- |
| `@layer` | 99 | 99 | 15.4 | 15.4 | 97 | 18.0 |
| `:where()` ¹ | 88 | 88 | 14 | 14.0 | 78 | 15.0 |
| `@container` / `container-type` | 106 | 106 | 16.0 | 16.0 | 110 | 20 |
| `clamp()` `min()` `max()` | 79 | 79 | 13.1 | 13.4 | 75 | 12.0 |
| `cqw` / `cqi` | 105 | 105 | 16.0 | 16.0 | 110 | 20 |
| `vi` ² | 108 | 108 | 15.4 | 15.4 | 101 | 21 |
| `inline-size` / `margin-inline` | 89 | 89 | 15 | 15.0 | 66 | 15.0 |
| `var()` | 49 | 16 | 10 | 10.0 | 31 | 5.0 |
| `env(safe-area-inset-*)` | 69 | 79 | 11.1 | 11.3 | 65 | 10.1 |
| `vw` | 26 | 16 | 6.1 | 8 | 19 | 4 |
| 原生嵌套 ³ | 120 | 120 | 17.2 | 17.2 | 117 | 25 |

¹ caniuse 没有 `:where()` 的独立条目，这里取 `:is()`。不是凑数：两者出自同一节规范，在 Chrome 88、Firefox 78、Safari 14 同批发布。
² 同理，`vi` 走 `svh` / `lvh` / `dvh` 那个条目——同一批规范、同一批发布。
³ 编译器**不产出**嵌套，列在这里只是因为它是个会被问到的问题。见下文。

数据取自 caniuse-lite `1.0.30001809`，由 `scripts/capture-compat.mjs` 烘焙进 `src/core/compat-data.ts`。

## 逐项：丢什么，怎么关

### `@layer` —— 丢得最多的一项

**谁产出它**：`root.layer`。`appPcPreset` 只要给了 `rootSelector` 就会设成 `'adaptive-matrix'`。

**丢什么**：整个 `@layer` 块作废，根基础样式**一次性全没**——居中的列、安全区变量、固定定位修正，一起消失。这是表里单项损失最大的一条。

**怎么关**：`root: { layer: false }`，同样的规则不加包装地输出。代价是层叠位置：基础样式原本靠「在更低的层」必输给你自己的 CSS，去掉之后就要按普通优先级和你竞争。原来随手就能覆盖的地方，可能得写成真选择器。

### `:where()`

**谁产出它**：每一条根基础样式规则，`root.selector` 被包在里面。

**丢什么**：选择器读不懂，规则整条作废——和丢 `@layer` 同样的结果，只是一条一条丢。

**怎么关**：`root: false`，把基础样式整个去掉。生硬，但这是受支持的路径。没有「输出裸选择器」的选项，因为**零优先级正是它存在的理由**：它让你的 CSS 不必打优先级官司就能覆盖基础样式。给了那个开关，等于给了一个静悄悄改变层叠行为的开关。

### `@container` 与容器单位 `cqw` / `cqi`

**谁产出它**：`root.container: true`；`query: { type: 'container' }` 的 profile；`unit: 'cqw'` 或 `'cqi'`。

**丢什么**：`container-type` 声明作废，这一条很安静；`@container` 块整个作废，这一条不安静——靠容器查询切换的 profile 不再切换，默认画布之外的画布全部消失。容器单位则和 `clamp()` 一样，连着声明一起丢。

**怎么关**：`root: { container: false }`，profile 查询改用 `type: 'media'`，`unit` 改回 `'vw'`。媒体查询量的是视口而不是祖先元素——除非组件真的会在一个可拖拽的面板里独立重排，否则你要的本来就是视口。

### `clamp()` / `min()` / `max()`

**谁产出它**：`strategy: 'clamp'`（默认）下的每一个换算长度，以及 `root.fixedContainingBlock` 的留白算术。

**丢什么**：每条带它的声明作废，属性退回继承值或初始值。不是「尺寸有点不对」，是**根本没有尺寸**。

**怎么关**：两个选项，可以叠加。

```js
adaptiveMatrix({
  ...appPcPreset(),
  strategy: 'viewport',    // 输出裸的 vw，不带上下界
  preserveOriginal: true,  // 前面再留一条原始 px 声明
})
```

`strategy: 'viewport'` 换成裸视口长度，支持面几乎无死角，代价是没有边界——设计会一路缩放出流体区间的两端。`preserveOriginal` 是另一半：原始像素值作为前一条声明保留下来，丢掉流体那条的浏览器落在设计稿尺寸上，而不是落在虚无里。

### 逻辑属性 `inline-size` / `margin-inline` / `max-inline-size`

**谁产出它**：根基础样式，只要配了 `root`。

**丢什么**：逐条作废。**这是表里唯一一个失败之后页面看起来还挺正常的**：丢了 `margin-inline: auto`，列宽完全正确、稳稳地贴在屏幕左边；丢了 `max-inline-size`，列直接铺满。两种结果都不像「不支持」，像是有人这么设计的。正因为不像故障，它比 `@layer` 那种一眼可见的崩塌更容易活着上线。

**怎么关**：`root: { logical: false }`，改写 `width`、`margin-left` / `margin-right`、`max-width`。横排页面上什么都不损失——两种拼法在书写模式变化之前是同一件事。

```js
appPcPreset({ rootSelector: '#app', rootLogical: false })
// 或
adaptiveMatrix({ root: { selector: '#app', logical: false } })
```

### `vi`

**谁产出它**：`unit: 'vi'`。

**丢什么**：声明作废。

**怎么关**：`unit: 'vw'`（默认值）。`vi` 跟随书写模式，两者只在竖排文字或旋转过的根元素上才有区别；横排页面上它们量的是同一段长度，而 `vw` 从 Safari 6.1 就有了。

### `env(safe-area-inset-*)`

**谁产出它**：`root.safeAreaVariables`。

**丢什么**：这一条值得说准确，因为兜底参数做的事和它看起来要做的事不一样。`env(safe-area-inset-top, 0px)` 里的 `0px`，兜的是**浏览器认识这个环境变量但没有值**的情况——不是浏览器压根没听说过 `env()` 的情况。后者会让 `--adaptive-safe-top` 持有一个读不懂的值，而所有通过 `var()` 读它的声明在计算值阶段一起作废。

**怎么关**：`root: { safeAreaVariables: false }`。所有没有 `env()` 的浏览器，也都早于它要绕开的那些刘海——没有需要补偿的东西。

### `var()`

**谁产出它**：`root.safeAreaVariables` 和 `root.fixedContainingBlock`，以及你自己 CSS 里经过编译器的设计 token。

**丢什么**：声明作废。

**怎么关**：`safeAreaVariables: false` + `fixedContainingBlock: false` 去掉编译器引入的那几个。Safari 10 / Chrome 49 就支持了，所以这一条通常是拿来打勾的，不是拿来动的。

### `vw`

**谁产出它**：`unit: 'vw'`（默认），以及根列宽的算术。

**丢什么**：声明作废。

**怎么关**：没有，也不需要。这是表里最老的一项（Safari 6.1，2013 年），比其余每一条都早。关掉它等于不做自适应。

### 原生嵌套

**谁产出它**：没有人。编译器**读**嵌套规则——包括嵌在里面的 `@adaptive`——然后把每条声明写回原处。嵌套出现在你的产物里，只可能是因为它本来就在你的源码里。

**怎么办**：上线前拍平。Sass 和 Less 本来就会拍，纯 CSS 用 postcss-nesting。审计**刻意不去猜**：靠模式识别原生嵌套会把普通 CSS 误读成嵌套，报错比不报更糟。

## 一条命令跑完审计

给 `--targets` 一串「浏览器 + 你打算支持的最低版本」：

```bash
npx adaptive-matrix src/app.css -c adaptive.config.mjs --targets "ios_saf 13, chrome 90"
```

```
  needs @layer — iOS Safari 13 < 15.4, Chrome 90 < 99
          from: root.layer, which appPcPreset sets to 'adaptive-matrix' whenever a rootSelector is given
          seen: @layer adaptive-matrix { :where(#app) {
          if unsupported: The whole @layer block is dropped, so the entire root
          foundation goes with it — the centred column, the safe-area variables
          and the fixed-position correction all vanish at once.
          instead: root.layer: false emits the same rules unwrapped. ...
  needs :where() — iOS Safari 13 < 14.0-14.4
  needs clamp(), min(), max() — iOS Safari 13 < 13.4-13.7
  needs inline-size, margin-inline, max-inline-size — iOS Safari 13 < 15.0-15.1
```

（上面是本仓库 `examples/app-pc` 的真实输出，只截短了长句。注意 `clamp()` 那条：iOS Safari 13 差的不是一个大版本，是一个小版本——13.4 就有了。这种差距肉眼比对版本号时最容易看漏。）

目标全都够用时只有一行：

```
  every target reads all 7 CSS features in this output
```

已知名字：`chrome`、`edge`、`safari`、`firefox`、`ios_saf`、`samsung`；`android` 和 `webview` 归到 `chrome`（那本来就是它们跑的东西）。名字不认识**会报错并以 1 退出**，不会静默跳过——一个被悄悄丢掉的目标比没有审计更糟，因为它读起来像通过了。

### 审计读的是产物，不是配置

这是唯一能保证审计和输出永远不会走偏的做法。经预设、经组件库路由、经你自己手写 CSS 进入样式表的特性，都是你发出去的特性，读产物就都能看见。配置里读不出来的东西太多了。

## 让构建直接失败

同一套检查从包里导出，不经过命令行：

```js
import postcss from 'postcss'
import adaptiveMatrix, { auditCompatibility } from 'postcss-adaptive-matrix'

const result = await postcss([adaptiveMatrix(options)]).process(css, { from })
const audit = auditCompatibility(result.root.toString(), {
  ios_saf: 13,
  chrome: 90,
})

if (audit.unknownBrowsers.length) throw new Error('目标名字写错了')
for (const { feature, shortfalls } of audit.findings) {
  console.error(feature.title, '→', shortfalls.map((s) => `${s.name} ${s.target} < ${s.since}`))
}
if (audit.findings.length) process.exit(1)
```

`auditCompatibility(css, targets)` 返回 `{ findings, satisfied, unknownBrowsers }`。另外导出的还有 `detectFeatures(css)`（只认特性、不比版本）、`COMPAT_FEATURES`（完整的特性表，`failure` 和 `fallback` 文案就在里面）、`FEATURE_SUPPORT`（版本数据）、`compatFeature(id)`。类型齐全。

## 数据的口径

**版本号烘焙进包里，caniuse-lite 只是 devDependency。** 「某个特性从哪个版本开始能用」是不会再变的历史；插件因此不需要为它增加任何运行时依赖，离线也能审计。

**故意不看使用率。** 0.4% 的用户算不算数，是关于你的项目的决定，不是关于这份样式表的事实。`browserslist` 已经是回答那个问题的地方了。

**`--targets` 收的是显式的「名字 + 版本」，不是 browserslist 查询。** 查询要拉进 browserslist 包，回答的是关于你的用户的问题而不是关于这份样式表的问题，而且**同一条查询会随着数据库更新而改变含义**——今天通过的构建，下个月数据一更就红了，而代码一个字没动。显式版本号不会这样。

**扫描的是「从此再没断过支持」的版本**，而不是第一个出现 `y` 的版本。个别特性发布后又被撤回过，取前者才是「从这个版本起可以放心」的答案。caniuse 写成 `13.4-13.7` 的区间是它自己不单独跟踪的版本段，审计取低端。

## 这不能代替真机

说清楚这份审计能证明什么：**你的目标浏览器都能解析这份 CSS 里的每一处语法。** 仅此而已。

它不能证明页面在那台设备上好看。真机测的是别的东西——渲染差异、软键盘顶起视口、地址栏收起时的高度跳变、WebView 的自定义行为。这些在 `docs/runtime.md` 里有对应的运行时补丁，但那是另一个问题。

反过来说，版本门槛这件事真机也测不了：手上那台 iPhone 是 iOS 17，它读得懂 `@layer` 这个事实，对「iOS 15.4 以下读不懂」没有任何说明力。要把这件事测出来，需要的是一柜子旧设备，而不是一台好设备。审计做的正是这一半——而且做得比一柜子设备更全。

## 相关

- [配置参考](./configuration.md) —— 上面每个开关的完整语义
- [命令行预览](./cli.md) —— `--targets` 和其余选项
- [可选运行时](./runtime.md) —— 软键盘、地址栏、WebView
- [发布与兼容性](./release.md) —— 产物格式与 Node 版本
