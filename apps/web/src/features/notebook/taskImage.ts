const storedImage = /^\/api\/notebook\/cover-images\/[a-f0-9]{64}\.webp$/
/** Accept stored notebook assets and complete public HTTPS image links. */
export function taskImageSource(value: string, origin?: string): string {
  const source = value.trim()
  if (storedImage.test(source)) return source
  try {
    const url = new URL(source)
    if (url.username || url.password) throw new Error()
    if (origin && url.origin === origin && storedImage.test(url.pathname) && !url.search && !url.hash) return url.pathname
    if (url.protocol === 'https:' && url.hostname && url.href.length <= 2000) return url.href
  } catch { /* Show the same actionable message for malformed and unsupported links. */ }
  throw new Error('Use a complete HTTPS image link, or upload an image.')
}
/** Verify that a link actually displays an image before replacing the current one. */
export function loadTaskImage(source: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const picture = new Image()
    const cleanup = () => { picture.onload = null; picture.onerror = null; signal.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); picture.src = ''; reject(signal.reason || new DOMException('Image loading cancelled.', 'AbortError')) }
    if (signal.aborted) { abort(); return }
    picture.referrerPolicy = 'no-referrer'
    picture.onload = () => { cleanup(); resolve() }
    picture.onerror = () => { cleanup(); reject(new Error('This link could not load an image. Use a direct image link or upload the file.')) }
    signal.addEventListener('abort', abort, { once: true })
    picture.src = source
  })
}
