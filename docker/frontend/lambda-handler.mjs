import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
const distRoot = '/var/task/dist'
const backendBaseUrl = process.env.API_BASE_URL || ''

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
}

function response(statusCode, headers, body = '', isBase64Encoded = false, cookies = undefined) {
  return {
    statusCode,
    headers,
    body,
    isBase64Encoded,
    ...(cookies?.length ? { cookies } : {}),
  }
}

function requestPath(event) {
  const rawPath = event.rawPath || event.path || '/'
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`
}

function requestQuery(event) {
  if (event.rawQueryString) return `?${event.rawQueryString}`
  return ''
}

function staticPath(pathname) {
  const decodedPath = decodeURIComponent(pathname)
  const normalized = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
  let candidate = join(distRoot, normalized)

  if (!candidate.startsWith(distRoot)) {
    candidate = join(distRoot, 'index.html')
  } else if (!existsSync(candidate) || statSync(candidate).isDirectory()) {
    candidate = join(distRoot, 'index.html')
  }

  return candidate
}

function cacheControl(filePath) {
  return filePath.endsWith('/index.html')
    ? 'no-cache,no-store,must-revalidate'
    : 'public,max-age=31536000,immutable'
}

async function streamToBase64(stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('base64')
}

async function serveStatic(pathname, method) {
  const filePath = staticPath(pathname)
  const ext = extname(filePath)
  const headers = {
    'cache-control': cacheControl(filePath),
    'content-type': mimeTypes[ext] || 'application/octet-stream',
  }

  if (method === 'HEAD') {
    return response(200, headers)
  }

  const body = await streamToBase64(createReadStream(filePath))
  return response(200, headers, body, true)
}

function proxyHeaders(event) {
  const headers = { ...(event.headers || {}) }
  delete headers.host
  delete headers.connection
  delete headers['content-length']
  return headers
}

async function proxyApi(event, pathname, method) {
  if (!backendBaseUrl) {
    return response(502, { 'content-type': 'application/json' }, JSON.stringify({ detail: 'API_BASE_URL is not configured' }))
  }

  const target = `${backendBaseUrl.replace(/\/$/, '')}${pathname}${requestQuery(event)}`
  const backendResponse = await fetch(target, {
    method,
    headers: proxyHeaders(event),
    body: event.body
      ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body)
      : undefined,
    redirect: 'manual',
  })

  const headers = {}
  for (const key of ['cache-control', 'content-type', 'location']) {
    const value = backendResponse.headers.get(key)
    if (value) headers[key] = value
  }

  const cookies = backendResponse.headers.getSetCookie?.()
    || (backendResponse.headers.get('set-cookie') ? [backendResponse.headers.get('set-cookie')] : [])
  const body = await backendResponse.text()

  return response(backendResponse.status, headers, body, false, cookies)
}

export async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET'
  const pathname = requestPath(event)

  if (pathname.startsWith('/api/')) {
    try {
      return await proxyApi(event, pathname, method)
    } catch (error) {
      console.error('API proxy failed', error)
      return response(502, { 'content-type': 'application/json' }, JSON.stringify({ detail: 'API proxy failed' }))
    }
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return response(405, { allow: 'GET,HEAD' })
  }

  return serveStatic(pathname, method)
}
