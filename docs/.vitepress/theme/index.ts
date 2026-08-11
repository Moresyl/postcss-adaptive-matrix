/**
 * The default theme, plus one addition.
 *
 * `CopyPage` sits above the outline on every documentation page and hands the
 * page over in the form a model can actually read. Nothing else is overridden:
 * the default theme is the reason this site was worth building at all, and a
 * fork of it is a maintenance bill with no reader on the other end of it.
 */
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import CopyPage from './CopyPage.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'aside-outline-before': () => h(CopyPage) }),
} satisfies Theme
