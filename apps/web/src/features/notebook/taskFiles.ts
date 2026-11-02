const storedAttachment = /^\/api\/notebook\/attachments\/[a-f0-9]{64}\/[A-Za-z0-9_.%-]+$/
export const attachmentLimit = 30
export const attachmentMaxBytes = 8 * 1024 * 1024
export function attachmentName(source: string): string {
  try { const url = new URL(source, 'https://notebook.invalid'); const name = url.pathname.split('/').pop(); return name ? decodeURIComponent(name) : url.hostname }
  catch { return 'File' }
}
export function attachmentSource(input: string, origin?: string): string {
  const source = input.trim()
  if (storedAttachment.test(source)) return source
  try {
    const url = new URL(source)
    if (origin && url.origin === origin && storedAttachment.test(url.pathname) && !url.search && !url.hash) return url.pathname
    if (['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password && source.length <= 2000 && !/[\x00-\x1f\x7f]/.test(source)) return url.href
  } catch { /* Return one actionable validation message. */ }
  throw new Error('Use a complete HTTP or HTTPS file link.')
}
export function attachmentPreview(source: string): string | null {
  if (!/\.(png|jpe?g|webp|gif)$/i.test(attachmentName(source))) return null
  return storedAttachment.test(source) ? `${source}/preview` : source
}
/** Validate a batch before uploading so capacity/size errors do not create partial batches. */
export function attachmentBatchError(files: readonly { name: string; size: number }[], existing: number): string | null {
  if (existing + files.length > attachmentLimit) return `You can attach up to ${attachmentLimit} files. Choose fewer files.`
  const oversized = files.find(file => file.size > attachmentMaxBytes)
  return oversized ? `“${oversized.name}” is larger than 8 MB. Choose a smaller file.` : null
}
