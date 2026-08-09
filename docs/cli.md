# 命令行预览

改一个 `designWidth`、挪一次 `fluid` 区间，要看效果就得重新构建，再去浏览器里肉眼比对。这条命令把这一步缩短成一次回车：

```bash
npx adaptive-matrix src/styles/app.css
```

```
src/styles/app.css
  profiles: app (default), pc, +5 library canvases
  .page
    padding    16px → clamp(13.65333px, 4.26667vw, 20.48px)
    font-size  16px → clamp(0.94867rem, calc(0.65rem + 1.49333vw), 1.098rem)
  @media (min-width: 768px) › .page
    padding    48px → clamp(34.13333px, 3.33333vw, 64px)
  3 converted, 0 left as authored
```

输出的是**逐条声明的前后对照**，不是整份 CSS。构建工具跑出来的产物动辄几千行，而你想确认的通常只有那么几个数字。

## 用法

```
adaptive-matrix <file...> [options]
cat app.css | adaptive-matrix --from src/app.css
```

| 选项 | 作用 |
| --- | --- |
| `-c, --config <path>` | 默认导出插件选项的模块 |
| `--from <path>` | 把输入当作位于这个路径 |
| `--profile <name>` | 覆盖 `defaultProfile` |
| `--all` | 连未改动的声明一起列出 |
| `--css` | 打印编译后的完整 CSS，而不是对照表 |
| `--color` / `--no-color` | 强制开/关颜色；都不写则跟随终端，并遵守 `NO_COLOR` |
| `-h, --help` | 帮助 |

退出码：一切正常为 `0`，参数错误、文件读不到、配置非法为 `1`。所以可以直接串进 shell 判断。

## 读配置

不传 `-c` 就用内置默认值，表头会告诉你当前是哪几个画布。

```bash
npx adaptive-matrix src/app.css -c postcss.config.mjs
```

配置模块要默认导出**插件选项对象**，不是 PostCSS 配置。两者不一样时单独写一个：

```js
// adaptive.config.mjs
import { appPcPreset } from 'postcss-adaptive-matrix'
export default appPcPreset({ appDesignWidth: 375, pcDesignWidth: 1440 })
```

TypeScript 配置需要一个加载器：

```bash
npx tsx node_modules/postcss-adaptive-matrix/dist/cli.js src/app.css -c adaptive.config.ts
```

（Node 22.6+ 自带类型擦除，直接 `npx adaptive-matrix -c adaptive.config.ts` 也能跑，但会打一条 experimental 警告，且只支持可擦除的写法。）

配置在读第一个样式文件之前就会被校验，所以 `defaultProfile` 写错、`fluid` 区间反了，报的是编译器自己的那句话，不会先刷一屏对照表再报错。

## 验证文件路由

按路径判定画布是最容易配错、又最不容易发现的一项——写错了不报错，只是路由静默失效（见[构建工具集成](./integration.md#2-from-必须传)）。`--from` 就是用来在上线前把路由试一遍的：

```bash
# 同一份 CSS，假装它在 desktop 目录下
npx adaptive-matrix scratch.css -c adaptive.config.mjs --from src/desktop/scratch.css
```

两次输出的数字不一样，说明路由命中了。一样，就是没命中。

Vue SFC 的路径带 query 串，照抄进去即可：

```bash
npx adaptive-matrix scratch.css --from 'src/views/mobile/home/index.vue?vue&type=style&lang.scss'
```

## 看整份产物

要接着给别的工具处理，用 `--css`：

```bash
npx adaptive-matrix src/app.css --css > out.css
```

`--css` 模式的 stdout 只有 CSS，警告走 stderr。所以重定向出来的文件是干净的、可直接解析的 CSS，而警告依然会出现在终端里——不会被悄悄吞掉。

## 读懂输出

- `16px → clamp(...)` —— 换算了
- 灰色无箭头的一行 —— 原样保留（`--all` 才显示）。细线、`@font-face` 里的长度、被忽略注释标记的声明都在这里
- `+ ...` —— 编译器新增的声明，比如根容器基础样式、`preserveOriginal` 的降级值
- `@media (min-width: 768px) › .page` —— 声明所在位置由外向内。`@adaptive pc` 编译后就是这个样子，同一个 `.page` 出现两次是正常的
- `warning ...` —— 编译器的告警，原样透传

表头的 `+5 library canvases` 是内置组件库各自的画布。它们由注册表生成，不是你能在 `@adaptive` 里写的名字，所以只报个数。完整清单见[组件库适配](./libraries.md)。
