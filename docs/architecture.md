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
- 默认的 CSS 自定义属性（被组件库 `tokenPrefix` 认领的除外——认领本身即是开关）；
- 小于 `minPixelValue` 的值；
- 不超过 `hairline` 的绝对值；
- 过滤器或注释明确排除的内容。

## fixed 修正的边界

`fixedContainingBlock` 是唯一一处编译器改写定位的地方，它刻意做得很窄：

- 需要显式开启（`appPcPreset` 在建立居中列时默认开启，因为那正是问题出现的配置）；
- 只处理**规则自身**声明了 `position: fixed` 的情况。从其它规则继承定位无法静态观察，按选择器组合去推测会制造隐藏的运行时耦合；
- 只处理行内轴；
- 只在值为 `0` 或 `100%` 这类无歧义形态上做替换，其余一律用 `calc()` 叠加，且幂等。

除此之外，编译器不猜测设计意图，不自动移动侧栏，也不注入 JavaScript。复杂布局应由 CSS Grid、Flexbox、容器查询和明确的端口规则表达。
