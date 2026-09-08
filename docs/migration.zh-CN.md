# 迁移指南

[English](./migration.md) · **简体中文**

从任何一种「px 换算成视口单位」的方案迁移，步骤都一样：先让输出对齐，再逐步启用新能力。按概念对照，不必逐个配置项去找同名替代。

## 第一步：只换等价物

先不引入任何新特性，让新旧产物尽可能接近：

```js
adaptiveMatrix({
  profiles: {
    app: {
      designWidth: 375,     // 原来的视口基准宽度
      query: false,         // 不生成媒体查询外壳
    },
  },
  precision: 5,             // 原来的小数位数
  strategy: 'viewport',     // 输出纯 vw，与旧方案同形
  libraries: false,         // 组件库适配也先关掉
})
```

`strategy: 'viewport'` 输出不带边界的 `vw`，此模式不需要填写流体边界。只有一个 profile 时也会自动选为默认。这个配置是迁移起点，不保证与旧插件逐字节一致：需要对照原产物核对属性过滤、忽略值、细线处理和舍入。例如默认 `hairline: 1` 会保留 1px 边框；只有旧构建确实需要缩放细线时，才设置 `hairline: 0`。

## 第二步：概念对照

| 你原来配置的东西 | 这里的位置 |
| --- | --- |
| 设计稿宽度 / 视口基准宽度 | profile 的 `designWidth` |
| 小数位数 | `precision` |
| 输出单位 | `unit`，或某个 profile 的 `unit` |
| 属性白/黑名单 | `propList`（支持 `*` 与 `!`） |
| 选择器黑名单 | `selectorExclude` |
| 属性值黑名单 | `valueExclude` |
| 最小转换像素值 | `minPixelValue` |
| 文件包含/排除 | `include` / `exclude`，额外支持函数 |
| 保留原声明作为回退 | `preserveOriginal: true` |
| 根容器选择器 | `root.selector` |
| 桌面端最大展示宽度 | `fluid.maxWidth` + `rootMaxWidth` |
| 忽略注释 | `adaptive-ignore` / `adaptive-ignore-next` / `adaptive-ignore-rule` |

迁移期间，已有的 `/* px-to-viewport-ignore(-next) */` 与 `/* mobile-ignore(-next) */` 指令会继续生效，并与原生注释一样保留在产物里以保证二次编译，无需增加任何兼容配置。旧 `postcss-pxtorem` 依赖大写单位跳过的写法（如 `1PX`）不会在这里被当作忽略信号，因为 CSS 单位本就不区分大小写；请改用明确注释。

### 检查已有数学表达式

转换结果并不与所有旧插件逐字节兼容。在使用 375px 画布和纯视口输出的本地对比中，`postcss-px-to-viewport@1.1.1` 会把 `min(24px, 50vw)` 转成 `min(6.4vw, 50vw)`，本项目则保留原值。Adaptive Matrix 会保护已包含视口/容器单位的边界表达式，避免预编译产物再次转换。迁移时应检查已有的 `min()` / `max()` / `clamp()`：如果其中的像素项必须缩放，请明确写出预期的流体表达式。大写输入单位在这里也会转换，不要依赖 `PX` 作为忽略标记。

### 区分布局决策

**横屏不是全局开关。** 新建一个 landscape profile 并给它明确的媒体查询，横屏就拥有自己的设计宽度和缩放区间，而不是从竖屏推算出来的比例。

**桌面宽度不是设计宽度。** 如果 PC 只是把移动版居中展示，那它没有自己的设计稿，用 app profile 加 `rootMaxWidth` 即可。如果 PC 有独立设计稿，就给它独立的 `designWidth`，把差异写进 `@adaptive pc`。这两件事以前常被同一个配置项表达，在这里是两种不同的结构。

## 第三步：逐项启用

确认视觉一致后，按顺序打开：

1. 移除 `strategy: 'viewport'` 恢复默认策略。只有设计需要时才添加 `fluid` 边界：`{ maxWidth: 480 }` 限制上界，`{ minWidth: 320 }` 限制下界，同时提供两者才输出 `clamp()`。不设边界仍然无界缩放，切换策略本身不会自动补出范围；文字也会恢复默认的 rem/视口混合公式；
2. 移除 `query: false`，或改用 `appPcPreset` 引入 PC profile；
3. 删掉 `libraries: false`，组件库按各自画布适配（详见 [组件库适配](./libraries.zh-CN.md)）。这一步通常可以顺带删掉原方案里为组件库写的整段忽略名单；
4. 需要居中列时配置 `root`，`fixedContainingBlock` 会一并处理固定定位元素。

## 验收

- 保存旧产物作为视觉基线；
- 覆盖 320、375、480、768、1024、1440、1920；
- 检查 fixed/sticky、弹窗、第三方组件和输入法；
- 执行 200% 浏览器缩放与键盘导航测试——文字混合公式的收益正是在这里体现，也只有真实测试能验证。
