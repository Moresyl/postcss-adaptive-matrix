# 迁移指南

从任何一种「px 换算成视口单位」的方案迁移，步骤都一样：先让输出对齐，再逐步启用新能力。按概念对照，不必逐个配置项去找同名替代。

## 第一步：只换等价物

先不引入任何新特性，让新旧产物尽可能接近：

```js
adaptiveMatrix({
  defaultProfile: 'app',
  profiles: {
    app: {
      designWidth: 375,     // 原来的视口基准宽度
      fluid: { minWidth: 320, maxWidth: 480 },
      query: false,         // 不生成媒体查询外壳
    },
  },
  precision: 5,             // 原来的小数位数
  strategy: 'viewport',     // 输出纯 vw，与旧方案同形
  libraries: false,         // 组件库适配也先关掉
})
```

`strategy: 'viewport'` 输出的是不带边界的 `vw`，与传统方案逐字节可比。此时差异只应来自舍入。

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

两处需要换个想法，而不是换个名字：

**横屏不是全局开关。** 新建一个 landscape profile 并给它明确的媒体查询，横屏就拥有自己的设计宽度和缩放区间，而不是从竖屏推算出来的比例。

**桌面宽度不是设计宽度。** 如果 PC 只是把移动版居中展示，那它没有自己的设计稿，用 app profile 加 `rootMaxWidth` 即可。如果 PC 有独立设计稿，就给它独立的 `designWidth`，把差异写进 `@adaptive pc`。这两件事以前常被同一个配置项表达，在这里是两种不同的结构。

## 第三步：逐项启用

确认视觉一致后，按顺序打开：

1. `strategy` 改回默认 `clamp`——尺寸获得上下界，大屏不再无限放大；
2. 移除 `query: false`，或改用 `appPcPreset` 引入 PC profile；
3. 删掉 `libraries: false`，组件库按各自画布适配（详见 [组件库适配](./libraries.md)）。这一步通常可以顺带删掉原方案里为组件库写的整段忽略名单；
4. 需要居中列时配置 `root`，`fixedContainingBlock` 会一并处理固定定位元素。

## 验收

- 保存旧产物作为视觉基线；
- 覆盖 320、375、480、768、1024、1440、1920；
- 检查 fixed/sticky、弹窗、第三方组件和输入法；
- 执行 200% 浏览器缩放与键盘导航测试——文字混合公式的收益正是在这里体现，也只有真实测试能验证。
