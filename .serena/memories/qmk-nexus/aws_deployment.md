# AWS Deployment Architecture

Use S3 for QMK keyboard index storage in production:
- `qmk/index.json` — 696KB search index, loaded once into Lambda memory on cold start
- `qmk/keyboards/<path>.json` — per-keyboard data files, fetched on demand via single S3 GetObject on import

**Why:** Full-text search filters in-memory from the small index; import is O(1) by S3 key. DynamoDB rejected: no native full-text search, 400KB item size limit is a risk, and the data is inherently file-like. Consistent with existing per-user SQLite on S3 pattern.

**How to apply:** When setting up AWS infra, provision one S3 bucket (`qmk-nexus`), upload `backend/data/qmk_index.json` to `qmk/index.json` and all `backend/data/keyboards/**` to `qmk/keyboards/`. Update `s3.py` to add QMK index read helpers alongside existing SQLite helpers.
