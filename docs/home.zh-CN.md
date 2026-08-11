---
layout: home
title: Adaptive Matrix
titleTemplate: 'PostCSS 8 的多画布响应式方案'

hero:
  name: Adaptive Matrix
  text: 一张设计稿，一个换算基准
  tagline: 一个 px 要先知道自己画在哪张设计稿上，才谈得上换算。给每张稿子一张自己的画布，页面、移动端组件、桌面端组件才能同时缩放正确。
  actions:
    - theme: brand
      text: 快速上手
      link: /zh/docs/getting-started
    - theme: alt
      text: 配置参考
      link: /zh/docs/configuration
    - theme: alt
      text: GitHub
      link: https://github.com/Moresyl/postcss-adaptive-matrix

features:
  - title: 多画布是设计前提，不是附加功能
    details: 页面、移动端组件库、桌面端组件库来自三张不同的稿子。每张稿子一张画布，每个 px 按自己画布的宽度换算——不用在「页面会缩放但组件不动」和「组件被按错的比例拉变形」之间二选一。
    link: /zh/docs/architecture
    linkText: 数字是怎么算出来的
  - title: 有上下界的流体输出
    details: 产物是 clamp()，不是裸的 vw。在你指定的两个宽度之间继续缩放，两端各自停住，所以 4K 屏不会得到 90px 的正文，320px 的手机也不会得到 9px 的。
    link: /zh/docs/configuration
    linkText: 全部选项
  - title: 文字保持可缩放
    details: 只用 vw 定字号会让浏览器缩放失效，这是 WCAG 1.4.4 的失败项。rem + vw 的混合写法让字号既是流体的，又仍然跟随读者自己的字号设置。流体度设为 0 就是纯 rem。
    link: /zh/docs/compatibility
    linkText: 支持情况与降级
  - title: 组件库已经适配好了
    details: 项目里真正会用到的那些组件库，画布已经内置，按类名前缀、自定义属性前缀和文件路径三条通道识别。什么都还没配，默认配置就已经是对的。
    link: /zh/docs/libraries
    linkText: 内置了哪些
  - title: 断点也有自己的画布
    details: 写在桌面端媒体查询里的规则，按桌面画布换算，而不是按手机画布。当一条规则的生效宽度区间整个落在画布之外时，编译器会告诉你，而不是悄悄输出一个常量。
    link: /zh/docs/configuration
    linkText: 按断点路由
  - title: 行为由数据定义，不由散文定义
    details: 行为被一套语言无关的一致性套件钉死——纯 JSON 加 CSS 用例，任何语言的实现都能拿它做验收。纯 TypeScript，只有一个运行时依赖。
    link: /zh/conformance/
    linkText: 一致性套件
  - title: 同时写给人和写给 AI
    details: 每一页都能用「页面地址 + .md」直接取到原始 Markdown；整套文档在 llms.txt 有索引，在 llms-full.txt 有全文。
    link: /llms.txt
    linkText: llms.txt
  - title: 先看输出，再提交
    details: 命令行能编译一份样式表并打印结果，所以改配置这件事是「读一遍」，而不是「发上去再祈祷」。
    link: /zh/docs/cli
    linkText: 命令行预览
---

[English](./home.md) · **简体中文**
