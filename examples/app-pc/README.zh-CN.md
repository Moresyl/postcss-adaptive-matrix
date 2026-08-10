# App + PC 示例

[English](./README.md) · **简体中文**

先在仓库根目录构建一次，再用任意 PostCSS runner 处理 `input.css`：

```bash
npm run build
node dist/cli.js examples/app-pc/input.css \
  -c examples/app-pc/adaptive.config.mjs \
  --targets "ios_saf 13, chrome 90"
```

`adaptive.config.mjs` 里放的是配置本身，`postcss.config.mjs` 直接 import 它，所以改用 PostCSS 跑编译出来的是同一份东西。`--targets` 可选，加上之后会在对照表后面输出浏览器支持审计。

这个示例展示：

- App 375 设计稿与 PC 1440 设计稿在同一次构建里共存；
- 刘海屏的安全区变量；
- 细线保留，1px 边框还是 1px；
- 文字写成 `rem + vw`，浏览器缩放仍然够得着；
- 根容器限宽并居中。
