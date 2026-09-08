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
| `unitToConvert` | `['px']` | 读取的输入单位，也可以只传一个字符串 |
| `rootValue` | `16` | 一个 `rem` 折合多少像素；也可按文件用函数选择 |
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

内置预设会补齐顶层配置，因此多数用法不要求用户先填写任何字段；空的 `profiles: {}` 也与省略等价，让条件拼装出的配置保持无信息状态。不需要覆盖项的 profile 可只写宽度：`profiles: { mobile: 375 }`；只有还需 `fluid`、`query`、`unit` 等设置时才写 `{ designWidth: 375, ... }`。主动写出嵌套对象后，也只有决定其身份或计算方式的值才必填：`profile.designWidth`、对象形式的 `query.condition`、路由的 `profile` 加至少一种匹配通道，以及不使用 `extends` 的自定义组件库 `name` 与 `designWidth`（`extends` 条目会继承它们）。`fluid` 和 `root` 内没有任何必填成员。对象组合产生的顶层可选字段若为 `undefined`，会与省略完全等价；`null` 仍是明确错误，不会静默套默认值。只写一张自定义 profile 时，它还会自动成为 `defaultProfile`；若有多张且没有 `app`，才需要指定默认项，因为此时不存在唯一答案。

字符串文件匹配不受路径分隔符影响：`src/components/` 同样匹配 `C:\\repo\\src\\components\\card.css`，反斜杠写法也能匹配 POSIX 路径。正则与谓词函数仍收到未经修改的原始路径，已有的宿主平台逻辑不会被偷偷改写。

列表型过滤器都可直接传单项：`propList: 'width'`、`textProperties: 'font-size'`、`selectorExclude: '.legacy'`、`valueExclude: /fixed/` 与单元素数组完全等价；只有多个条目才需要数组。

`propList` 示例：

```js
propList: ['*', '!border*', '!box-shadow']
```

`*` 不能省。只写排除项的 `['!border*']` 在语义上匹配不到任何属性，等于整份样式表都不换算——这种配置会直接报错，不会静默生效。

### 配置一律先校验

CSS 长度转换受 JavaScript 有限数值范围约束。原始长度或中间计算溢出时，CSS 转换路径会保留原 token，不输出 `Infinity` 或 `NaN`；同一声明中的其他长度仍可转换。例如在 375px 画布的纯视口模式下，`1e308px 24px` 会成为 `1e308px 6.4vw`。保留原值不代表已成功自适应，也不保证浏览器渲染结果。应在输入源修正极端数值；当前回退不产生专门告警，因此仅通过 warnings 门禁无法发现它。

配置多半写在 `.mjs` 里，没有任何类型检查兜底，而这些字段写错的后果都是**静默的**——所以下列情况一律在读第一个样式文件之前就报错：

| 写法 | 后果 |
| --- | --- |
| `unit: 'vm'` | 输出 `4.267vm`。它不是长度，浏览器整条声明丢弃，元素保留继承值 |
| `strategy: 'viewpoint'` | 静默回退到 `clamp`，看起来像设置生效了 |
| `unitToConvert: ''` / `[]` | 匹配不到任何长度，与没装插件无法区分 |
| `rootValue: 0` | 每个 `rem` 读成 0，输出侧再除零 |
| `atRuleName: 'media'` | 样式表里每个 `@media` 都被当成画布名读取并改写。At-keyword 大小写不敏感，`MEDIA` 是同一个冲突 |
| `atRuleName: ' canvas '` | 规范化为 `canvas`；否则校验虽然通过，却永远匹配不到任何 `@canvas` 块 |
| `fontFluidity: NaN` / `rootMaxWidth: Infinity` | 输出 `NaNrem` 或 `Infinitypx`；声明无效并被浏览器丢弃 |
| `query: { type: 'media' }` | 输出 `@media undefined`，把原本有效的规则包进无效查询 |
| `propList: 16` | JavaScript/JSON 结构错误；不前置校验就会在深处泄漏 `.every is not a function` |
| `minPixeValue: 2` | 未知字段；不拦截就会被混入选项后静默忽略，错误会建议 `minPixelValue` |
| `root.selector: ''` | 编译成 `:where()`，这是解析错误——整段基础样式连同安全区变量一起被丢弃 |
| `textAnchorWidth: 0` | 除零，文字长度整列变成 `Infinity` |

`unit` 与 `strategy` 在 profile 级别同样校验。集合成员及嵌套的 route、query、root、library 字段都会带完整路径校验（例如 `routes[0].media[1].minWidth`），因此 JavaScript 配置也会得到与公开 JSON Schema 一样的前置保护。

每层对象都和 Schema 的 `additionalProperties: false` 一样是封闭的：顶层选项，或 `profiles`、`fluid`、`query`、`routes`、`media`、`root`、`libraries` 内字段一旦拼错，绝不会静默忽略。能明确判断为相近字段时（短名字两次编辑内，长名字三次），错误会直接给建议；完全无关的键只拒绝，不乱猜。

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
rootValue?: number | ((context: { file: string }) => number) // 默认 16
```

默认只读 `px`。传数组可以一次读多种单位——原子化 CSS 项目需要这个，见[构建工具集成](./integration.zh-CN.md#原子化-csstailwind-与-unocss)：

```js
unitToConvert: ['px', 'rem']
```

当前 profile 的输出单位始终视为已经转换，即使它也出现在 `unitToConvert` 中。这样兼容模式输出的裸 `vw` 才能安全经过下一次构建。其他单位组合仍有意义：显式配置后，输出 `cqi` 的 profile 仍可读取作者写下的 `vw`。

单位之间的换算规则只有一条：**`rem` 按 `rootValue` 折成像素，其它单位按面值读。**

列表中的每个单位都必须是未转义 CSS 标识符（如 `px`、`rem`、`rpx`、`dp`）。百分比不是单位 token，单位内部也不能有标点或空白；`%`、`px|rem`、`two words` 这类值会直接被拒绝，不会被编成含义误导的正则。

`em` 也按面值读，这是刻意的。`em` 相对的是元素继承来的字号，那是运行时才知道的事，构建期没有任何常数能替它。把 `em` 当 `rem` 处理，只在两者恰好相等的地方是对的——而那在一份样式表里是少数。

`rootValue` 同时管两头：

- 读的时候，`1rem` 折成多少像素；
- 写的时候，文字的静态部分除以多少变成 `rem`。

所以页面写了 `html { font-size: 62.5% }` 就配 `rootValue: 10`，`3.2rem` 与 `32px` 会得到完全一样的产物，两边都对。只配一头会错一头，因此这里没有第二个选项可配。

`rootValue` 本身是可选的。如果同一个仓库里的不同子应用使用不同根字号，可以传函数，让源文件路径在每个文件上选择一次标尺：

```js
rootValue: ({ file }) => file.replaceAll('\\', '/').includes('/legacy/') ? 10 : 16
```

回调收到带宿主平台原始分隔符的 `{ file }`，必须返回大于 0 且有限的数字。按文件选择时需要真实的 PostCSS `from` 路径；没有路径时样式仍会编译，但因为回调无法区分文件，会给出一次告警。

`minPixelValue` 与 `hairline` 的阈值是**像素**，不是面值。框架把发丝线写成 `0.0625rem`、你手写成 `1px`，是同一根线，都会被 `hairline` 拦下。

## AdaptiveRoute

只有一条路由时可直接传对象；只有多条路由需要表达先后顺序时才用数组。两种形式在内部都会归一化成同一份有序列表。

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

把匹配到的 CSS 改派到另一张画布，`profile: false` 则保留像素不转换。字符串按「包含」匹配，正则按 `test` 匹配；`property` 接受以 `--` 开头的未转义自定义属性前缀，按自定义属性自身的规则区分大小写，单独写 `--` 可认领全部自定义属性；`media` 匹配的是外层 `@media` 把这条规则限死在哪段宽度里——见[断点](#断点)。

标准声明名及其 `propList` 模式按 CSS 规则不区分 ASCII 大小写：`FONT-SIZE` 仍是文字，会保留可缩放的 `rem + vw` 公式。自定义属性恰好相反：`--Theme-gap` 与 `--theme-gap` 是两个变量，因此过滤器与路由会保留其原始大小写。

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
| `(min-width: 1024px) and (orientation: landscape)` | 1024px 及以上（仅横屏） | 是 |
| `(min-width: 768px)` | 768px 及以上 | 否——它够得到 1024 以下 |

嵌套是「且」的关系，所以 `@media (min-width: 900px) { @media (min-width: 1100px) { … } }` 的生效区间是 1100px 及以上，会被认领。

`rem` 与 `em` 一律按 **16px** 折算，既不看 `rootValue`，也不看根元素的字号。媒体查询在任何声明能改动 `font-size` 之前就要求值，因此它不能依赖它自己所筛选的那一层层叠——哪怕样式表里 `html` 写着 `62.5%`，`64rem` 也还是 1024px。原子化框架的断点全都是这么写的。

宽度数字与声明共用完整 CSS number 语法：支持正负号、小数和指数，因此 `(MIN-WIDTH: 1.024e3PX)` 仍是 1024px 边界；特性名与单位按 CSS 规则不区分 ASCII 大小写。无单位 `0` 合法，其它无单位宽度、错误小数及非有限指数一律让查询变成不可读，不会把 `NaN` 泄漏进路由与诊断。

编译器读不懂的查询——带逗号、带 `not`、带 `only`，或者不受支持的非宽度特性——**谁都不认领**。横竖屏是刻意保留的例外：推导宽度区间时会投影掉 `(orientation: landscape)` / `portrait`，因为它只能缩小适用设备集合，不可能让 1024px 的下界延伸到 1024 以下。因此仅含 orientation 的查询继续使用继承画布，`orientation + min-width` 则仍可证明宽度路由。连续性分析依然保守跳过整组，因为它不能猜设备此刻的方向。`@container` 同样从不参与计数；它约束的是元素，而 `vw` 从来就与元素无关。

能读懂但彼此矛盾的边界与此不同：它们组成空区间，因此没有媒体路由会认领，已转换规则只产生一次明确的 `unreachable` 告警（例如同时写 `min-width: 1100px` 与 `max-width: 900px`）。它不会被误报成 clamp 顶死——这条规则在任何视口都不存在。CI 可用 `--fail-on warnings` 强制拦截。

要在断点处重画组件库自己的组件，两者都得写上——只写选择器会在所有宽度上生效，只写宽度区间又会输给组件库：

```js
routes: [{ selector: ['.van-'], media: { minWidth: 1024 }, profile: 'pc' }]
```

### 白送的那条告警

上面这些你一条都不用先知道，也能发现问题。只要一条规则确实生成了带边界的长度、而它的生效区间又整个落在所属画布的流体区间之外，编译器就会说出来：

```
Every converted length here is a constant: this rule is live from 1024px up, but canvas
"app" stops scaling outside 320px–600px, so its bounded expression is pinned to its maximum across
that whole range. The numbers in a breakpoint are usually measured on a different design
file — give it one with a route: { media: { minWidth: 1024 }, profile: '…' }.
```

这是算术，不是启发式：两个区间的数字压根不相交。每个文件里，同一张画布配同一段区间只报一次，而且只对换算后确实新增 `clamp()`、`min()` 或 `max()` 的声明报——只改 `display` 和 `color` 的断点、刻意保持静态的文字、无边界视口表达式，都没有可被钉住的生成边界。经 selector 或 property 路由的声明会按真正执行转换的画布检查，原生 CSS 嵌套也包含在内。

## libraries

```ts
type LibraryEntry = string | LibraryAdaptation

libraries?: LibraryEntry | readonly LibraryEntry[] | false // 字符串 'auto' 是默认值
```

默认 `'auto'`：全部内置库生效，使用 Vant 或 Element Plus 的项目不需要任何配置。`false` 整体关闭；一个内置或自定义条目可直接传入，只有多个条目才需要数组。

继承条目最少只需 `{ extends: 'vant' }`，`name` 与 `designWidth` 会从内置定义取得。独立自定义条目没有推断来源，因此仍必须提供这两个字段。

条目展开成若干条路由，追加在 `routes` 之后——显式路由永远优先。

内置清单、匹配通道、覆盖与扩展方式见 [组件库适配](./libraries.zh-CN.md)。

## Profile

只有宽度的 profile 可直接写数字；按文件选择设计宽度的函数也可直接作为值。只有需要 profile 级覆盖项时才使用对象：

```js
profiles: {
  mobile: 375,
  desktop: { designWidth: 1440, unit: 'vi' },
  embedded: ({ file }) => file.includes('/compact/') ? 320 : 375,
}
```

```ts
interface AdaptiveProfile {
  designWidth: number | ((context: { file: string; profile: string }) => number)
  fluid?: { minWidth?: number; maxWidth?: number }
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

Profile 中只有 `designWidth` 必填。省略 `fluid`（或写 `fluid: {}`）会输出无边界视口表达式；只给 `minWidth` 或 `maxWidth` 会用 `max()` / `min()` 限制单侧；两端都给才输出 `clamp()`。传入的边界必须是正有限数，同时存在时 `maxWidth` 必须大于 `minWidth`。显式使用兼容模式 `strategy: 'viewport'` 时，无论 `fluid` 如何配置都保持无边界输出。

函数型宽度收到 `{ file, profile }`。省略 `textAnchorWidth` 时会精确复用已经解析一次的 `designWidth`，不会再次调用动态 resolver。按文件选择的 resolver 需要真实 PostCSS `from` 路径；返回非法值时错误会同时指出 profile 与文件。

`query: false` 会移除 `@adaptive` 外壳但保留内部规则，适合构建不同产物时由环境选择 profile。

对象形式的 query 在没有 `type` 时默认使用媒体查询；只要提供 `name` 就会推断为命名容器查询，因此 `{ name: 'workspace', condition: '(min-width: 400px)' }` 无需重复写 `type: 'container'`。若同时显式写 `type: 'media'`，则会按冲突配置拒绝。

查询条件仍可使用当前或未来的 CSS 媒体/容器查询语法，但结构边界必须完整：字符串、注释及 `()` / `[]` component-value 块必须闭合，未转义花括号或顶层 `;` 会被拒绝。这样既不会把查询语法锁死，又能防止 JavaScript 配置拼写错误提前结束生成的 at-rule，或吞掉后续规则。

`textAnchorWidth` 默认等于 `designWidth`，只影响文字：文字有一段固定的 `rem`（用于保留浏览器缩放），固定长度必须相对某个宽度才有意义。手写画布用自己的设计宽度是对的；但当两张画布描述的是**同一份设计的两套单位**时（组件库画在 375、页面画在 750，Vant 的 16px 就是页面的 32px），各自锚在自己身上会让两边在任何视口下都对不上。组件库画布因此一律继承所属 profile 的锚点，无需配置。原理与实测见[静态部分锚在哪张画布上](./architecture.zh-CN.md#静态部分锚在哪张画布上)。

## RootFoundationOptions

```ts
interface RootFoundationOptions {
  selector?: string
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

默认不注入全局样式。主插件可直接用 `root: true` 启用默认 `:root` 基础样式，对象形式只在需要定制时使用；`appPcPreset` 同样支持该简写，填写真正定制或启用基础样式的 root 专属配置也会启用。单独写 `container: false` 或 `fixedContainingBlock: false` 只是关闭本来就没开的能力，因此不会注入全局 CSS。`rootSelector` 只用于覆盖默认选择器，不负责启用。

`root` 内没有必填成员。没有需要定制的信息时优先写 `root: true`，`root: {}` 仍完全等价；只有布局实际由 `#app` 等其他元素承载时才需要填写 `selector`。

`containerName` 必须是非保留 CSS custom-ident；只要提供名称就会自动启用 `container`，命名容器无需重复写 `container: true`，若同时显式写 `container: false` 则会报配置冲突。`layer` 必须是 `adaptive-matrix`、`framework.layout` 这类单个点分层名。空格、逗号、空片段或 CSS-wide 关键字都会在生成非法 `container-name` / `@layer` 前被拒绝。命名容器 profile 的 `query.name` 遵守同一 custom-ident 规则。

`selector` 会被放进 `:where(...)`；因此显式传入时也遵守同一结构守卫：字符串、注释、括号及属性方括号必须闭合，未转义花括号或顶层分号会在生成 foundation 前被拒绝。

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

- `left` / `right` / `inset-inline-*`，以及 `inset-inline`、`inset` 简写中的行内轴分量，为 `0` 时替换为留白，非零时改为 `calc(原值 + 留白)`；`auto` 与 CSS 全局关键字不动；
- `width` / `inline-size` 等为 `100%` 时改为 `min(100%, 列宽)`；
- 块轴（`top` / `bottom`）不处理——居中列只约束行内轴。

列宽等于视口时留白为 `0`，因此窄屏输出与手写完全一致。修正幂等，已含这两个变量的值不再二次处理。

只看规则内最终获胜的 `position` 声明，并遵守同一声明块里的顺序和 `!important`；从其它规则继承定位或解析跨规则胜者不是这次局部静态转换能观察到的，猜错比漏掉更糟。

只要启用了 `appPcPreset` 的 root 基础样式，该修正就默认开启——预设里的两张 profile 都设了 `rootMaxWidth`，正是会出现这一问题的配置。用 `appPcPreset({ root: true, fixedContainingBlock: false })` 关闭；只有真实布局根是 `#app` 时才需再写 `rootSelector: '#app'`。

不使用该预设时，仅在至少一张 profile 设置了 `rootMaxWidth` 后开启它。若没有这样的 profile，编译器会拒绝 `fixedContainingBlock: true`：此时根本不存在居中列，该选项只会改写声明，而留白永远为零。

## 旧 WebView 模式

```js
adaptiveMatrix({
  ...appPcPreset(),
  strategy: 'viewport',
  preserveOriginal: true,
})
```

这会输出原始 `px` 后再输出 `vw`。是否使用该方案应由真实目标浏览器决定；现代项目优先使用默认 `clamp`。

使用 `npx adaptive-matrix src/app.css --targets "ios_saf 13, chrome 90"` 可将内置支持表中检测到的特性与明确的目标版本比较。报告说明影响及可用配置替代方案；报告为空不能认证未跟踪的语法或渲染行为。见[浏览器特性支持与降级](./compatibility.zh-CN.md)。
