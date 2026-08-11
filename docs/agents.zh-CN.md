# 面向 AI 的文档

[English](./agents.md) · **简体中文**

接下来读这份文档的，多半不是人。一个被要求把这个插件接进项目的编码 Agent，只会抓一两个 URL，然后拿抓到的东西干活——它不会翻侧边栏，搜索框对它也没有意义。所以同一份文档还会以模型能直接消费的形态再发布一遍，并且和你正在读的页面出自同一份源文件，这正是两者不会各说各话的原因。

下面全部是普通的 `GET`，不需要密钥、不需要会话、不需要执行 JavaScript。

## 入口

| URL | 是什么 |
| --- | --- |
| [`/zh/llms.txt`](https://moresyl.github.io/postcss-adaptive-matrix/zh/llms.txt) | 精选索引：一页一行，外加一句「什么时候该打开它」 |
| [`/zh/llms-full.txt`](https://moresyl.github.io/postcss-adaptive-matrix/zh/llms-full.txt) | 全部页面按阅读顺序拼接，给上下文窗口足够大的模型 |
| [`/llms.txt`](https://moresyl.github.io/postcss-adaptive-matrix/llms.txt) | 同一份索引的英文版 |
| [`/llms-full.txt`](https://moresyl.github.io/postcss-adaptive-matrix/llms-full.txt) | 同一份全文的英文版 |

两者都遵循 [llms.txt](https://llmstxt.org) 约定。先取 `llms.txt`（约 3 KB），再按需要抓那两页就够了；`llms-full.txt` 约 150 KB，只有任务本身是开放式的时候才值得整份读。

## 任何一页，都可以直接拿到 Markdown

每一页都同时以源文件形式提供。在页面路径后面加 `.md`：

```
https://moresyl.github.io/postcss-adaptive-matrix/zh/docs/configuration.md
https://moresyl.github.io/postcss-adaptive-matrix/docs/configuration.md
```

目录首页是 `index.md`——`/zh/docs/` 对应 `/zh/docs/index.md`。这就是仓库里的那个文件本身，而不是把渲染结果反推回文本：没有导航、没有主题、也没有需要剥掉的代码块外壳。

每一页大纲上方的三个按钮用的就是这条路径：**复制为 Markdown**、**查看原始 Markdown**，以及**用 Claude 提问**——它会把这一页连同问题一起带进对话。

## 全部配置项，以数据形式提供

```
https://moresyl.github.io/postcss-adaptive-matrix/schema/options.json
```

一份 [JSON Schema](https://json-schema.org/) draft 2020-12 文档，覆盖每一个配置项：类型、允许值、取值范围、默认值。像「`precision` 是不是整数、上限是多少」这种问题，散文不是合适的载体——这份文档不需要被当成英文读就能回答它。

有三点值得知道：

- **默认值来自编译器本身。** 它们是在生成这份文件时从选项解析器里读出来的，不是抄过来的。代码里的默认值一变，这里在同一个提交里跟着变。
- **属性表按源接口做了类型校验。** 存在却没被描述的配置项会让构建失败，被描述却已经不存在的同样如此。
- **中英文都在同一份文档里。** `description` 是英文，`x-description-zh` 是中文。只有一份文档而不是每种语言一份，因为类型不是翻译。

JSON 写不出 `RegExp`，也写不出判断函数，而有几个配置项恰好接受它们。遇到这种情况，Schema 描述能用 JSON 表达的那一半，剩下的写进 `x-also`：

```json
"selectorExclude": {
  "type": "array",
  "items": { "type": "string", "x-also": "RegExp" }
}
```

## 怎么让 Agent 给出有用的答案

这个插件最核心的前提，恰恰是模型最容易一带而过的那一句，所以值得写进提示词里：**在知道一个 `px` 画在哪份设计稿上之前，它没法被换算。** 一个默认「全局只有一个设计稿宽度」的 Agent，会给出一份能编译、但是错的配置——页面缩放了组件库没有，或者反过来。

两种通常管用的问法：

> 先读 `https://moresyl.github.io/postcss-adaptive-matrix/zh/llms.txt`，再给这个项目做配置。我们的 App 页面画在 375 稿上，后台页面画在 1440 稿上，用了 Vant。

> 抓 `https://moresyl.github.io/postcss-adaptive-matrix/schema/options.json`，拿它核对我的 `postcss.config.js`。凡是取值不等于默认值的配置项，逐条说明它是什么、为什么可能会被这么设。

如果答案需要被验证而不是被相信：[一致性套件](../conformance/README.zh-CN.md)是一组纯数据的输入/输出对，[命令行](./cli.zh-CN.md)可以在不碰构建的前提下编译一份样式表并打印结果。

## 接着看哪里

- [文档索引](./README.zh-CN.md)——页面本身
- [配置参考](./configuration.zh-CN.md)——同一批配置项的散文版
- [在线试验场](./playground.zh-CN.md)——编译器就跑在页面里，可以随手验证一个答案
