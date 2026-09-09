/**
 * Extend the documented layout slots to retain accessible navigation and
 * search while providing a product-specific homepage and Markdown actions.
 */
import DefaultTheme from 'vitepress/theme-without-fonts'
import type { Theme } from 'vitepress'
import { defineAsyncComponent, h, onMounted, onUnmounted } from 'vue'
import CopyPage from './CopyPage.vue'
import CanvasDemo from './CanvasDemo.vue'
import './custom.css'

/** VitePress closes local search without restoring focus to its trigger. */
const SearchFocusRestore = {
  setup() {
    let timer: ReturnType<typeof setTimeout> | undefined
    const restore = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !document.querySelector('.VPLocalSearchBox')) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (document.querySelector('.VPLocalSearchBox') || document.activeElement !== document.body)
          return
        document
          .querySelector<HTMLButtonElement>('#local-search button')
          ?.focus({ preventScroll: true })
      }, 0)
    }
    onMounted(() => document.addEventListener('keydown', restore, true))
    onUnmounted(() => {
      clearTimeout(timer)
      document.removeEventListener('keydown', restore, true)
    })
    return () => null
  },
}

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'doc-before': () => h(CopyPage),
      'home-hero-after': () => h(CanvasDemo),
      'layout-top': () => h(SearchFocusRestore),
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
