# 发布与兼容性

[English](./release.md) · **简体中文**

## 发布门禁

```bash
npm ci
npm run check
npm run pack:check
npm run smoke:runtime
npm run audit:check
```

`check` 依次执行 ESM/CJS 构建、TypeScript、Lint、格式、文档链接、覆盖率测试和文档生产构建。覆盖率门槛以 `vitest.config.ts` 为准：行 98%、函数 98%、语句 97%、分支 92%。`prepublishOnly` 会依次执行 `check`、包检查、运行时冒烟和依赖审计；上面的命令本身都不会发布版本。

修改转换或路由性能后，构建完成再运行 `npm run bench:check`。`npm run verify:libraries` 是显式附加检查，可能下载包并复用缓存版本，不属于默认发布门禁；请核对报告中的包版本和仅运行时样式的排除项。

## 产物

- `dist/index.js` / `dist/index.cjs`：PostCSS 插件、程序化编译器、诊断 API、预设、类型辅助；
- `dist/runtime.js` / `dist/runtime.cjs`：可选 VisualViewport 观察器；
- `dist/cli.js`：命令行入口；
- 对应的 `.d.ts`（ESM）、`.d.cts`（CommonJS）类型声明和 sourcemap。

## 浏览器策略

编译器运行在 Node.js，浏览器只接收 CSS。默认输出依赖 `clamp()`；容器 profile 额外依赖容器查询单位。不建议为了理论上的旧环境牺牲所有用户的现代能力。

指定浏览器目标后，可审计输出中已跟踪的特性：

```bash
npx adaptive-matrix src/app.css -c adaptive.config.mjs --targets "ios_saf 13, chrome 90"
```

内置特性表中检测到的不受支持特性会被列出，并说明影响和配置替代方案。这不是穷尽的 CSS 校验或渲染测试。已跟踪的特性 × 版本表及限制见[浏览器特性支持与降级](./compatibility.zh-CN.md)。

## 版本策略

- patch：修复转换、类型或文档，不改变默认输出语义；
- minor：新增可选 profile、策略、运行时变量；
- major：默认公式、指令、输出顺序或最低运行环境变化。
