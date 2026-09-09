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

## 结果归属

每次编译都有独立的 AST、警告、兼容性报告和门禁结果。修改这些返回的集合不会重新配置编译器，也不会改变后续结果。但 `css`、`map`、诊断和门禁描述的是返回时的编译状态，不是 `result.root` 的实时视图。下游转换修改 AST 后，应通过 PostCSS 重新序列化并生成源码映射，再对修改后的输出重新运行所需审计或门禁。仅修改 AST 不会自动刷新 `output.css` 或之前的判定。

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

同一个编译器实例会保留转换缓存，但每次调用仍刷新按文件变化的画布与根字号。请求的目标、门禁、源码映射选项、syntax 钩子和对象形式的 stringifier 钩子会在异步处理前保存快照。保存的是函数引用，不会冻结回调内部的可变状态；上游映射对象也不会被深拷贝。

请把编译器配置视为该实例生命周期内固定的设置。创建时会保存 profile（包括流体边界和 query 对象）、媒体路由边界及根样式注入过滤数组。开发服务器加载新配置时，应创建新的编译器供后续请求使用；已经开始的调用继续使用旧实例。不要通过修改共享配置对象来重新配置运行中的编译器。

解析回调会保留函数本身，不会在创建时求值一次后固定。`designWidth` 或 `rootValue` 回调仍可按文件或重新构建返回不同标尺。回调闭包中的状态由调用方管理，并发请求重叠时也不例外。

## 门禁与映射

分析会规范化 PostCSS AST 提供的完整转义 at-rule 名称，包括媒体条件和属性注册。这不会修复默认解析器已将名称拆入参数的源文本；支持范围取决于上游解析器或插件提供的 AST。

兼容性门禁必须传入 `targets`，不支持的特性或未知浏览器名都会失败。门禁失败仍会返回 CSS 和诊断，由调用方决定是否设置退出码。PostCSS 内联映射嵌入 CSS，因此 `map` 为 `undefined`；外部映射返回 map 对象。`process.map.prev` 可串接上游映射。

此 API 门禁覆盖警告和兼容性，不包含 CLI 的断点接缝分析；若接缝问题也属于构建策略，请使用 [CLI JSON 报告](./cli.zh-CN.md#机器可读报告)。

分析器检查数学表达式和裸视口单位值，包括未设置 fluid 边界的画布输出。这是语法启发式判断，不是编译来源证明：手写流式表达式也可能产生诊断；纯固定像素之间的变化仍不报告。

诊断长度求值对嵌套表达式及一元操作设有 128 层递归下降预算，超出后返回未知，避免 JavaScript 调用栈溢出。这限制的是分析而非 CSS 编译；没有诊断不代表此类值已获验证。

连续性分析在每个已知断点上下各 0.05 CSS 像素处采样，以容纳常见的 0.02px 间隙。这不是精确的极限计算：更窄的中间区间可能被采样跨过。分析结果是需要调查的诊断证据，不是所有视口宽度都连续的证明。

也可以在进程内把导出的分析器与编译结果组合使用。转换和分析必须使用相同的根字号（默认值为 16）。动态根字号应按文件求值一次，再把数值传给两者，不要重复调用可能变化的回调。

```ts
import { compileAdaptiveCss, findContinuityIssues } from 'postcss-adaptive-matrix'

const rootValue = 20
const output = await compileAdaptiveCss(source, { rootValue })
const seams = findContinuityIssues(output.result.root, rootValue)
const accepted = output.gate?.passed !== false && seams.length === 0
```

分析器接受 `Root` 或 PostCSS `Document`。Document 内各份样式表独立分析，再按 Root 顺序汇总；规则和自定义属性不会跨 Root 混用。如果需要把结果对应到具体文件，或为不同文件使用不同根字号，请逐个 Root 调用。

这是一项静态检查，用于发现可计算的视口断点处长度反向缩小，不是布局或视觉测试。无法解析的值和条件会被跳过；报告为空不能证明所有响应式布局都正确。根字号可省略，默认值为 16；显式传入时必须是正有限数，否则分析器抛出 `RangeError`。

包内包含 ESM 与 CommonJS 类型声明。可直接导入 `AdaptiveCompileOptions`、`AdaptiveCompileResult`、`AdaptiveCompileGate` 和 `AdaptiveCompileGateCategory`，无需重复声明结果契约。

### 纯服务端 TypeScript 项目

主入口 `postcss-adaptive-matrix` 支持 NodeNext 模块解析及 `lib: ["ES2022"]`，无需 DOM 类型库。消费者测试覆盖开启 `exactOptionalPropertyTypes` 的 ESM 和 CommonJS。独立入口 `postcss-adaptive-matrix/runtime` 描述 `Window`、`HTMLElement` 等浏览器对象，使用它的浏览器项目需要 DOM 类型。仅在 Node 服务中编译 CSS 时，不必导入该辅助入口。

## 异常与恢复

连续性诊断的 token 替换按每次解析设限：最多 4,096 次替换调用、累计 1,048,576 个输入 UTF-16 码元及 65,536 个输出码元。超限返回未知并跳过该比较；下一次解析重新计数。这些是诊断限制，不是 CSS 编译限制或进程内存保证。

CSS 语法错误、非法请求或配置回调抛错会拒绝编译 Promise；诊断门禁失败则不会。因此，在构建接收输出之前，应检查 `output.gate?.passed === false`。警告和 PostCSS 结果归属各次调用，同一个编译器中的失败请求或警告不会污染后续请求。即使回调曾经抛错，下一次编译也会重新读取动态画布与根字号。

```ts
const compile = createAdaptiveCompiler()
try {
  const output = await compile('.card { padding: 24px }', { failOn: 'warnings' })
  if (output.gate?.passed === false) {
    console.error('CSS 质量门禁未通过', output.warnings.map((warning) => warning.text))
  } else {
    console.log(output.css)
  }
} catch (error) {
  console.error('CSS 编译失败', error instanceof Error ? error.message : '未知错误')
}
```

在服务端使用时，详细诊断应保留在可信日志中：源码路径和原始 CSS 可能含敏感信息。向不可信客户端返回适当的公开错误，不要直接暴露原始异常。
