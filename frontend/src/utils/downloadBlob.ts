export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()

  // Browser starts the download asynchronously. Revoking immediately after
  // click can invalidate the blob URL before large ZIPs are fully consumed,
  // producing truncated/corrupt archives.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function triggerTextDownload(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  triggerBlobDownload(new Blob([content], { type }), filename)
}
