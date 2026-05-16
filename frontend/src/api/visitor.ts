const VISITOR_KEY = 'qmk-nexus-visitor-id'

function randomVisitorId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto?.getRandomValues?.(bytes)
  if (bytes.some(Boolean)) return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY)
    if (existing) return existing
    const created = randomVisitorId()
    localStorage.setItem(VISITOR_KEY, created)
    return created
  } catch {
    return randomVisitorId()
  }
}
