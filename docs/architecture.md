# 架构与转换公式

## 编译流程

1. 根据文件路径执行 `include` / `exclude`。
2. 普通规则选择 `defaultProfile`；`@adaptive name` 切换到指定 profile。
3. 使用 PostCSS AST 遍历声明，属性和值经过过滤器。
4. 使用 `postcss-value-parser` 解析值，跳过字符串和 URL 函数。
5. 把目标长度转换成有界流体表达式。
6. 把 `@adaptive` 改写为 `@media` 或 `@container`。
7. 如显式启用，最后追加低优先级根布局基础层。

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
- 默认的 CSS 自定义属性；
- 小于 `minPixelValue` 的值；
- 不超过 `hairline` 的绝对值；
- 过滤器或注释明确排除的内容。

编译器不猜测设计意图，不自动移动侧栏、不重写 fixed 定位，也不注入 JavaScript。复杂布局应由 CSS Grid、Flexbox、容器查询和明确的端口规则表达。
