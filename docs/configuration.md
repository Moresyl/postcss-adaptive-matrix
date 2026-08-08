# 配置参考

## 顶层配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `profiles` | App/PC 预设 | 多设计画布映射 |
| `defaultProfile` | `app` | 普通 CSS 使用的画布 |
| `atRuleName` | `adaptive` | 自定义 At-rule 名称 |
| `strategy` | `clamp` | `clamp` 或兼容型 `viewport` |
| `unit` | `vw` | `vw`、`vi`、`cqw`、`cqi` |
| `precision` | `5` | 0~12 位小数 |
| `unitToConvert` | `px` | 输入单位 |
| `minPixelValue` | `0` | 小于该绝对值不转换 |
| `hairline` | `1` | 不转换的细线阈值 |
| `fontFluidity` | `0.35` | 文字流体比例，0~1 |
| `textProperties` | 字体相关属性 | 使用可缩放混合公式的属性 |
| `propList` | `['*']` | 支持 `*` 与 `!` 的属性表 |
| `selectorExclude` | `[]` | 字符串包含或正则排除 |
| `valueExclude` | `[]` | 属性值排除 |
| `include` / `exclude` | 无 | 文件字符串、正则、函数或数组 |
| `transformCustomProperties` | `false` | 是否转换 `--token` 值 |
| `preserveOriginal` | `false` | 是否保留原声明作为前置回退 |
| `root` | `false` | 可选根布局基础样式 |
| `unknownProfile` | `warn` | `warn`、`error`、`ignore` |

`propList` 示例：

```js
propList: ['*', '!border*', '!box-shadow']
```

## Profile

```ts
interface AdaptiveProfile {
  designWidth: number | ((context: { file: string; profile: string }) => number)
  fluid: { minWidth: number; maxWidth: number }
  query?: string | {
    type?: 'media' | 'container'
    condition: string
    name?: string
  } | false
  unit?: 'vw' | 'vi' | 'cqw' | 'cqi'
  strategy?: 'clamp' | 'viewport'
  fontFluidity?: number
  rootMaxWidth?: number
}
```

`query: false` 会移除 `@adaptive` 外壳但保留内部规则，适合构建不同产物时由环境选择 profile。

## RootFoundationOptions

```ts
interface RootFoundationOptions {
  selector: string
  center?: boolean
  container?: boolean
  containerName?: string
  safeAreaVariables?: boolean
  layer?: string | false
}
```

默认不注入全局样式。只有显式配置 `root` 或在 `appPcPreset` 传 `rootSelector` 才启用。

## 旧 WebView 模式

```js
adaptiveMatrix({
  ...appPcPreset(),
  strategy: 'viewport',
  preserveOriginal: true,
})
```

这会输出原始 `px` 后再输出 `vw`。是否使用该方案应由真实目标浏览器决定；现代项目优先使用默认 `clamp`。
