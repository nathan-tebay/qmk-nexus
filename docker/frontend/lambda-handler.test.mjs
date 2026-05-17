import assert from 'node:assert/strict'
import test from 'node:test'

process.env.API_BASE_URL = 'https://backend.test'
const { handler } = await import(`./lambda-handler.mjs?test=${Date.now()}`)

function apiEvent(pathname, method = 'GET', body = undefined) {
  return {
    rawPath: pathname,
    requestContext: { http: { method } },
    headers: { host: 'qmknexus.test' },
    ...(body === undefined ? {} : { body, isBase64Encoded: false }),
  }
}

test('API proxy base64-encodes binary responses without changing bytes', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })

  const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80])
  globalThis.fetch = async () => new Response(zipBytes, {
    status: 200,
    headers: {
      'content-disposition': 'attachment; filename="sources.zip"',
      'content-type': 'application/zip',
    },
  })

  const res = await handler(apiEvent('/api/keyboards/sources/zip', 'POST', '{}'))

  assert.equal(res.statusCode, 200)
  assert.equal(res.isBase64Encoded, true)
  assert.equal(res.headers['content-type'], 'application/zip')
  assert.equal(res.headers['content-disposition'], 'attachment; filename="sources.zip"')
  assert.deepEqual(Buffer.from(res.body, 'base64'), zipBytes)
})

test('API proxy keeps JSON responses as text', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

  const res = await handler(apiEvent('/api/health'))

  assert.equal(res.statusCode, 200)
  assert.equal(res.isBase64Encoded, false)
  assert.equal(res.body, '{"status":"ok"}')
})
