/** Normalize the optional public site root used by generated absolute links. */
export function siteUrl(input = 'https://moresyl.github.io/postcss-adaptive-matrix/'): string {
  const message = 'SITE_URL must be an absolute HTTP(S) URL without credentials, query or fragment.'
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new TypeError(message)
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    input.includes('?') ||
    input.includes('#')
  )
    throw new TypeError(message)
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.href
}
