# PersonalSite — Analytics Tracking

## Tracking endpoint
`/cgi-bin/infiniteImprobablity.cgi` — the page view beacon endpoint.

**Why the name:** Ad blockers (uBlock Origin, EasyPrivacy, Firefox ETP) silently block any URL containing `track`, `beacon`, `analytics`, `collect`, or `pixel`. The deliberately obscure name avoids all common filter list patterns. Do NOT rename it back to anything recognisable.

## Flow
- `assets/layout.js` fires `navigator.sendBeacon("/cgi-bin/infiniteImprobablity.cgi", ...)` on every page load (skips admin page)
- Sends `page` (window.location.pathname) and `ref` (document.referrer) as URL-encoded POST body
- CGI script logs to JSONL files: `analytics/YYYY-MM.jsonl` in S3 (prod) or `/tmp/analytics/` (local)

## Read endpoint
`/cgi-bin/analytics.cgi` — admin-only, returns last 2000 visits as JSON array covering current + previous month.

## Known fix applied (2026-05-08)
`analytics.cgi` was reading from stale `/tmp/analytics/` cache on Lambda — Lambda containers don't share `/tmp`, so the cache was always behind S3. Fixed: analytics.cgi now always fetches directly from S3 in prod mode, never uses the local container cache.
