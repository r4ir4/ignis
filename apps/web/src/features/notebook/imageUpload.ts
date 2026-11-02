export async function uploadNotebookImage(file: File, signal: AbortSignal): Promise<string> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.')
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP or GIF image.')
  const response = await fetch('/api/notebook/cover-images', {
    method: 'POST', body: file, headers: { 'Content-Type': file.type },
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'The upload failed. Please try again.')
  if (typeof data.url !== 'string' || !/^\/api\/notebook\/cover-images\/[a-f0-9]{64}\.webp$/.test(data.url)) throw new Error('The server returned an invalid image URL.')
  return data.url
}
