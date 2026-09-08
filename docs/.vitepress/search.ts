import type { Plugin } from 'vitepress'
import { createRequire } from 'node:module'
import type MiniSearchType from 'minisearch'

const require = createRequire(import.meta.url)
const vitepressRequire = createRequire(require.resolve('vitepress/package.json'))
const MiniSearch = vitepressRequire('minisearch') as typeof MiniSearchType
const localeModule = 'virtual:adaptive-search-'

/** Keep VitePress's section IDs and stored titles, removing the other locale. */
export async function localeSearchIndex(json: string, locale: 'root' | 'zh', base: string) {
  const index = MiniSearch.loadJSON(json, {
    fields: ['title', 'titles', 'text'],
    storeFields: ['title', 'titles'],
    autoVacuum: false,
  })
  const serialized = JSON.parse(json) as { documentIds: Record<string, string> }
  const ids = Object.values(serialized.documentIds)
  for (const id of ids) {
    if (id.startsWith(`${base}zh/`) !== (locale === 'zh')) index.discard(id)
  }
  await index.vacuum({ batchSize: 1000, batchWait: 0 })
  return JSON.stringify(index)
}

/**
 * VitePress 1.6 indexes source paths, before our .zh-CN.md → zh/ rewrite.
 * Both languages therefore live in root, but the Chinese client requests zh.
 * Split production indexes by rewritten URL; dev keeps VitePress's live shared
 * index so its native HMR invalidation remains intact.
 */
export function rewrittenLocaleSearch(): Plugin {
  let build = false
  let base = '/'
  return {
    name: 'adaptive:rewritten-locale-search',
    configResolved(config) {
      build = config.command === 'build'
      base = config.base
    },
    resolveId(id) {
      if (id === `${localeModule}root` || id === `${localeModule}zh`) return `\0${id}`
    },
    async load(id) {
      if (!id.startsWith(`\0${localeModule}`)) return
      const source = await this.load({ id: '/@localSearchIndexroot' })
      if (!source.code?.startsWith('export default ')) {
        throw new Error('Unexpected VitePress search data module; review locale compatibility.')
      }
      const json = JSON.parse(source.code.slice('export default '.length)) as string
      const locale = id.slice(`\0${localeModule}`.length) as 'root' | 'zh'
      return `export default ${JSON.stringify(await localeSearchIndex(json, locale, base))}`
    },
    transform(code, id) {
      if (id !== '/@localSearchIndex') return
      const declaration = 'export default '
      if (!code.startsWith(declaration)) {
        throw new Error('Unexpected VitePress search index module; review locale compatibility.')
      }
      return {
        code: `const indexes = ${build ? code.slice(declaration.length).replaceAll("import('@localSearchIndexroot')", `import('${localeModule}root')`) : code.slice(declaration.length)}
if (typeof (indexes.zh ?? indexes.root) !== 'function') {
  throw new Error('VitePress search has no Chinese or root index loader; review locale compatibility.');
}
export default { ...indexes, zh: indexes.zh ?? ${build ? `(() => import('${localeModule}zh'))` : 'indexes.root'} };`,
        map: null,
      }
    },
  }
}
