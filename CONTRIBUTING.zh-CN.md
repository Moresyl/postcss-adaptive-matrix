# 贡献指南

[English](./CONTRIBUTING.md) · **简体中文**

感谢你愿意改进 postcss-adaptive-matrix。

## 开始之前

- Bug 请先搜索已有 Issue，并提供最小 CSS、配置、实际输出和期望输出。
- 新语法或默认行为变化请先开 Discussion/Issue 描述使用场景。
- 安全问题不要创建公开 Issue，请遵循 [SECURITY.md](./SECURITY.zh-CN.md)。

## 本地开发

```bash
git clone https://github.com/Moresyl/postcss-adaptive-matrix.git
cd postcss-adaptive-matrix
npm ci
npm run check
```

代码要求：

- 遵循现有 TypeScript 风格，保持函数职责单一；
- 公共 API 必须补充测试、类型和文档；
- 覆盖正常路径、边界值和错误路径；
- 不在错误中泄露文件内容、环境变量或凭据；
- 提交前运行 `npm run check` 与 `npm run pack:check`。

## 性能测量

先运行 `npm run build`，再运行 `npm run bench:check`，测量实际发布产物，并以真实 PostCSS 解析与输出作为基线。报告默认预热 5 轮，再取 20 轮计时的中位数。可选环境变量 `BENCH_ITERATIONS`、`BENCH_WARMUP` 分别覆盖次数：计时轮数必须为正安全整数，预热轮数为非负安全整数；非法值直接报错，不生成空样本或误导性报告。预热设为零可用于调查，但不能与默认预热结果直接比较。

对比时记录 Node 版本、机器、配置与语料。相对预算通过只是回归检查，不代表已证明比其他编译器更强。

使用 `npm run bench:api` 可额外比较可复用编程接口，以及启用 Safari 14 / Chrome 90 兼容性审计后的耗时。新增测量沿用相同文件、预热和中位数设置，目前只用于观察，尚未设定 CI 预算。差值为负可能来自测量噪声。

运行 `npm run verify:libraries -- vant nutui` 可检查指定组件库的已发布样式。报告包含包版本和缓存来源。已有 `.libcheck` 包会被复用；`CLEAN=1` 在运行结束后才清理临时目录，并非开始前，因此不会刷新本次输入。这是可选的联网检查，未知名称、缺少前缀、路由错误、非幂等输出或接缝结果会返回非零退出码，但不能认证设计宽度或浏览器渲染。

## Pull Request

单独对比兼容性检测器可运行 `npx tsx bench/compat-compare.ts <commit-sha>`。只传入可信仓库提交：工具会在内存中打包并执行该版本检测器，依赖使用当前工作区版本。它先校验合成语料的输出一致，再交替计时新旧实现；不会切换提交，也不是完整历史包或整个构建流程的速度对比。

PR 应保持聚焦，并说明：问题、方案、兼容性影响、验证方式。默认转换公式、输出顺序、公开类型和最低 Node/PostCSS 版本属于兼容性契约。

提交消息建议采用 Conventional Commits，例如：

```text
feat: add foldable profile preset
fix: preserve signed fractional hairlines
docs: clarify container ownership
```

提交贡献即表示你同意按本项目 MIT License 发布你的贡献。
