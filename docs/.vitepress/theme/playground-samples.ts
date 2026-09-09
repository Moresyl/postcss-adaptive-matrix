interface Sample {
  label: string
  labelZh: string
  css: string
  options: string
}

export const SAMPLES: Sample[] = [
  {
    label: 'Zero configuration',
    labelZh: '零配置',
    css: `.card { padding: 24px; font-size: 16px; border: 1px solid #ddd; }`,
    options: `{}`,
  },
  {
    label: 'Only a maximum',
    labelZh: '只设上限',
    css: `.card { padding: 24px; font-size: 16px; }`,
    options: `{
  profiles: { app: { designWidth: 375, fluid: { maxWidth: 600 } } },
}`,
  },
  {
    label: 'Container sizing',
    labelZh: '容器内缩放',
    css: `.container { container-type: inline-size; }
.card { padding: 24px; font-size: 16px; }`,
    options: `{
  profiles: { card: { designWidth: 375, unit: 'cqi' } },
}`,
  },
  {
    label: 'One canvas',
    labelZh: '单画布',
    css: `.card {
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #eee;
  font-size: 16px;
}`,
    options: `{
  profiles: {
    app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } },
  },
  defaultProfile: 'app',
}`,
  },
  {
    label: 'App + desktop',
    labelZh: '移动端 + 桌面端',
    css: `.hero {
  padding: 24px;
  font-size: 16px;
}

/* Compiled against the desktop canvas, because the band starts at 768. */
@media (min-width: 768px) {
  .hero {
    padding: 48px;
    font-size: 20px;
  }
}`,
    options: `appPcPreset({ appDesignWidth: 375, pcDesignWidth: 1440, breakpoint: 768 })`,
  },
  {
    label: 'Static text',
    labelZh: '文字不流体',
    css: `/* fontFluidity: 0 makes text root-relative; spacing stays fluid. */
.title {
  font-size: 32px;
  line-height: 44px;
  margin-bottom: 16px;
}`,
    options: `{
  profiles: { app: 375 },
  fontFluidity: 0,
}`,
  },
  {
    label: 'Old WebView',
    labelZh: '旧 WebView',
    css: `/* strategy: 'viewport' emits a bare vw instead of clamp(), for engines
   that never got clamp(); preserveOriginal leaves the px in front of it as
   the fallback those engines will use. */
.banner {
  height: 200px;
  padding: 16px;
}`,
    options: `{
  profiles: {
    app: {
      designWidth: 375,
      fluid: { minWidth: 320, maxWidth: 480 },
      strategy: 'viewport',
    },
  },
  defaultProfile: 'app',
  preserveOriginal: true,
}`,
  },
  {
    label: 'A warning worth having',
    labelZh: '一条值得看的告警',
    css: `/* This rule is only live from 1024px up, and the canvas stops scaling
   at 480px — so every clamp() below is pinned to its maximum across the
   whole range the rule applies at. The values are constants, and the
   compiler says so rather than letting it look like it worked. */
@media (min-width: 1024px) {
  .sidebar {
    width: 320px;
    padding: 24px;
  }
}`,
    options: `{
  profiles: {
    app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } },
  },
  defaultProfile: 'app',
}`,
  },
  {
    label: 'Leave some pixels alone',
    labelZh: '保留部分像素',
    css: `.panel {
  /* hairline: 1px borders are never converted. */
  border: 1px solid #ddd;
  padding: 20px;
  /* Excluded by propList below. */
  box-shadow: 0 2px 8px rgb(0 0 0 / 12%);
}

.no-touch {
  width: 100px;
}`,
    options: `{
  profiles: {
    app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } },
  },
  defaultProfile: 'app',
  propList: ['*', '!box-shadow'],
  selectorExclude: [/^\\.no-touch$/],
}`,
  },
]
