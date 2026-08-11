---
layout: home
title: Adaptive Matrix
titleTemplate: 'Multi-canvas responsive CSS for PostCSS 8'

hero:
  name: Adaptive Matrix
  text: One design width per design file
  tagline: A px cannot be converted until you know which design file it was drawn on. Give every design file its own canvas, and pages, mobile components and desktop components all scale correctly at the same time.
  actions:
    - theme: brand
      text: Get started
      link: /docs/getting-started
    - theme: alt
      text: Configuration reference
      link: /docs/configuration
    - theme: alt
      text: GitHub
      link: https://github.com/Moresyl/postcss-adaptive-matrix

features:
  - title: Multi-canvas by design
    details: Pages, a mobile component library and a desktop component library come from three different design files. Each gets its own canvas, and every px is converted against the width of the canvas it belongs to — no choosing between a page that scales and components that do not.
    link: /docs/architecture
    linkText: How the numbers are derived
  - title: Bounded fluid output
    details: The output is clamp(), not a bare vw. Layout keeps scaling between the two widths you name and stops at both ends, so a 4K monitor does not get a 90px body font and a 320px phone does not get a 9px one.
    link: /docs/configuration
    linkText: Every option
  - title: Text stays zoomable
    details: Sizing text in vw alone breaks browser zoom, which is a WCAG 1.4.4 failure. A rem + vw hybrid keeps type fluid and keeps it responsive to the reader's own font size. Set fluidity to zero and it is plain rem.
    link: /docs/compatibility
    linkText: Support and degradation
  - title: Component libraries already handled
    details: The canvases for the component libraries a project actually uses are built in and matched by class-name prefix, custom-property prefix and file path. The default configuration is correct before you configure anything.
    link: /docs/libraries
    linkText: What is built in
  - title: Breakpoints get a canvas too
    details: A rule inside a desktop media query is compiled against the desktop canvas, not the phone one. When a rule's live width range falls outside its canvas, the compiler says so instead of quietly emitting a constant.
    link: /docs/configuration
    linkText: Routing by breakpoint
  - title: Defined by data, not by prose
    details: The behaviour is pinned by a language-agnostic conformance suite — pure JSON plus CSS fixtures, runnable as an acceptance suite by an implementation in any language. Pure TypeScript, one runtime dependency.
    link: /conformance/
    linkText: The conformance suite
  - title: Built for agents as well as people
    details: Every page is fetchable as raw Markdown at its own URL plus .md, and the whole documentation set is indexed at llms.txt and concatenated at llms-full.txt.
    link: /llms.txt
    linkText: llms.txt
  - title: Preview before you commit
    details: The CLI compiles a stylesheet and prints the result, so a configuration change is something you read rather than something you deploy and hope about.
    link: /docs/cli
    linkText: CLI preview
---

**English** · [简体中文](./home.zh-CN.md)
