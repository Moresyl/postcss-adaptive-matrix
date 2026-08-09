# App + PC 双设计稿工作流

## 推荐约定

设计团队交付两个画布：

- App：375px，主要流体区间 320~480px；
- PC：1440px，主要流体区间 1024~1920px；
- 768px 作为默认端口切换点。

基础选择器放共享布局、颜色、交互状态等共同部分。只把尺寸或布局真正不同的内容放进 `@adaptive pc`，避免维护两份页面。

```css
.product-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
}

@adaptive pc {
  .product-card {
    grid-template-columns: 320px 1fr;
    gap: 32px;
    padding: 32px;
    border-radius: 20px;
  }
}
```

普通规则按默认 `app` 画布转换。PC 块按 1440 画布转换并包裹到 PC 媒体查询中。

## 断点与流体区间不是一回事

断点决定哪套布局生效；流体区间决定尺寸在哪段区间内继续缩放。

默认 App 规则在 768px 前生效，但达到 480px 后尺寸停止放大，因此 600px 宽的小平板不会看到被粗暴放大的手机 UI。PC 从 768px 起生效，但尺寸在 1024px 以下保持下限，避免窄窗口过度压缩。

## 根容器

传入 `rootSelector` 后，插件会增加一个低优先级 `@layer adaptive-matrix`：

- 根布局使用 `inline-size: 100%`；
- 默认水平居中；
- App 与 PC 在各自流体上限停止增长；
- 注入安全区变量；
- 发布根列宽与留白变量，并据此修正 `position: fixed`。

最后一条值得单独说明：页面一旦成为居中的列，固定定位元素会退回以视口为包含块，底部导航栏就贴到了窗口两端。`appPcPreset` 默认修正这一点，不需要时传 `fixedContainingBlock: false`。

若现有项目已经管理根容器，省略 `rootSelector` 即可，插件不会注入全局 CSS。

## 第三方组件库

不需要配置。组件库按自己的设计画布换算，桌面端组件库保留像素，主题 token 按名字识别并走文字混合公式——详见 [配置参考](./configuration.md#libraries)。

需要覆盖时用 `extends`：

```js
adaptiveMatrix({
  ...appPcPreset({ rootSelector: '#app' }),
  libraries: [{ extends: 'vant', designWidth: 750 }],
})
```

仍然可用的兜底手段：`routes` 显式改派、`exclude: /node_modules/`、`selectorExclude`，以及三种注释指令。

## 验收尺寸

建议至少在以下宽度做视觉回归：320、375、480、767、768、1024、1440、1920、2560。另测浏览器 200% 文字缩放、iOS 安全区、Android WebView 软键盘、横屏和容器查询组件。
