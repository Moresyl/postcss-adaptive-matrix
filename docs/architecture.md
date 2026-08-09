# 架构与转换公式

数字是怎么算出来的，以及编译器刻意不做的事。选项速查见[配置参考](./configuration.md)。

## 编译流程

1. 插件初始化时把 `libraries` 展开成路由，追加在 `routes` 之后。
2. 根据文件路径执行 `include` / `exclude`。
3. 为每条规则解析归属画布，优先级见[配置参考](./configuration.md#adaptiveroute)：`@adaptive` > 属性名路由 > 选择器路由 > 文件路由 > `defaultProfile`。
4. 使用 PostCSS AST 遍历声明，属性和值经过过滤器。
5. 使用 `postcss-value-parser` 解析值，跳过字符串和 URL 函数。
6. 把目标长度转换成有界流体表达式。
7. 规则内声明处理完毕后，若启用 `fixedContainingBlock` 且该规则自身声明了 `position: fixed`，修正其行内轴 inset 与宽度。
8. 把 `@adaptive` 改写为 `@media` 或 `@container`。
9. 如显式启用，最后追加低优先级根布局基础层。

第 7 步在第 6 步之后，因此它包裹的是换算后的流体值而不是原始像素。

## 普通长度

设设计宽度为 `D`、设计值为 `P`、流体下限和上限为 `L`、`U`。

```text
preferred = P / D × 100vw
minimum   = P × L / D px
maximum   = P × U / D px
result    = clamp(minimum, preferred, maximum)
```

负数会对边界重新排序，保证 `clamp()` 的最小值始终小于最大值。

## 文字长度与可访问性

纯 `vw` 文字无法充分响应浏览器文字缩放。设 `F` 为 `fontFluidity`：

```text
preferred = P × (1 - F) rem-part + P × F / D × 100vw
```

静态部分和上下界使用 `rem`，流体部分使用 `vw/cqi`。默认 `F = 0.35`，在设计宽度处仍严格等于设计值，同时在窗口变化与浏览器缩放之间取得平衡。项目应继续执行 WCAG 200% 缩放验收；编译公式不能替代真实可访问性测试。

## 容器查询

Profile 的 `query.type` 为 `container` 时，`@adaptive` 输出 `@container`。通常同时把 `unit` 设为 `cqi`，使组件尺寸依赖自身容器而不是浏览器窗口。

容器必须由应用已有布局或 `root.container` 建立。不要让元素查询自己；为可复用组件选择稳定的祖先容器。

## 不转换范围

- `url()`、`local()`、`format()`；
- 引号字符串；
- 已含视口/容器单位的 `clamp()`、`min()`、`max()`——见下；
- `@font-face`、`@page`、`@property`、`@counter-style` 里的声明——它们描述的是资源或页面盒子，不是元素。打印边距换成 `vw` 不是同一个边距；
- 默认的 CSS 自定义属性（被组件库 `tokenPrefix` 认领的除外——认领本身即是开关）；
- 小于 `minPixelValue` 的值；
- 不超过 `hairline` 的绝对值；
- 过滤器或注释明确排除的内容。

## 幂等

`clamp()` / `min()` / `max()` 内部只要已经出现视口或容器单位，里面的 `px` 就原样保留。

这类表达式是**已经写好的有界流体值**——可能出自作者之手，也可能出自本插件上一趟。它的 `px` 是这个表达式自己的边界，不是从设计稿上量来的尺寸，再换算一次等于缩放两次。

直接结果是产物幂等：同一段 CSS 跑一遍和跑三遍结果完全相同。插件在 PostCSS 链里被挂了两次、或者组件库预编译过又被消费方编译一次，都不会产生嵌套 `clamp`。

范围刻意只限这三个函数。`calc(100vw - 32px)` 照常转换——那里的 `32px` 确实是设计稿尺寸，只是恰好挨着一个视口单位。

幂等不止于长度换算，还包括另外两件事：

- **忽略注释保留在产物里。** 被忽略的 `40px` 和没人管过的 `40px` 长得一模一样，注释一旦被吃掉，第二趟就会把它换算了。注释会被任何压缩器去掉，而作者的「别动这里」必须活过一趟以上。
- **根容器基础样式只注入一次。** 产物开头有 `/* postcss-adaptive-matrix foundation */` 标记，第二趟见到它就整段跳过——既不会把 `max-inline-size: 480px` 这类固定上限当成设计稿尺寸再缩放，也不会叠出第二份。

一致性套件对**每一个**样例都断言了这一点：把产物再编译一遍必须原样返回。

## 嵌套

原生 CSS 嵌套里，`@adaptive` 与条件组规则（`@media`、`@supports`、`@layer`、`@container`、`@scope`、`@starting-style`）内部的声明属于外层元素，照常转换：

```css
.card {
  padding: 16px;          /* 默认画布 */

  @adaptive pc {
    padding: 32px;        /* pc 画布，并改写成 @media */
  }
}
```

插件没见过的 at-rule，内部的**规则**仍然会被处理，**直接声明**不会——未知语境下按元素样式处理是猜测。

## fixed 修正的边界

`fixedContainingBlock` 是唯一一处编译器改写定位的地方，它刻意做得很窄：

- 需要显式开启（`appPcPreset` 在建立居中列时默认开启，因为那正是问题出现的配置）；
- 只处理**规则自身**声明了 `position: fixed` 的情况。从其它规则继承定位无法静态观察，按选择器组合去推测会制造隐藏的运行时耦合；
- 只处理行内轴；
- 只在值为 `0` 或 `100%` 这类无歧义形态上做替换，其余一律用 `calc()` 叠加，且幂等。

除此之外，编译器不猜测设计意图，不自动移动侧栏，也不注入 JavaScript。复杂布局应由 CSS Grid、Flexbox、容器查询和明确的端口规则表达。
