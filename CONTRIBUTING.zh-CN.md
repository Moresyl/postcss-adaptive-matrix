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

## 文档构建

`npm run docs:typecheck` 对 Vue 脚本和模板进行严格模板类型检查，也会随 `npm run typecheck` 执行。回归夹具验证非法模板表达式确实被拒绝。这不包含 Vue 专项 ESLint 规则。

`npm run docs:build` 会构建站点，并离线检查生成的本地搜索索引：双语 API 查询、语言加载回退，以及每个索引页面和章节锚点。同时遍历静态 JavaScript 导入、再导出和 HTML 模块预加载，确保搜索与试验场代码不进入页面立即加载的依赖链。这些是构建检查，不等同于浏览器交互、网络耗时测量或视觉验收。默认部署前缀为 `/postcss-adaptive-matrix/`；部署到域名根路径时，在构建前设置 `DOCS_BASE=/`。修改前缀后需要重新构建，不要直接修改生成的 HTML。构建与自动检查需使用同一环境变量。

## 性能测量

吞吐语料是模拟组件库、工具类框架和应用结构的合成 CSS，不是下载的样式包，也不是浏览器渲染基准。运行 `npm run bench:check -- --cache-churn` 可额外测试 4000 个不同的自定义属性，并明确启用自定义属性转换。计时前会验证实际构建产物：关闭组件库和启用全部内置库时，每个声明值都必须改变，属性名和声明数保持不变，且没有警告。预检不计入耗时；独立测试另行检查数值与幂等性。这不代表任意 CSS 均正确，也不能覆盖所有监听构建负载。

先运行 `npm run build`，再运行 `npm run bench:check`，测量实际发布产物，并以真实 PostCSS 解析与输出作为基线。报告默认预热 5 轮，再取 20 轮计时的中位数。可选环境变量 `BENCH_ITERATIONS`、`BENCH_WARMUP` 分别覆盖次数：计时轮数必须为正安全整数，预热轮数为非负安全整数；非法值直接报错，不生成空样本或误导性报告。预热设为零可用于调查，但不能与默认预热结果直接比较。

对比时记录 Node 版本、机器、配置与语料。相对预算通过只是回归检查，不代表已证明比其他编译器更强。

使用 `npm run bench:api` 可额外比较可复用编程接口，以及启用 Safari 14 / Chrome 90 兼容性审计后的耗时。新增测量沿用相同文件、预热和中位数设置，目前只用于观察，尚未设定 CI 预算。差值为负可能来自测量噪声。

主吞吐测量每轮轮换基线、编译器、组件库候选的执行顺序，减少先后顺序偏差。API 对比另行轮换插件、API、带审计 API，其中的插件中位数独立于主表测量。轮换无法消除系统负载、垃圾回收或温度带来的噪声；异常结果应重复测量后再归因于编译器。性能预算保持不变；不能把之前顺序采样的结果当作受控的优化前后对比。

运行 `npm run verify:libraries -- vant nutui` 可检查指定组件库的已发布样式。报告包含包版本和缓存来源。已有 `.libcheck` 包会被复用；`CLEAN=1` 在运行结束后才清理临时目录，并非开始前，因此不会刷新本次输入。这是可选的联网检查，未知名称、样式缺失或不可读、CSS 解析失败、缺少前缀、路由错误、编译器警告、非幂等输出或接缝结果会返回非零退出码。没有样式表的仅运行时样式库会标记为跳过，而不是静态验证通过。该检查不能认证设计宽度或浏览器渲染。

## Pull Request

组件库接缝详情包含选择器、属性、断点及采样值。`pre-existing` 表示完整诊断与原始样式表的分析结果一致；`new/changed` 表示不一致。两种标签都不证明设计意图或因果关系，且都会使接缝门禁失败。

单独对比兼容性检测器可运行 `npx tsx bench/compat-compare.ts <commit-sha>`。只传入可信仓库提交：工具会在内存中打包并执行该版本检测器，依赖使用当前工作区版本。它先校验合成语料的输出一致，再交替计时新旧实现；不会切换提交，也不是完整历史包或整个构建流程的速度对比。

PR 应保持聚焦，并说明：问题、方案、兼容性影响、验证方式。默认转换公式、输出顺序、公开类型和最低 Node/PostCSS 版本属于兼容性契约。

提交消息建议采用 Conventional Commits，例如：

```text
feat: add foldable profile preset
fix: preserve signed fractional hairlines
docs: clarify container ownership
```

提交贡献即表示你同意按本项目 MIT License 发布你的贡献。
