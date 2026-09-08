---
aside: false
outline: false
---

# 在线试验场

[English](./playground.md) · **简体中文**

编译器使用与包相同的源码，在独立的浏览器 Worker 中本地运行。试验场本身不会上传 CSS 和配置。配置表达式是可执行的 JavaScript，可以自行发起网络请求，请只运行可信代码。Worker 将编译与页面隔离，但不是安全沙箱。

每次修改稍作停顿后都会启动一次全新的编译。超过 5 秒的任务会终止，离开页面也会清理等待中和运行中的任务。显示的耗时包含配置求值与编译，不包含 Worker 启动，不能作为跨设备性能排名。编译中或出错后，旧结果会变淡显示。

改左边任意一栏，右边跟着变。配置那一栏是 **JavaScript 表达式**而不是 JSON，所以 `selectorExclude` 里写正则、`designWidth` 写成函数，在这里和在配置文件里是一回事——单独写一个 `appPcPreset({ appDesignWidth: 375, pcDesignWidth: 1440 })` 也是完整答案。

<ClientOnly>
  <Playground />
</ClientOnly>

## 怎么读这份输出

配置表达式必须同步返回配置对象（或返回 `undefined` 使用默认值）。试验场不会把 Promise 或函数值当作配置工厂来等待或调用。例如直接写 `appPcPreset()`，不要写 `() => appPcPreset()` 或 `Promise.resolve(appPcPreset())`；配置对象内部的回调函数仍然支持。

Worker 启动失败或超时后，可点击“重新编译”重试，无需修改输入；编译等待期间按钮不可用。首次成功之前发生失败，结果区会显示“尚无成功的编译结果”，不会继续误报正在加载；后续失败仍保留变暗的上一次成功结果。

`fluid.minWidth` 与 `fluid.maxWidth` 均为可选项。双边界输出 `clamp(min, fluid, max)`，单边界输出 `min()` 或 `max()`，不设置边界则保留无界流体表达式。例如 375 画布上的 24px 在应用边界之前对应 `6.4vw`。可以切换“只设上限”和“容器内缩放”示例查看差异。

文字混合使用 rem 与视口单位，让一部分字号跟随读者的根字号设置。`fontFluidity` 控制两者比例，设成 `0` 即为纯 rem。实际页面仍需验证文字放大与布局重排，不能把生成的公式当作满足无障碍标准的证明。

`1px` 的边框仍然是 `1px`。发丝线是渲染决策而不是测量值，缩放它只会得到模糊的半像素边缘——`hairline` 这个选项存在的意义就是拦住这件事。

## 接着看哪里

- [快速上手](./getting-started.zh-CN.md)——把上面这套放进真实工程
- [配置参考](./configuration.zh-CN.md)——上面那栏里的每一个选项
- [架构与转换公式](./architecture.zh-CN.md)——每个数字是怎么来的
