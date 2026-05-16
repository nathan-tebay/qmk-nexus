const BASE = '/api'
let refreshPromise: Promise<boolean> | null = null

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).then((res) => res.ok)
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

async function fetchWithRefresh(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const shouldUseJsonContentType =
    init.body !== undefined &&
    !(init.body instanceof FormData) &&
    !(init.body instanceof Blob) &&
    !(init.body instanceof URLSearchParams)
  const headers = init.headers
    ? { ...(shouldUseJsonContentType ? { 'Content-Type': 'application/json' } : {}), ...init.headers }
    : shouldUseJsonContentType
      ? { 'Content-Type': 'application/json' }
      : undefined

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })

  if (res.status === 401 && retry) {
    if (await refreshSession()) {
      return fetchWithRefresh(path, init, false)
    }
    // Refresh failed — clear local user state
    const { useAuthStore } = await import('@/store/auth')
    useAuthStore.getState().logout()
    throw new Error('Session expired')
  }

  return res
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithRefresh(path, init)

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Request failed')
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData) =>
    request<T>(path, { method: 'POST', body }),
  postBlob: async (path: string, body: unknown) => {
    const res = await fetchWithRefresh(path, { method: 'POST', body: JSON.stringify(body) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(Array.isArray(err.detail) ? err.detail.join(' ') : err.detail ?? 'Download failed')
    }
    return res.blob()
  },
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  blob: async (path: string) => {
    const res = await fetchWithRefresh(path)
    if (!res.ok) throw new Error('Download failed')
    return res.blob()
  },
}
