/**
 * Extend the documented layout slots to retain accessible navigation and
 * search while providing a product-specific homepage and Markdown actions.
 */
import DefaultTheme from 'vitepress/theme-without-fonts'
import type { Theme } from 'vitepress'
import { defineAsyncComponent, h } from 'vue'
import CopyPage from './CopyPage.vue'
import CanvasDemo from './CanvasDemo.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'doc-before': () => h(CopyPage),
      'home-hero-after': () => h(CanvasDemo),
    }),
  enhanceApp({ app }) {
    // Async so that the compiler and PostCSS are downloaded by the one page
    // that runs them, rather than by every reader of every page.
    app.component(
      'Playground',
      defineAsyncComponent(() => import('./Playground.vue')),
    )
  },
} satisfies Theme
