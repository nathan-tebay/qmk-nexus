# PersonalSite — Analytics Tracking External Note

This memory lives under the `qmk-nexus` Serena project and is only a cross-project note. For PersonalSite work, activate Serena project `PersonalSite` and read current memories there.

## Current known analytics behavior
- Beacon endpoint: `/cgi-bin/infiniteImprobablity.cgi`.
- Keep obscure endpoint name; common analytics/tracking words can be blocked by ad/privacy filters.
- `assets/layout.js` sends page/ref data and, for `blog-post.html`, includes blog `slug` from `?slug=`.
- Bot/preview/monitor/headless/script user agents and empty UAs are filtered from analytics writes/reads.
- `cgi-bin/analytics.cgi` is admin-only and returns recent visits; prod reads directly from S3 rather than stale Lambda `/tmp` cache.

Do not rename the endpoint or remove bot filtering unless user explicitly asks.