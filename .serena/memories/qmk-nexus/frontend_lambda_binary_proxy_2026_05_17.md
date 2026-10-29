# Frontend Lambda API proxy binary download fix

Issue: downloads through `https://qmknexus.tebay.dev/api/...` could corrupt ZIP files even when direct backend `https://qmknexus-back.tebay.dev/api/...` was valid. Reproduced with silakka54 QMK source ZIP: backend returned valid 2310-byte zip; frontend proxy returned 3929-byte corrupt zip.

Cause: `docker/frontend/lambda-handler.mjs` proxied API responses with `await backendResponse.text()` and returned `isBase64Encoded: false`, forcing binary bytes through UTF-8 text decoding/re-encoding.

Fix: proxy now reads `arrayBuffer()`, base64-encodes non-text content types (e.g. `application/zip`), preserves text responses as UTF-8, and forwards `Content-Disposition`.

Regression test added: `docker/frontend/lambda-handler.test.mjs` verifies binary bytes survive and JSON remains text. Verification: `node --check docker/frontend/lambda-handler.mjs`, `node --test docker/frontend/lambda-handler.test.mjs`, `git diff --check` passed.