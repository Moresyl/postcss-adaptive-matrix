---
aside: false
outline: false
---

# 在线试验场

[English](./playground.md) · **简体中文**

编译器本身就跑在这个标签页里。没有任何东西被发出去：插件只有一个运行时依赖，链路上没有任何 Node API，所以发布出去的那份源码被直接引进页面，PostCSS 在你的浏览器里运行。右边看到的，就是你的构建会产出的东西。

改左边任意一栏，右边跟着变。配置那一栏是 **JavaScript 表达式**而不是 JSON，所以 `selectorExclude` 里写正则、`designWidth` 写成函数，在这里和在配置文件里是一回事——单独写一个 `appPcPreset({ app: 375, pc: 1440 })` 也是完整答案。

<ClientOnly>
  <Playground />
</ClientOnly>

## 怎么读这份输出

`clamp(min, fluid, max)` 是三个各有分工的数。中间那个是设计值按画布宽度换算出来的比例——375 画布上的 24px 就是 `6.4vw`。外面两个是同一个比例分别在画布的 `fluid.minWidth` 和 `fluid.maxWidth` 上取值，正是它们让 4K 屏不会得到 90px 的正文。

文字是刻意区别对待的。它编译成 `rem + vw` 而不是纯 `vw`：只用视口单位表达的字号会无视读者自己的字号设置，也不再响应浏览器缩放——这是 WCAG 1.4.4 的失败项。`fontFluidity` 就是两半之间的比例，设成 `0` 文字就是纯 `rem`，布局流体、字号固定。

`1px` 的边框仍然是 `1px`。发丝线是渲染决策而不是测量值，缩放它只会得到模糊的半像素边缘——`hairline` 这个选项存在的意义就是拦住这件事。

## 接着看哪里

- [快速上手](./getting-started.zh-CN.md)——把上面这套放进真实工程
- [配置参考](./configuration.zh-CN.md)——上面那栏里的每一个选项
- [架构与转换公式](./architecture.zh-CN.md)——每个数字是怎么来的
