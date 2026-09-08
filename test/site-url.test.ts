import { expect, it } from 'vitest'
import { siteUrl } from '../docs/.vitepress/site-url.js'

it('defaults and normalizes public site roots', () => {
  expect(siteUrl()).toBe('https://moresyl.github.io/postcss-adaptive-matrix/')
  expect(siteUrl('https://docs.example.com/project')).toBe('https://docs.example.com/project/')
  expect(siteUrl('https://docs.example.com/project/')).toBe('https://docs.example.com/project/')
  expect(siteUrl('http://localhost:5173')).toBe('http://localhost:5173/')
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
