# QMK Alignment Implementation Plan

Derived from QMK_ALIGNMENT.md + QMK_ALIGNMENT_CRITIQUE_RESPONSE.md.
Ordered so each phase builds on the last without leaving a broken intermediate state.

---

## Phase 1 — qmk_json Build Path (Foundation)

All items here are coupled. Ship together or not at all.

### 1.1 QMK commit tracking

**`scripts/build_qmk_index.py`**
- Read `git rev-parse HEAD` from the QMK checkout used for index generation.
- Write result as `"qmk_commit": "<sha>"` at the top level of `backend/data/qmk_index.json`.

**`docker/builder/Dockerfile` (or build entrypoint)**
- Embed QMK commit SHA as a build arg / env var `QMK_COMMIT` baked into the image.
- Print `[builder] QMK commit: ${QMK_COMMIT}` at script start.

**`docker/builder/build.sh`**
- Read `QMK_COMMIT` env var and log it on every invocation.

**`backend/aws_builds.py` or `backend/routers/builds.py`**
- Load `qmk_index.json` top-level `qmk_commit`.
- Compare against builder image `QMK_COMMIT` (pass as ECS env var / local env).
- Emit a build log warning on mismatch; treat as error only once toggled via config.

**`backend/config.py`**
- Add `builder_qmk_commit: str | None = None` setting.
- Add `qmk_version_mismatch: Literal["warn", "error"] = "warn"` setting.

---

### 1.2 qmk CLI in builder image

**`docker/builder/Dockerfile`**
- Add `RUN pip install qmk` (or equivalent) so `qmk` is on `PATH`.
- Add a build-time smoke test: `RUN qmk --version`.

**`docker/builder/build.sh`**
- At startup, run `qmk --version` and log output. Fail fast if not found.

---

### 1.3 New `qmk_json` source mode

**`backend/models.py`** — extend `KeyboardConfig`:
```python
source_mode: Literal['generated', 'qmk_native', 'qmk_json'] = 'generated'
upstream_keyboard: str | None = None
upstream_layouts: dict[str, Any] = Field(default_factory=dict)   # all layouts from info.json
layout_aliases: dict[str, str] = Field(default_factory=dict)      # alias → canonical
layout_macro: str = 'LAYOUT'        # selected layout (user-facing)
keymap_name: str = 'nexus'
qmk_commit: str | None = None       # QMK commit this keyboard was indexed against
upstream_files: dict[str, str] = Field(default_factory=dict)  # keep for migration
author: str = ''
notes: str = ''
```

**`backend/codegen/keymap_json.py`** — new file:
- `generate_keymap_json(config: KeyboardConfig) -> str`
- Skeleton shape (embed constant, do not hit network):
  ```json
  {
    "version": 1,
    "documentation": "This file is a QMK Configurator export. You can import this at <https://config.qmk.fm>. It can also be used directly with QMK's compile and flash commands. For more information, see the QMK CLI documentation at <https://docs.qmk.fm>.",
    "keyboard": "",
    "keymap": "nexus",
    "layout": "",
    "author": "",
    "notes": "",
    "layers": []
  }
  ```
- Resolve canonical layout: if `config.layout_macro` is in `config.layout_aliases`, use the alias target; otherwise use `config.layout_macro` as-is.
- `layers`: list of lists, one list per layer, ordered by `layout_macro` key order.
- Keycodes emitted as-is (normalization is a Phase 3 concern).

**`backend/codegen/validator.py`** — add `validate_keymap_json(payload: dict) -> list[str]`:
- Check required fields: `version`, `keyboard`, `keymap`, `layout`, `layers`.
- Check `layers` is a non-empty list of lists.
- Check all layer arrays have the same length.
- Check that length matches the key count of `layout` in `upstream_layouts`.

**`backend/codegen/generator.py`** — add `qmk_json` branch:
```python
if config.source_mode == 'qmk_json':
    payload = generate_keymap_json(config)
    errors = validate_keymap_json(json.loads(payload))
    if errors:
        raise ValueError(f"Invalid keymap.json: {errors}")
    return {'keymap.json': payload}
```

---

### 1.4 Builder: qmk compile path

**`docker/builder/build.sh`** — add `keymap.json` branch before the existing generated path:
```bash
if [[ -f "${SRC_DIR}/keymap.json" ]]; then
  echo "[builder] Mode: qmk_json"
  QMK_KEYBOARD=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["keyboard"])' "${SRC_DIR}/keymap.json")
  QMK_LAYOUT=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["layout"])' "${SRC_DIR}/keymap.json")

  # Validate path — no absolute refs, no traversal
  if [[ -z "$QMK_KEYBOARD" || "$QMK_KEYBOARD" == /* || "$QMK_KEYBOARD" == *..* ]]; then
    echo "[builder] ERROR: invalid keyboard path '${QMK_KEYBOARD}'"
    exit 1
  fi

  echo "[builder] keyboard=${QMK_KEYBOARD} layout=${QMK_LAYOUT}"
  qmk compile "${SRC_DIR}/keymap.json" 2>&1

  # Artifacts land in QMK_HOME/.build/
  ARTIFACT_PREFIX=$(echo "${QMK_KEYBOARD}_nexus" | tr '/' '_')
  find "${QMK_HOME}/.build" -maxdepth 1 \
      \( -name "${ARTIFACT_PREFIX}.hex" -o -name "${ARTIFACT_PREFIX}.bin" -o -name "${ARTIFACT_PREFIX}.uf2" \) \
      -exec cp -v {} "${OUT_DIR}/" \; 2>/dev/null || true
  # Fallback: any artifact
  find "${QMK_HOME}/.build" -maxdepth 1 \
      \( -name "*.hex" -o -name "*.bin" -o -name "*.uf2" \) \
      -exec cp -n {} "${OUT_DIR}/" \; 2>/dev/null || true

  if ! find "${OUT_DIR}" -maxdepth 1 \( -name "*.hex" -o -name "*.bin" -o -name "*.uf2" \) | grep -q .; then
    echo "[builder] ERROR: qmk compile produced no firmware artifact"
    exit 1
  fi
  echo "[builder] Done."
  ls -lh "$OUT_DIR"
  exit 0
fi
```

---

### 1.5 Keymap JSON download endpoint

**`backend/routers/builds.py`** — add `GET /api/builds/{id}/keymap.json`:
- Only valid for `qmk_json` mode keyboards.
- Return the exact payload that was sent to the builder (store it in `generate_all()` output alongside `keymap.json`).

---

### Phase 1 tests

- `backend/tests/test_keymap_json.py` — unit tests for `generate_keymap_json`:
  - Correct skeleton shape
  - Layout alias resolution (alias → canonical name in `layout` field)
  - Layer arrays match layout key count
  - Validator catches mismatched layer lengths
- Builder smoke tests (can be manual first pass):
  - Simple AVR keyboard
  - RP2040 keyboard

---

## Phase 2 — Layout Preservation and Switching

Depends on: Phase 1 (qmk_json mode, `upstream_layouts` field).

### 2.1 Preserve all layouts on import

**`backend/routers/qmk.py`** — in `_convert_to_config()`:
- Store all `layouts` from `info.json` into `config.upstream_layouts`.
- Store `layout_aliases` from `info.json` into `config.layout_aliases`.
- Apply preferred layout selection:
  1. default keymap's `layout` field if present
  2. `layout_aliases` first key
  3. exact `LAYOUT`
  4. legacy `KEYMAP`
  5. first available layout
- Store selection in `config.layout_macro`.

### 2.2 Layout reconciliation algorithm

**`backend/routers/qmk.py`** or new `backend/layout_reconcile.py`:

```
def reconcile_layers(old_keys, old_layers, new_layout_keys):
    # 1. Build map: (row, col) → keycode for each layer
    # 2. Build fallback map: position_index → keycode
    # 3. For each new key:
    #    a. Lookup by (row, col) if both have matrix data → copy
    #    b. Else lookup by position index if counts match → copy
    #    c. Else: KC_TRNS (non-base layers) / KC_NO (base layer)
    # 4. Count discarded positions (old keys with no new match)
    # 5. Return new_layers + warning if discard_count > 0
```

### 2.3 Layout selector UI

**`frontend/src/stages/layout/`** (or import modal):
- Dropdown showing all available layouts from `config.upstreamLayouts`.
- On switch: call backend `PATCH /api/keyboards/{id}` with new `layoutMacro`.
- Backend runs reconciliation and returns updated `KeyboardConfig`.

---

### Phase 2 tests

- `backend/tests/test_layout_reconcile.py`:
  - ANSI → ISO (key count change, expect warning)
  - Matching matrix positions preserved
  - Non-base layers get KC_TRNS for new positions
  - Base layer gets KC_NO for new positions
  - Layout alias resolution selects correct canonical name

---

## Phase 3 — QMK Configurator JSON Import Compatibility

Depends on: Phase 2.

### 3.1 Remap table

**`scripts/build_qmk_index.py`**:
- At index build time, read `remap.json` from QMK Configurator source (if available at known path) or from QMK firmware repo.
- Write result to `backend/data/qmk_remap.json` as a checked-in artifact.
- Apply recursively with max depth 5 to prevent cycles.

**`backend/routers/qmk.py`** — load `qmk_remap.json` and apply before keyboard lookup.

### 3.2 Keycode alias normalization

**`backend/codegen/keycodes.py`** (new) or frontend utility:
- Normalization table (from QMK Configurator `longFormKeycodes.js`):
  - `KC_ENTER → KC_ENT`
  - `KC_ESCAPE → KC_ESC`
  - `KC_BACKSPACE → KC_BSPC`
  - `KC_DELETE → KC_DEL`
  - `_______ → KC_TRNS`
  - `XXXXXXX → KC_NO`
  - (full table — ~40 entries)
- `normalize_keycode(kc: str) -> str`: applies table, returns input unchanged if unknown.
- Applied during: QMK Configurator JSON import, not on keymap edits in the UI (preserve user input).

### 3.3 ANY / literal keycode mechanism

**`backend/models.py`** — no model change needed; unknown keycodes already stored as strings in `Layer.keycodes`.

**`backend/codegen/keymap_c.py`** and **`backend/codegen/keymap_json.py`**:
- Emit unknown keycodes as raw strings (already the case for keymap.c; ensure keymap_json does the same).
- Never reject a keymap because a keycode is unrecognised.

**`frontend/src/stages/keymap/KeycodePicker.tsx`**:
- If current keycode is unknown, show it highlighted as "custom/literal" with option to clear.
- Do not force user to pick from the picker to use a custom keycode (already supported via text input presumably).

### 3.4 QMK Configurator JSON import

**`backend/routers/keyboards.py`** — add `POST /api/keyboards/import/configurator`:
- Accept `multipart/form-data` with a `.json` file.
- Parse fields: `keyboard`, `keymap`, `layout`, `layers`, optional `author`, `notes`, `commit`.
- Apply remap to `keyboard` and `layout` paths.
- Look up keyboard in `qmk_index.json`; 404 if not found after remap.
- Import keyboard config (same as QMK index import).
- Apply keycode alias normalization to all layer keycodes.
- Set `config.author` and `config.notes` from file.
- Store `commit` as `config.qmk_commit` if present.

---

### Phase 3 tests

- `backend/tests/test_keycode_normalize.py` — full alias table coverage.
- `backend/tests/test_configurator_import.py` — fixture `.json` files from real QMK Configurator exports, including renamed keyboard paths.
- `backend/tests/test_literal_keycode.py` — unknown keycodes round-trip through keymap_json unchanged.

---

## Phase 4 — Migration and Source Mode Defaults

Depends on: Phases 1–3.

### 4.1 Default new imports to `qmk_json`

**`backend/routers/qmk.py`** — `_source_mode_from_info()`:
- Default to `qmk_json` for all upstream imports (replace `generated` default).
- Keep `generated` only for keyboards explicitly created in Nexus.
- Custom matrix detection no longer triggers `qmk_native`; use `qmk_json` instead.

### 4.2 Migration for existing keyboards

**`backend/routers/keyboards.py`** — add `POST /api/keyboards/{id}/migrate`:
- If `source_mode == 'qmk_native'` or `source_mode == 'generated'` with `upstream_keyboard` set:
  - Check `upstream_files` and matrix edits.
  - If no custom edits: convert to `qmk_json` silently.
  - If custom edits: return `422` with a warning listing what will be discarded; require explicit `?force=true` to proceed.

### 4.3 UI language

**`frontend/src/stages/build/BuildStage.tsx`**:
- Update `sourceModeLabel`:
  - `qmk_json` → "Upstream QMK"
  - `generated` → "Custom Generated"
  - `qmk_native` → "Legacy Native" (keep badge, add migration prompt)
- Show migration CTA for `qmk_native` keyboards.

---

## Phase 5 — Builder Source Strategy

Depends on: Phase 1 (qmk CLI, commit tracking).

### 5.1 Full QMK tree, pinned

**`docker/builder/Dockerfile`**:
- Clone QMK at the pinned commit used to generate `qmk_index.json`.
- Run `qmk setup --yes` to install dependencies.
- Record commit in `QMK_COMMIT` env var.
- Document how to update: rebuild image + regenerate index at same commit.

### 5.2 Drop upstream overlay for qmk_json builds

**`docker/builder/build.sh`**:
- For `keymap.json` path: no overlay step. Use QMK tree in image directly.
- Keep overlay logic only for `qmk_native` (legacy path until migration is complete).

### 5.3 Deprecation path for qmk_native

- Once Phase 4 migration runs cleanly on a representative sample, log a deprecation warning for `qmk_native` builds.
- Remove overlay logic in a follow-up after migration is verified.

---

## Phase 6 — Generated Mode Metadata

Independent of Phases 1–5. Can be done in parallel.

### 6.1 keyboard.json schema alignment

**`backend/codegen/info_json.py`**:
- Add `debounce` field (default 5).
- Add `split` block when `feature_configs.split` is set.
- Add `encoder` block using QMK info.json schema shape.
- Add `rgb_matrix.layout` array from LED positions.
- Add `bootmagic.matrix` when bootmagic is enabled.
- Add `pointing_device` block when trackball feature is enabled.

### 6.2 Feature placement audit

Walk each feature toggle and verify the generated value lands in the right file:
- USB descriptor values → `keyboard.json` (not `config.h`)
- Matrix pins → `config.h`
- Feature enable flags → `rules.mk`
- Peripheral config → appropriate config section

### 6.3 Golden test updates

Run `pytest --snapshot-update` after each change. Keep goldens in sync.

---

## Execution Order

| Step | What | Unblocks |
|------|------|----------|
| 1 | QMK commit tracking + builder CLI | All of Phase 1 |
| 2 | `keymap_json.py` + validator | Phase 1 build path |
| 3 | `build.sh` qmk compile branch | Phase 1 can ship |
| 4 | `upstream_layouts` + alias on import | Phase 2 |
| 5 | Reconciliation algorithm | Phase 2 UI |
| 6 | Layout selector UI | Phase 2 done |
| 7 | Remap table at index build | Phase 3 |
| 8 | Keycode normalization + literal | Phase 3 import |
| 9 | Configurator JSON import endpoint | Phase 3 done |
| 10 | Default imports to `qmk_json` | Phase 4 |
| 11 | Migration endpoint + UI | Phase 4 done |
| 12 | Full QMK tree in builder | Phase 5 |
| 13 | Drop overlay for qmk_json | Phase 5 done |
| 14 | keyboard.json schema improvements | Phase 6 (parallel) |

## Open Questions (Decide Before Phase 1 Ships)

1. **Mismatch policy**: index/builder QMK commit mismatch → hard error or warning in dev?
2. **QMK pin strategy**: release tag, pinned `master` commit, or qmk-nexus-managed fork?
3. **Upstream metadata in UI**: which `info.json` fields surface in the build stage vs. stored silently for build fidelity?
