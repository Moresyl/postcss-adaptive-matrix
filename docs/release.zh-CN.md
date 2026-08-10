# 发布与兼容性

[English](./release.md) · **简体中文**

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

编译器运行在 Node.js，浏览器只接收 CSS。默认输出依赖 `clamp()`；容器 profile 额外依赖容器查询单位。不建议为了理论上的旧环境牺牲所有用户的现代能力。

「真实目标浏览器读不读得懂这份产物」不必靠估：

```bash
npx adaptive-matrix src/app.css -c adaptive.config.mjs --targets "ios_saf 13, chrome 90"
```

产物里每一处超出目标的语法都会被列出来，连同不支持时丢掉的东西和关掉它的开关。完整的特性 × 版本表见[浏览器特性支持与降级](./compatibility.zh-CN.md)。

## 版本策略

- patch：修复转换、类型或文档，不改变默认输出语义；
- minor：新增可选 profile、策略、运行时变量；
- major：默认公式、指令、输出顺序或最低运行环境变化。
