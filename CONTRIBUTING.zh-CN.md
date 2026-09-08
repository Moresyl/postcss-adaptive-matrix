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

## Pull Request

PR 应保持聚焦，并说明：问题、方案、兼容性影响、验证方式。默认转换公式、输出顺序、公开类型和最低 Node/PostCSS 版本属于兼容性契约。

提交消息建议采用 Conventional Commits，例如：

```text
feat: add foldable profile preset
fix: preserve signed fractional hairlines
docs: clarify container ownership
```

提交贡献即表示你同意按本项目 MIT License 发布你的贡献。
