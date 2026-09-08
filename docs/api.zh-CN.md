# 程序化 API

[English](./api.md) · **简体中文**

当构建工具、编辑器、服务或测试需要把 CSS 作为数据获取，而不是启动命令时使用此 API。只有 CSS 字符串必填；配置、PostCSS 处理选项、浏览器目标和质量门禁均可省略。

## 编译一份样式表

```ts
import { compileAdaptiveCss } from 'postcss-adaptive-matrix'

const output = await compileAdaptiveCss('.card { padding: 24px }')
console.log(output.css)
```

`output` 包含 `css`、`warnings`、`map`、`compatibility`、`gate` 和完整 PostCSS `result`。未传 `targets` 时 `compatibility` 为 `null`；未传 `failOn`（或传 `[]`）时 `gate` 为 `null`。语法和配置错误会拒绝 Promise。

## 复用编译器

```ts
import { createAdaptiveCompiler } from 'postcss-adaptive-matrix'

const compile = createAdaptiveCompiler({ profiles: { app: 375 } })
const output = await compile(source, {
  process: { from: 'src/card.css', to: 'dist/card.css', map: { inline: false } },
  targets: { safari: 14 },
  failOn: ['warnings', 'compatibility'],
})
```

同一个编译器实例会保留转换缓存，但每次调用仍刷新按文件变化的画布与根字号。请求的目标、门禁和源码映射选项会在异步处理前保存快照。

## 门禁与映射

兼容性门禁必须传入 `targets`，不支持的特性或未知浏览器名都会失败。门禁失败仍会返回 CSS 和诊断，由调用方决定是否设置退出码。PostCSS 内联映射嵌入 CSS，因此 `map` 为 `undefined`；外部映射返回 map 对象。`process.map.prev` 可串接上游映射。

此 API 门禁覆盖警告和兼容性，不包含 CLI 的断点接缝分析；若接缝问题也属于构建策略，请使用 [CLI JSON 报告](./cli.zh-CN.md#机器可读报告)。

包内包含 ESM 与 CommonJS 类型声明。可直接导入 `AdaptiveCompileOptions`、`AdaptiveCompileResult`、`AdaptiveCompileGate` 和 `AdaptiveCompileGateCategory`，无需重复声明结果契约。
