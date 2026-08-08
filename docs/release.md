# 发布与兼容性

## 发布门禁

```bash
npm ci
npm run check
npm run pack:check
```

`check` 必须同时通过 TypeScript、覆盖率、测试和 ESM/CJS 构建。覆盖率门禁为行/函数/语句 80%，分支 75%。

## 产物

- `dist/index.js` / `dist/index.cjs`：PostCSS 插件、预设、类型辅助；
- `dist/runtime.js` / `dist/runtime.cjs`：可选 VisualViewport 观察器；
- 对应 `.d.ts` 和 sourcemap。

## 浏览器策略

编译器运行在 Node.js，浏览器只接收 CSS。默认输出依赖 `clamp()`；容器 profile 额外依赖容器查询单位。生产项目应按 Browserslist 和真实 WebView 版本决定是否采用 `strategy: 'viewport'` 或额外降级，不建议为了理论上的旧环境牺牲所有用户的现代能力。

## 版本策略

- patch：修复转换、类型或文档，不改变默认输出语义；
- minor：新增可选 profile、策略、运行时变量；
- major：默认公式、指令、输出顺序或最低运行环境变化。
