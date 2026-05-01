# QMK_ALIGNMENT.md Critique

Based on a direct reading of the QMK Configurator source at `/mnt/LargeNVMe/Projects/GitHub/qmk_configurator`.

---

## What the Configurator Actually Does (Ground Truth)

The real configurator is much thinner than the alignment plan implies:

- Reads only `layouts` and `layout_aliases` from `info.json` — every other field (matrix_pins, MCU, features, encoders, RGB config, split, etc.) is **completely ignored** by the frontend
- Compile payload is just `{ keyboard, keymap, layout, layers[] }` plus a skeleton template fetched from `GET /v1/skeletons/keymap` (which adds `version`, `documentation`, `notes`, `author`)
- No encoder config, no OLED config, no peripheral UI whatsoever
- No keycode rejection — unknown codes become `ANY(kc)` pass-through, never a hard error
- No rotation rendering — `r`/`rx`/`ry` KLE fields are silently dropped
- Polls at random 2500–3500ms intervals

---

## Critiques by Phase

### Phase 1 — qmk_json Build Path

**Payload spec is incomplete.** The plan shows:
```json
{ "version": 1, "keyboard": "...", "keymap": "nexus", "layout": "LAYOUT", "layers": [] }
```
The actual QMK compile API expects the skeleton template fields too: `documentation` (a required disclaimer string from the skeleton), and optionally `notes`/`author`. The builder integration should fetch the skeleton format once and embed it rather than hardcoding `version: 1`.

**Builder integration is underspecified.** The plan says "if `src/keymap.json` exists, run `qmk compile src/keymap.json`" but omits:
- The builder image currently does not install `qmk` as an executable CLI command — it installs QMK Python deps but invokes `make` directly. `qmk compile` is a separate code path through QMK's Python tooling and requires `qmk` on `PATH`.
- After `qmk compile`, artifacts land in `<qmk_home>/.build/`, not the `out/` directory `build.sh` currently collects from. The artifact collection logic must be updated.
- The output firmware filename follows QMK's naming scheme (`keyboard_keymap.hex` with slashes replaced by underscores), which may differ from current artifact naming.

**Layout alias not addressed.** When `layout_aliases` redirects `LAYOUT_foo → LAYOUT_bar`, the compile payload must use the canonical post-alias name. Phase 1 does not specify this.

---

### Phase 2 — Preserve All Layouts on Import

**Missing: key count reconciliation on layout switch.** When a user switches from `LAYOUT_iso` (88 keys) to `LAYOUT_ansi` (87 keys), the layers array length changes. The plan says "preserve keycodes by matrix position when possible" but does not specify what happens to keys that exist in one layout but not the other — especially for layer-tap or custom keycodes that reference positions that no longer exist. This is the hardest part of Phase 2 and needs a concrete algorithm.

**Missing: `KEYMAP` legacy alias.** The configurator's `getPreferredLayout` falls back to `KEYMAP` (the old pre-standardisation name) as a third-priority option. The plan's layout selection priority order omits this, which will break imports of older keyboards.

**Phase ordering issue.** Phase 2 should happen before or alongside Phase 1. If Phase 1 ships first with a collapsed single-layout model, the compile payload will use whatever layout was selected at import time with no way to switch — a worse user experience than the current state.

---

### Phase 3 — QMK Configurator JSON Import Compatibility

**Keycode alias normalisation not addressed.** The configurator has a `longFormKeycodes.js` normalisation table mapping `KC_ENTER→KC_ENT`, `KC_ESCAPE→KC_ESC`, `_______→KC_TRNS`, `XXXXXXX→KC_NO`, etc. Exported keymap files frequently use these long forms. The plan mentions preserving unknown keycodes as literals but does not address normalising known aliases. If qmk-nexus skips this step, standard keys in imported files will appear as unknown/literal strings in the UI.

**ANY key mechanism not described.** The configurator's ANY key concept — unknown keycodes stored and emitted literally to the compiler — has no specified equivalent in the plan. This needs a concrete answer: are unknown keycodes stored as raw strings in the keycode field? Is there a separate `literal` type? The plan should define this before Phase 3 is implemented.

**`remap.js` is underspecified.** The plan says "port or consume QMK Configurator's remap table" without explaining what it is: a map of old keyboard paths to new canonical paths (e.g. when a keyboard is moved in the QMK tree). The open question of "local copy vs. generate at index build time" should be resolved here. The right answer is almost certainly to generate it at index build time from the same source used by the official configurator, keeping it in sync with the QMK tree.

**`author`, `notes`, and `commit` fields.** Exported configurator files include these fields. The plan does not specify whether qmk-nexus should preserve or discard them on import.

---

### Phase 4 — Prefer Native Upstream Builds for Imported Keyboards

Direction is correct. One gap: the plan does not address what happens when a user has already made hardware edits to an imported keyboard in the old `qmk_native` or generated hybrid mode. There should be a migration path or at minimum a warning that switching to `qmk_json` mode will discard those hardware edits.

---

### Phase 5 — Fix Builder Upstream Source Strategy

**QMK version pinning is unresolved but coupled to Phase 1.** The plan defers this to an open question. It must be decided before Phase 1 ships. `qmk compile keymap.json` uses whatever QMK tree is in the builder image. If that tree diverges from the version used to build `qmk_index.json`, keyboard definitions may have changed (layout renamed, key count changed, MCU changed). At minimum the builder image should embed the QMK commit SHA it was built from and expose it in build logs. The index build script should record the same SHA. A mismatch should produce a warning at build time.

**`qmk` CLI installation not mentioned.** The builder currently installs QMK Python dependencies but calls `make` directly. For `qmk compile` to work, `qmk` must be on `PATH` as an executable command (`pip install qmk` or a manual shim). This is a concrete builder image change not called out in Phase 5 or Phase 1.

---

### Phase 6 — Generated Mode Metadata Improvements

**Encoder metadata is already substantially implemented.** The plan lists encoder metadata as a gap in generated `keyboard.json`, but qmk-nexus's encoder support (CW/CCW keycodes per layer, `encoder_map` in `keymap.c`) already exceeds anything the official configurator does. The improvement here is not about adding encoder support — it is about whether the `encoder` key in generated `keyboard.json` matches the QMK info.json schema format. Clarify this is a schema alignment task, not a missing feature.

**`community_layouts` interaction is unresolved.** The plan mentions adding community layout support but does not specify how qmk-nexus will map its internal layout to a community layout name (e.g. `LAYOUT_65_ansi`), or whether declaring community layout compatibility is even in scope for generated mode.

---

## Missing Concerns Not Addressed by Any Phase

**Rotation rendering validation.** qmk-nexus renders rotated keys (the configurator does not). When importing a QMK keyboard that uses `r`/`rx`/`ry` in its layout definition, the import should verify that the rendered positions match the physical reality. The rotation import path has no validation or test coverage mentioned anywhere in the plan.

**Compile payload validation before sending.** The configurator runs an AJV schema check (`checkInvalidKeymap`) on the keymap JSON before submitting to compile. qmk-nexus should add equivalent validation at the `generate_sources()` boundary for `qmk_json` mode to catch malformed payloads before they reach the builder.

**Source ZIP and keymap JSON download links.** The configurator exposes three download links after a successful build: firmware binary, source ZIP, and keymap JSON. qmk-nexus currently only offers the firmware binary. For the `qmk_json` path, offering a keymap JSON download (the exact payload sent to compile) would be valuable for debugging and portability with other QMK tools.

**Skeleton endpoint not referenced.** If qmk-nexus wants its generated keymap JSON to be structurally identical to what the official configurator sends — important for compatibility — it should fetch the skeleton once and use it as the template rather than hardcoding the structure. This also keeps the `documentation` field up to date automatically.

---

## Summary

The plan's phases and direction are sound. The main weaknesses are:

| Issue | Severity |
|-------|----------|
| Phase 1 payload spec missing `documentation` and skeleton fields | Medium — will produce API rejections in some compiler implementations |
| Phase 1 builder integration missing `qmk` CLI install and artifact path | High — Phase 1 cannot ship without this |
| Phase 2 layout switch key reconciliation algorithm not specified | High — hardest part of Phase 2, glossed over |
| Phase 3 missing keycode alias normalisation | High — breaks import fidelity for all standard keymaps |
| Phase 3 ANY key mechanism undefined | Medium — needed before implementation begins |
| Phase 5 QMK version pinning deferred but coupled to Phase 1 | High — version drift will produce silent, hard-to-diagnose build failures |
| Phase 5 `qmk` CLI install not called out | High — prerequisite for Phase 1 |
| Rotation import validation absent | Low — correctness risk, not a blocker |
| Compile payload schema validation absent | Low — defensive measure, not a blocker |
