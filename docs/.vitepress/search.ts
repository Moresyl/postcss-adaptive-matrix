import type { Plugin } from 'vitepress'

/**
 * VitePress 1.6 indexes source paths, before our .zh-CN.md → zh/ rewrite.
 * Both languages therefore live in root, but the Chinese client requests zh.
 * Share that index until VitePress supplies a separate rewritten-locale index.
 */
export function rewrittenLocaleSearch(): Plugin {
  return {
    name: 'adaptive:rewritten-locale-search',
    transform(code, id) {
      if (id !== '/@localSearchIndex') return
      const declaration = 'export default '
      if (!code.startsWith(declaration)) {
        throw new Error('Unexpected VitePress search index module; review locale compatibility.')
      }
      return {
        code: `const indexes = ${code.slice(declaration.length)}
export default { ...indexes, zh: indexes.zh ?? indexes.root };`,
        map: null,
      }
    },
  }
}
