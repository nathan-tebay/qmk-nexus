export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function triggerTextDownload(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  triggerBlobDownload(new Blob([content], { type }), filename)
}
