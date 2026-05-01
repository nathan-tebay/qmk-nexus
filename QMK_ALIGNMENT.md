# QMK Alignment Plan

This plan aligns qmk-nexus keyboard loading and firmware builds more closely with the upstream QMK Configurator/QMK compiler process while preserving qmk-nexus custom-keyboard workflows.

## Goals

- Compile imported upstream QMK keyboards through the real QMK keyboard definitions whenever possible.
- Preserve upstream keyboard metadata instead of flattening it into a lossy internal model.
- Support QMK Configurator-style keymap JSON import, keyboard remaps, layout selection, and default keymaps.
- Keep generated-source builds for custom keyboards and intentionally edited hardware definitions.
- Keep keymap behavior compatible with QMK Configurator where it matters: `keymap.json` payload shape, keycode alias normalization, literal pass-through keycodes, and layout remaps.

## Current Gap Summary

qmk-nexus currently imports upstream QMK keyboards into `KeyboardConfig`, then either regenerates keyboard source files or builds a partial upstream overlay. QMK Configurator instead sends a standard `keymap.json` payload with `keyboard`, `keymap`, `layout`, and `layers` to the QMK compiler API, which compiles against the real upstream keyboard tree.

The QMK Configurator frontend itself is deliberately thin. It reads keyboard lists, `info.json` layouts, `layout_aliases`, default keymaps, and skeleton keymap templates; it does not model MCU, matrix pins, RGB, OLED, encoders, split transport, or other hardware metadata in the UI. qmk-nexus can keep its richer hardware UI for custom/generated keyboards, but upstream QMK imports should not depend on faithfully reconstructing that hardware data.

The main gaps are:

- Imported keyboards collapse to a single selected layout.
- Standard QMK `keymap.json` is not the primary compile artifact.
- Old QMK Configurator exports are not remapped through the Configurator remap table.
- Known keycode aliases and unknown literal keycodes are not handled with Configurator-equivalent semantics.
- Generated keyboard metadata omits many upstream QMK fields.
- Native QMK mode is heuristic and uses partial overlays.
- Build behavior diverges from `qmk compile keymap.json`.
- Builder/index QMK version drift is not currently detected.

## Prerequisites

These are required before or during the first implementation phase.

- Pin a QMK firmware source for both index generation and builder images.
- Record the QMK commit SHA in `backend/data/qmk_index.json` or adjacent metadata.
- Embed the builder QMK commit SHA in the builder image and print it in build logs.
- Warn or fail builds when the keyboard index SHA and builder SHA do not match.
- Ensure the builder image provides the `qmk` CLI on `PATH`, not only Python dependencies and direct `make`.
- Add schema validation for generated `keymap.json` payloads at the `generate_sources()` boundary.
- Decide that upstream imports default to keymap-only editing. Hardware edits require an explicit fork/conversion into generated mode.

## Phase 1: Add A Real QMK Keymap JSON Build Path And Preserve Layout Metadata

### Implementation

- Add a source mode for imported upstream keyboards, for example `qmk_json`.
- Extend `KeyboardConfig` with enough upstream identity to produce QMK keymap JSON:
  - `upstream_keyboard`
  - `layout_macro`
  - `keymap_name`
  - optional `author`
  - optional `notes`
  - `qmk_commit`
  - all upstream layouts and `layout_aliases`
  - ordered key list for the selected layout
  - exported `layers`
- Add `backend/codegen/keymap_json.py`.
- Add a local skeleton template based on QMK's `/v1/skeletons/keymap` output. Do not hardcode only `version: 1`; include the same structural fields QMK Configurator sends.
- For `qmk_json`, generate a validated payload shaped like:

```json
{
  "version": 1,
  "documentation": "This file is a QMK Configurator export...",
  "keyboard": "vendor/keyboard",
  "keymap": "nexus",
  "layout": "LAYOUT",
  "author": "",
  "notes": "",
  "layers": []
}
```

- Resolve `layout_aliases` before compile. Store both the user-facing requested layout and the canonical compile layout when they differ.
- Update `backend/codegen/generator.py` so imported upstream keyboards can emit `keymap.json` instead of generated keyboard sources.
- Update `docker/builder/build.sh`:
  - If `src/keymap.json` exists, run `qmk compile src/keymap.json` with the QMK CLI.
  - Collect artifacts from the QMK `.build` directory using QMK's firmware naming convention, where slashes are replaced with underscores.
  - Log QMK CLI version, QMK commit SHA, keyboard, keymap, layout, and output artifact filename.
  - Keep existing generated mode unchanged for custom keyboards.
- Add a keymap JSON download endpoint so users can retrieve the exact payload sent to QMK.

### Verification

- Add backend tests for generated `keymap.json`.
- Add builder smoke tests for at least:
  - simple AVR board
  - RP2040 board
  - split board
  - RGB/encoder board
- Compare artifact success against `qmk compile` locally using the same JSON.
- Validate payloads against the QMK keymap schema before invoking the builder.

## Phase 2: Implement Layout Switching And Key Reconciliation

### Implementation

- Add an imported-keyboard layout selector in the layout stage.
- Rebuild the visual key list from the selected upstream layout.
- Use this reconciliation algorithm when switching layouts:
  - Build a map from old keys by matrix tuple `(row, col)` when matrix data exists.
  - Build a secondary map from old keys by stable physical index for layouts with no matrix data.
  - For each new key, copy keycodes from the old key with the same matrix tuple.
  - If no matrix tuple match exists, copy by physical index only when old and new layout names share the same key count.
  - Fill newly introduced positions with `KC_TRNS` on non-base layers and `KC_NO` or blank on base layer according to qmk-nexus UI defaults.
  - Drop keycodes for removed positions, but keep a non-blocking warning listing the number of discarded positions.
  - Preserve layer-tap, mod-tap, literal, and custom keycodes as strings; do not attempt semantic rewriting by position.
- Keep the default layout selection behavior:
  - default keymap layout first
  - layout alias second
  - exact `LAYOUT`
  - legacy `KEYMAP`
  - preferred layout fallback

### Verification

- Import boards with many layouts such as common 60%, TKL, and Keychron variants.
- Ensure switching layouts updates geometry without corrupting layers.
- Add tests for preserving keycodes across compatible layouts.
- Add tests for ANSI/ISO key count differences and removed-position warnings.

## Phase 3: Support QMK Configurator JSON Import Compatibility

### Implementation

- Add a backend or frontend parser for QMK Configurator exports:
  - `keyboard`
  - `keymap`
  - `layout`
  - `layers`
  - optional `author`
  - optional `notes`
- Preserve optional `commit` as provenance metadata when present.
- Generate a qmk-nexus remap table during index build from the same source used by the official configurator when available. Keep a checked-in generated artifact so imports work offline.
- Apply remaps recursively before lookup:
  - keyboard path remaps
  - layout name remaps
  - max depth guard
- Add keycode alias normalization using QMK Configurator's `longFormKeycodes.js` semantics:
  - normalize known aliases such as `KC_ENTER` to `KC_ENT`
  - normalize `_______` to `KC_TRNS`
  - normalize `XXXXXXX` to `KC_NO`
  - preserve layer/mod-tap expressions after normalizing their inner keycode where safe
- Define an ANY/literal key mechanism:
  - store unknown keycodes as raw strings in the layer keycode map
  - mark them as literal in the frontend keycode UI
  - emit the raw string unchanged in `keymap.json`
  - never reject a keymap solely because a keycode is unknown to qmk-nexus
- On import:
  - resolve keyboard against `qmk_index.json`
  - import the upstream keyboard
  - select the requested layout
  - load layers by layout order

### Verification

- Add fixture imports from QMK Configurator exports.
- Include old renamed keyboard paths that require remapping.
- Confirm generated `keymap.json` can be compiled by QMK.
- Add fixtures containing long-form keycode aliases and unknown custom keycodes.

## Phase 4: Prefer Native Upstream Builds For Imported Keyboards

### Implementation

- Change default import behavior:
  - upstream QMK import uses `qmk_json`
  - custom keyboards use `generated`
  - edited hardware definitions can opt into `generated`
- Add a migration rule for existing imported keyboards:
  - if no hardware edits are detected, migrate to `qmk_json`
  - if hardware edits or custom source overrides exist, keep the current mode and show a warning before conversion
  - if the user explicitly converts to `qmk_json`, document that hardware edits and generated-source overrides are discarded
- Revisit `scripts/build_qmk_index.py`:
  - keep metadata extraction for UI/search
  - stop relying on partial upstream overlay for normal imports
  - keep `_nexus.source_mode` only for exceptions
- Update UI language to distinguish:
  - upstream keymap editing
  - custom keyboard hardware editing
  - source override mode

### Verification

- Build a representative sample of imported keyboards with no generated keyboard source.
- Confirm upstream-only boards no longer need lossy matrix pin inference.

## Phase 5: Fix Builder Upstream Source Strategy

### Preferred Approach

- Keep a full `qmk_firmware` tree in the builder image.
- Pin it to the same commit used for `qmk_index.json`.
- Update it intentionally during builder image rebuilds and regenerate the index at the same commit.
- Do not store partial per-keyboard upstream overlays for normal imports.
- Install and verify the `qmk` CLI in the builder image.
- Print QMK commit and CLI version at the start of every build.

### Fallback Approach

If image size or update cadence requires overlays:

- Improve overlay collection to use QMK's resolved build metadata rather than simple `SRC` parsing.
- Include all keyboard ancestor files, keymap files, referenced sources, board files, ChibiOS config, LD files, and library files.
- Add a validation job that tests every indexed native-mode keyboard at index-build time.

### Verification

- Confirm native imported builds work with no overlay for keyboards present in the builder's QMK tree.
- Add a builder image version field and expose it in build logs.

## Phase 6: Round-Trip Metadata Improvements For Generated Mode

Generated mode remains valuable for keyboards created in qmk-nexus. Improve it separately so it does not pretend to be a full upstream import path.

### Implementation

- Extend generated `keyboard.json` support for:
  - layout aliases
  - community layouts, only when qmk-nexus can prove the generated layout matches the named community layout contract
  - debounce
  - bootmagic matrix position
  - split settings
  - RGB/LED matrix layout data
  - encoder schema alignment, not basic encoder support, since qmk-nexus already emits encoder maps
  - pointing device config
  - board/chibios config where applicable
- Move feature-specific values into the right QMK location:
  - `keyboard.json`
  - `config.h`
  - `rules.mk`
  - keyboard source files
- Add warnings when a feature cannot be represented faithfully in generated mode.

### Verification

- Golden tests for generated files.
- Build tests for each supported feature family.
- Diff generated metadata against equivalent QMK examples.

## Additional Validation Work

- Add rotation import tests for QMK layouts using `r`, `rx`, and `ry`. qmk-nexus renders rotation while QMK Configurator mostly ignores it, so qmk-nexus needs explicit visual and data validation.
- Add pre-build keymap JSON schema validation.
- Add source/keymap download links:
  - firmware binary
  - source ZIP where applicable
  - exact `keymap.json` payload for `qmk_json`
- Keep build polling behavior independent from QMK Configurator. Matching its random 2500-3500 ms interval is not required unless backend load becomes a problem.

## Proposed Order

1. Pin QMK version metadata and install/verify `qmk` CLI in the builder.
2. Preserve all upstream layouts and aliases during import.
3. Implement `qmk_json` generation, validation, build, and keymap JSON download.
4. Add QMK Configurator JSON import, remapping, keycode alias normalization, and literal keycodes.
5. Switch eligible imported keyboards to `qmk_json` by default with migration warnings.
6. Simplify builder upstream source handling.
7. Improve generated mode metadata for custom keyboards.

## Acceptance Criteria

- Imported upstream keyboards build through `qmk compile keymap.json`.
- QMK Configurator exports can be imported, remapped, edited, and rebuilt.
- Multi-layout keyboards retain all layouts after import.
- Layout switching has deterministic key reconciliation and warns when keys are discarded.
- Known keycode aliases normalize cleanly and unknown keycodes round-trip literally.
- Custom qmk-nexus keyboards still build through generated source mode.
- Build logs clearly identify which mode was used.
- Build logs include index QMK commit, builder QMK commit, and mismatch warning/error behavior.
- A smoke suite covers representative AVR, ARM, split, RGB, encoder, and custom-generated builds.

## Open Questions

- Should version mismatch between the keyboard index and builder be a hard failure or warning during development?
- Should the builder track a pinned QMK release, a pinned commit on QMK `master`, or a qmk-nexus-managed fork?
- How much of the upstream `info.json` should be exposed in the UI versus stored only for build fidelity?
