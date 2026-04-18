# qmk-nexus Remediation Plan

Generated from code review 2026-04-17. Addresses 34 findings across backend, frontend, infra, codegen.

## Locked Decisions

| Topic | Choice |
|---|---|
| Field naming | Pydantic `alias_generator=to_camel` + `populate_by_name=True`. Backend owns translation; frontend stays camelCase. |
| Auth delivery | httpOnly cookie. Drop JWT-in-URL. Add OAuth `state` CSRF. |
| Build state | DynamoDB, provisioned 5 WCU / 5 RCU (free tier), TTL 1h. |
| ARM MCUs | Gate AVR-only in UI. ARM build disabled with "coming soon" tooltip. |
| JWT lifetime | 15-min access JWT + 30-day refresh token (httpOnly cookie) + `/auth/refresh`. |
| Tests | Codegen snapshot tests via pytest + golden files. |
| Inline styles | Convert all to CSS Modules this pass. |

---

## Phase A — Critical Bugs (must land first)

### A1. Pydantic camelCase alias (#1)
**Files:** `backend/models.py`
- Add `from pydantic import ConfigDict`, `from pydantic.alias_generators import to_camel`
- On `KeyDef`, `MatrixPin`, `ColPin`, `Layer`, `KeyboardConfig`, `BuildStatus`, `User`, `TokenResponse`:
  ```python
  model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
  ```
- Routers: return `.model_dump(by_alias=True)` — wrap in helper `jsonable_out(m)`.
- Verify round-trip: frontend `KeyboardConfig` POST → save → GET matches.

### A2. `/auth/me` rewrite (#2)
**File:** `backend/routers/auth.py:71`
- Replace broken signature:
  ```python
  @router.get('/me', response_model=User)
  async def me(user: User = Depends(get_current_user)):
      return user
  ```

### A3. Download artifact via fetch + blob (#3)
**Files:** `frontend/src/api/builds.ts`, `frontend/src/stages/build/BuildPanel.tsx`
- Add `buildsApi.download(id)` using `fetch` with Authorization header → `blob()` → `URL.createObjectURL` → synthetic anchor click.
- Remove `window.location.href` in `BuildPanel.tsx:58`.
- After cookie auth (A5) lands, revisit — cookie would auto-send and original code works.

### A4. DynamoDB build state (#4)
**New file:** `backend/dynamo.py`
- Client: `boto3.resource('dynamodb').Table('qmk-nexus-builds')`.
- In dev (`settings.is_prod == False`), fall back to in-memory dict (current behavior) — keeps local dev cheap.
- Schema: `build_id` (PK), `user_id`, `keyboard_id`, `status`, `log`, `artifact_path`, `error`, `created_at`, `ttl` (expire 1h after terminal state).
- Methods: `put_build(status)`, `get_build(id)`, `update_status(id, patch)`.
- **Files:** `backend/routers/builds.py`
  - Replace `_builds: dict` with `dynamo.put_build`, `dynamo.get_build`.
  - On terminal (`success`/`failed`), set TTL.
- **Infra:** add Terraform/CDK stub or manual AWS create instructions in README section.

### A5. httpOnly cookie auth + refresh token (#8, plus Q2 choice)
**Files:** `backend/auth.py`, `backend/routers/auth.py`, `backend/main.py`, `frontend/src/api/client.ts`, `frontend/src/store/auth.ts`, `frontend/src/components/AuthCallback.tsx`
- **Backend:**
  - `create_access_token(user)` — 15 min.
  - `create_refresh_token(user)` — 30 days, random opaque token stored in DynamoDB `qmk-nexus-refresh` keyed by token hash → user_id + exp.
  - OAuth callback: set `Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Lax; Path=/` + refresh cookie. Redirect to `/auth/callback` (no token in URL).
  - `get_current_user` reads cookie instead of (or in addition to) bearer header.
  - `POST /api/auth/refresh` — reads refresh cookie, verifies against DynamoDB, rotates refresh token, issues new access cookie.
  - `POST /api/auth/logout` — clears cookies, deletes refresh token row.
- **Frontend:**
  - `api/client.ts`: add `credentials: 'include'`. Remove Authorization header logic.
  - On 401: call `/api/auth/refresh` once, retry original request, else logout.
  - `store/auth.ts`: drop `token` field. Only store `user`.
  - `AuthCallback.tsx`: remove token reading from URL. Call `/api/auth/me` to hydrate user, then navigate.
  - Backend callback redirect still carries `user_id`, `email`, `name`, `avatar_url` — OR drop all of that and let frontend fetch `/api/auth/me`. Do the latter; cleaner.

### A6. OAuth state + url-encode (#6, #7, #17)
**File:** `backend/routers/auth.py`
- Use `urllib.parse.urlencode(params)` for Google auth URL.
- Generate `state` — random 32-byte urlsafe token, set in `oauth_state` cookie (httpOnly, short TTL). Include in auth URL.
- Callback verifies `state` matches cookie, then clears cookie.
- Optional follow-up: verify `id_token` JWT against Google JWKS instead of `/userinfo`. Defer — `/userinfo` is acceptable.

### A7. LAYOUT macro duplication + undefined LAYOUT_impl (#9)
**Files:** `backend/codegen/keyboard_c.py`, `backend/codegen/keyboard_h.py`
- Move `#define LAYOUT(...)` → header file only.
- Remove `LAYOUT_impl` reference. Header emits full body:
  ```c
  #define LAYOUT({params}) { \
      { {row0} }, \
      { {row1} } \
  }
  ```
- `keyboard.c` no longer defines LAYOUT; includes `keyboard.h`.

### A8. Filter undefined-matrix keys from LAYOUT (#10)
**Files:** `backend/codegen/keyboard_c.py`, `backend/codegen/keyboard_h.py`, `backend/codegen/keymap_c.py`
- All three: replace `_sorted_keys` with `_matrix_keys` → defined-only, sorted by `(row, col)`.
- Undefined keys excluded from LAYOUT param list, matrix init, keymap.
- Add backend validation before `generate_all`: reject config if any key has `row=None or col=None` and return 400 "keys N/M missing matrix assignment".

### A9. Default feature key rename (#5)
**File:** `frontend/src/store/keyboard.ts:64`
- `split: false` → `split_keyboard: false`.
- Add migration: on hydrate from localStorage, if `features.split` exists, rename to `features.split_keyboard` and drop old key.

---

## Phase B — High: Data Integrity & Security

### B1. Per-user S3 write serialization (#11)
**File:** `backend/s3.py`
- Use S3 conditional writes with `If-Match: <etag>`. Store etag in pull, send on push.
- On 412 (precondition failed): retry pull → merge → push, max 3 attempts. If still conflicted, return 409.
- Dev path unaffected.

### B2. Remove `tempfile.mktemp` (#12)
**File:** `backend/s3.py:30`
- Replace with `tempfile.NamedTemporaryFile(suffix='.sqlite', delete=False)`, return `Path(tmp.name)`.

### B3. SQLite context managers (#13)
**File:** `backend/db.py`
- All four functions: replace manual `.connect()`/`.close()` with `with sqlite3.connect(db) as conn:`. Handles commit on success, rollback on exception.

### B4. JWT secret prod guard (#14)
**File:** `backend/config.py`
- Post-init validator:
  ```python
  @model_validator(mode='after')
  def _check_prod_secret(self):
      if self.is_prod and self.jwt_secret == 'dev-secret-change-in-prod':
          raise ValueError('jwt_secret must be set in prod')
      return self
  ```

### B5. Sanitize `KEYBOARD_NAME` (#15)
**File:** `backend/routers/builds.py:33`
- Add `_safe_name(name)` → `re.sub(r'[^a-z0-9_]', '_', name.lower())[:32] or 'keyboard'`.
- Use for env var and internal paths.

### B6. Build rate limit / quota (#16)
**File:** `backend/routers/builds.py`
- Per user: max 1 concurrent build (check DynamoDB for any `status in (queued, building)` rows for user_id).
- Return 429 with `retry_after` if hit.
- Defer global daily quota until abuse seen.

---

## Phase C — Medium: Correctness

### C1. FeatureToggles symmetric incompat (#18)
**File:** `frontend/src/stages/build/modules.ts`
- Auto-derive symmetric set at load:
  ```ts
  const expanded = new Map<string, Set<string>>()
  for (const m of FEATURE_MODULES) {
    for (const dep of m.incompatibleWith) {
      expanded.get(m.id)?.add(dep) ?? expanded.set(m.id, new Set([dep]))
      expanded.get(dep)?.add(m.id) ?? expanded.set(dep, new Set([m.id]))
    }
  }
  ```
- Or hand-fix: add `rgblight` ↔ `rgb_matrix`, `rgb_matrix` ↔ `backlight` both ways.

### C2. Gate ARM MCUs in UI (#19, Q1 choice)
**Files:** `frontend/src/stages/build/MetadataForm.tsx`, `frontend/src/stages/build/BuildPanel.tsx`, new `frontend/src/stages/build/mcus.ts`
- Create `MCU_LIST` with `{ id, label, arch, supported: boolean }`.
- AVR MCUs: `supported=true`. STM32/rp2040: `supported=false`.
- MCU select shows all, labels unsupported with "(coming soon)".
- `BuildPanel`: if `!selectedMcu.supported`, disable Build button + tooltip "ARM build not yet available".
- Backend `builds.py`: also reject unsupported MCU → 400.

### C3. Transformer resize fractional step (#20)
**File:** `frontend/src/stages/layout/SelectionTransformer.tsx:43-44`
- Replace `Math.round(... / UNIT)` with `Math.round(... / (UNIT * 0.25)) * 0.25`.
- Clamp min 0.5.

### C4. Drag snap respects rotation (#21)
**File:** `frontend/src/stages/layout/KeyShape.tsx:21`
- If `keyDef.rotation !== 0`, snap on raw position without pre-transform (or skip snap when rotated). Simpler: skip snap when rotated.

### C5. Crypto id for keys (#22)
**File:** `frontend/src/stages/layout/nanoid.ts`
- Replace body with `return crypto.randomUUID().replace(/-/g, '').slice(0, 10)`.

### C6. Toolbar x-wrap (#23)
**File:** `frontend/src/stages/layout/Toolbar.tsx:27`
- Wrap at x ≥ 15u: next key goes to `x=0`, `y = maxY + 1`. Compute `nextY` too.

### C7. Strip `artifact_path` from client (#24)
**Files:** `backend/models.py`, `backend/routers/builds.py`
- Add `BuildStatus.artifact_path` with `Field(exclude=True)` OR split into internal model.
- Client-facing: only `artifact_available: bool` + download via `/builds/{id}/download`.
- Update frontend `BuildStatus` to match (remove `artifact_path`, add optional `artifact_available`).

### C8. `fitView` button + reactive (#25)
**File:** `frontend/src/stages/layout/KeyCanvas.tsx:72`
- Effect deps: `[config.id]` so it fits when loading a different keyboard.
- Add "Fit" button in Toolbar that calls `fitView` via ref.

### C9. Backend structured logging (#26)
**Files:** `backend/main.py`, `backend/routers/builds.py`, `backend/routers/auth.py`, `backend/routers/keyboards.py`, `backend/s3.py`
- Add `logger = logging.getLogger('qmk-nexus')` at module level.
- Log `logger.exception` on all `except Exception` paths.
- Configure root logger in `main.py` for JSON format (Lambda-friendly).

---

## Phase D — Low: Cleanup

### D1. Backend package layout (#27)
- Move `backend/` to proper package. Run uvicorn with `backend.main:app` from repo root OR add `backend/__init__.py` and relative imports.
- Delete all `sys.path.insert(0, ...)` hacks (5 files in `codegen/`).
- Dockerfile: `CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]`.

### D2. Codegen helper module (#28)
**New file:** `backend/codegen/_matrix.py`
- Extract shared: `matrix_rows(config)`, `matrix_cols(config)`, `matrix_keys(config)` (filtered defined-only sorted).
- Import from `keyboard_c.py`, `keyboard_h.py`, `keymap_c.py`, `config_h.py`.

### D3. CSS modules for inline styles (#29, Q4 choice)
**Files:**
- `frontend/src/stages/build/BuildPanel.module.css` (new) ← `BuildPanel.tsx`
- `frontend/src/stages/build/FeatureToggles.module.css` (new) ← `FeatureToggles.tsx`
- `frontend/src/stages/keymap/KeycodePicker.module.css` (new) ← `KeycodePicker.tsx`
- `frontend/src/components/AuthCallback.module.css` (new) ← `AuthCallback.tsx`
- Migrate all inline `style={{ ... }}` to class names.

### D4. Delete or wire `analysis/` (#30)
- Decision needed: keep for Phase 9 or drop until then.
- Minimum now: add `# noqa: F401` exemption or delete unused imports.

### D5. Single bootloader source (#34)
**Files:** `backend/codegen/config_h.py`, `backend/codegen/rules_mk.py`
- Move `_MCU_BOOTLOADERS` to `backend/codegen/_mcu.py`.
- `rules_mk.py` imports + uses map instead of if/elif chain.

---

## Phase E — Tests (Q3 choice)

### E1. pytest bootstrap
- Add `backend/pytest.ini` with `testpaths = tests`.
- Add `backend/tests/__init__.py`, `backend/tests/conftest.py`.
- `backend/requirements-dev.txt`: `pytest`, `pytest-asyncio`, `httpx` (for TestClient).

### E2. Codegen snapshot tests
**New:** `backend/tests/test_codegen.py`
- Fixtures: `minimal_avr_kb`, `split_rgb_kb`, `rp2040_oled_kb` (KeyboardConfig objects).
- For each × `{keyboard_c, keyboard_h, config_h, rules_mk, keymap_c}` → assert output matches golden file in `backend/tests/goldens/`.
- On first run, capture goldens via `pytest --snapshot-update` flag (manual gate).

### E3. Regression tests for A7, A8
- Explicit test: LAYOUT defined in .h only, not .c.
- Explicit test: key with `row=None` excluded from LAYOUT params.

---

## Execution Order

1. **Phase A** (critical) — single session. Must land together because auth cookie + field aliasing + LAYOUT codegen are all touched by same integration test.
2. **Phase B** (high) — next session.
3. **Phase C** (medium) — can split; UI items (C1-C8) parallel to backend logging (C9).
4. **Phase D** (cleanup) — after A/B/C green.
5. **Phase E** (tests) — add alongside Phase A (codegen snapshots lock in A7/A8), backfill rest after.

## Verification Checklist

Per phase:
- [ ] `npm run typecheck && npm run lint` green.
- [ ] `pytest` green (after E1).
- [ ] Manual: Google login → keyboard create → save → reload → load → modify → save → trigger build → poll → download.
- [ ] Manual: split + rgb_matrix AVR build produces valid `.hex`.
- [ ] Manual: rp2040 selection → build button disabled with tooltip.

## Out of Scope (defer)

- Wire real QMK tmk_core for ARM/chibios (Phase 5.5 future work).
- Frontend Vitest suite (Q3 deferred option).
- Full linear flow of keyboard sync (Phase 9 QMK index).
- GitHub OAuth.
- Full observability: CloudWatch dashboards, XRay.
