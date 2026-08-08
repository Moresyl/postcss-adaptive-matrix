# 迁移指南

## 从 postcss-px-to-viewport-8-plugin 迁移

最小迁移：

```js
// 旧
pxToViewport({ viewportWidth: 375, unitPrecision: 5 })

// 新
adaptiveMatrix({
  defaultProfile: 'app',
  profiles: {
    app: {
      designWidth: 375,
      fluid: { minWidth: 320, maxWidth: 480 },
      query: false,
    },
  },
  precision: 5,
  strategy: 'viewport',
})
```

确认视觉一致后，把 `strategy` 切回默认 `clamp`，再逐步添加 PC profile。

| 旧配置 | 新配置 |
| --- | --- |
| `viewportWidth` | `profiles.app.designWidth` |
| `unitPrecision` | `precision` |
| `viewportUnit` | `unit` 或 profile `unit` |
| `propList` | `propList` |
| `selectorBlackList` | `selectorExclude` |
| `minPixelValue` | `minPixelValue` |
| `exclude` / `include` | 同名，额外支持函数 |
| `replace: false` | `preserveOriginal: true` |
| ignore 注释 | 改用 `adaptive-ignore-*` |

原插件的 `landscape` 不再是全局开关。新增 `landscape` profile，并给它明确媒体查询，使横屏可以拥有自己的设计宽度和缩放区间。

## 从 postcss-mobile-forever 迁移

mobile-forever 的核心是假设只有一套移动端设计稿，再生成桌面与横屏比例。adaptive-matrix 允许 App 和 PC 各自拥有设计画布，因此迁移时先决定：

1. PC 仍展示居中的移动版：只用 app profile，并配置 `rootMaxWidth`。
2. PC 有独立设计稿：使用 `appPcPreset`，将 PC 差异放进 `@adaptive pc`。

常见映射：

| mobile-forever | adaptive-matrix |
| --- | --- |
| `viewportWidth` | App profile `designWidth` |
| `maxDisplayWidth` | App `fluid.maxWidth` + `rootMaxWidth` |
| `desktopWidth` | 不再代表设计宽度；改为 PC `designWidth`/`fluid` |
| `landscapeWidth` | 独立 landscape profile |
| `enableMediaQuery` | 每个 profile 的 `query` |
| `appSelector` | `root.selector` |
| `propList` | `propList` |
| `selectorBlackList` | `selectorExclude` |
| `valueBlackList` | `valueExclude` |
| `mobileUnit` | App profile `unit` |
| `experimental.minDisplayWidth` | `fluid.minWidth` |

fixed 元素建议放入应用自己的定位包含块，并使用逻辑属性。编译器不会通过推测选择器组合去重写 `left/right`，从而避免隐藏的运行时布局耦合。

## 迁移验收

- 保存旧产物作为视觉基线；
- 先使用 `strategy: 'viewport'` 缩小差异面；
- 覆盖 320、375、480、768、1024、1440、1920；
- 检查 fixed/sticky、弹窗、第三方组件和输入法；
- 再启用默认 `clamp`、文字混合公式、PC profile；
- 最后执行 200% 缩放与键盘导航测试。
