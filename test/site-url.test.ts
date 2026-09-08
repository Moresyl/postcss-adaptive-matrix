import { expect, it } from 'vitest'
import { siteUrl } from '../docs/.vitepress/site-url.js'
import { llmsTxt } from '../docs/.vitepress/llms.js'
import { optionsSchema } from '../docs/.vitepress/schema.js'

it('defaults and normalizes public site roots', () => {
  expect(siteUrl()).toBe('https://moresyl.github.io/postcss-adaptive-matrix/')
  expect(siteUrl('https://docs.example.com/project')).toBe('https://docs.example.com/project/')
  expect(siteUrl('https://docs.example.com/project/')).toBe('https://docs.example.com/project/')
  expect(siteUrl('http://localhost:5173')).toBe('http://localhost:5173/')
})

it('keeps generated absolute links rooted at the normalized URL', () => {
  const base = siteUrl('https://docs.example.com/reference')
  expect(llmsTxt(base, false)).toContain('https://docs.example.com/reference/docs/api.md')
  expect(JSON.parse(optionsSchema(base)).$id).toBe(
    'https://docs.example.com/reference/schema/options.json',
  )
})

it.each([
  '',
  '/project/',
  'file:///tmp/site',
  'https://user:secret@example.com',
  'https://example.com/?x=1',
  'https://example.com/#',
  'https://example.com/?',
])('rejects unsuitable site roots without echoing input: %s', (input) => {
  expect(() => siteUrl(input)).toThrow(
    'SITE_URL must be an absolute HTTP(S) URL without credentials, query or fragment.',
  )
})
