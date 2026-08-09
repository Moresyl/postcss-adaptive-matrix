# 可选运行时

编译器本身不产生任何 JavaScript。这个模块是单独的入口，**默认不需要**，只有当 CSS 的视口单位和用户看到的可视区域对不上时才引入。

```js
import { observeAdaptiveViewport } from 'postcss-adaptive-matrix/runtime'

const observer = observeAdaptiveViewport()
// 组件卸载 / 页面离开时
observer.destroy()
```

## 什么时候需要它

CSS 的 `vw` / `vh` 指的是**布局视口**，浏览器有意让它在软键盘弹出、页面被捏合缩放时保持不动。多数情况这是对的行为。但有几种场景下它不是：

| 场景 | 现象 |
| --- | --- |
| 移动端软键盘弹起 | `100vh` 仍是全屏高，底部按钮被键盘盖住 |
| 用户双指捏合缩放 | 视口单位不变，固定元素飘出屏幕 |
| iOS Safari 地址栏收起/展开 | `100vh` 与实际可视高度差一条地址栏 |
| WebView / Capacitor / Tauri 外壳 | 宿主给的可视区域与布局视口不一致 |

这些都是 `VisualViewport` 才能看到的信息，CSS 拿不到。这个观察器把它读出来写成 CSS 变量。

## 发布的变量

调用后写在 `document.documentElement` 上（可用 `target` 改）：

| 变量 | 含义 |
| --- | --- |
| `--adaptive-width` | 可视区域宽度（px 数值，无单位） |
| `--adaptive-height` | 可视区域高度 |
| `--adaptive-layout-height` | 布局视口高度，即 `window.innerHeight` |
| `--adaptive-keyboard-height` | 软键盘遮挡高度，无键盘时为 `0` |
| `--adaptive-scale` | 当前捏合缩放倍数 |
| `--adaptive-vh` | 可视高度的 1%，**带 px 单位** |
| `--adaptive-vw` | 可视宽度的 1%，**带 px 单位** |

前五个是裸数值，要参与计算得自己加单位（`calc(var(--adaptive-keyboard-height) * 1px)`）；后两个已经带单位，可以直接当 `vh` / `vw` 的替代品用。

## 典型用法

真·全屏高度，不受地址栏影响：

```css
.screen {
  min-block-size: calc(var(--adaptive-vh, 1vh) * 100);
}
```

回退值 `1vh` 很重要——运行时没加载、或者在 SSR 首屏时，样式依然成立。

底部操作栏避开软键盘：

```css
.action-bar {
  position: fixed;
  inset-block-end: calc(var(--adaptive-keyboard-height, 0) * 1px);
}
```

## 选项

```ts
observeAdaptiveViewport({
  prefix: 'adaptive',        // 变量前缀，写不写开头的 -- 都行
  target: document.documentElement,
  window: globalThis.window, // 多窗口 / 测试时注入
  document: globalThis.document,
})
```

返回：

```ts
interface AdaptiveViewportObserver {
  update(): AdaptiveViewportSnapshot | null   // 手动触发一次，返回本次读数
  destroy(): void                             // 解绑全部监听
}
```

## SSR

没有 `window` 时构造函数不报错，返回的观察器什么也不做，`update()` 返回 `null`。所以可以无条件在模块顶层调用，不需要包 `if (typeof window !== 'undefined')`。

但服务端渲染的首屏 HTML 里不会有这些变量，因此**每处使用都要写回退值**，否则首帧会拿到空值。

## 开销

更新走 `requestAnimationFrame` 合并，一帧最多写一次；监听全部是 `passive`。不使用时不引入——它是独立入口，不会被主包带进去。
