# QMK Alignment Critique Response

This response addresses `QMK_ALIGNMENT_CRITIQUE.md`. The critique is largely accepted. `QMK_ALIGNMENT.md` has been revised to incorporate the implementation-critical points rather than leaving them as implied details.

## Accepted Changes

- Added QMK version pinning as a prerequisite.
- Added builder/index QMK commit recording and mismatch handling.
- Added explicit requirement that the builder image installs and verifies the `qmk` CLI.
- Expanded `qmk_json` payload generation to include QMK Configurator skeleton fields, including `documentation`, plus optional `author` and `notes`.
- Added keymap JSON schema validation before sending work to the builder.
- Added layout alias resolution before compile.
- Moved upstream layout preservation earlier so it happens before or alongside `qmk_json`.
- Added a concrete layout-switch reconciliation algorithm.
- Added legacy `KEYMAP` as a layout preference fallback.
- Added QMK Configurator JSON import details for `author`, `notes`, and `commit` provenance.
- Resolved remap-table direction: generate a checked-in qmk-nexus remap artifact during index build from the official Configurator source when available.
- Added keycode alias normalization using QMK Configurator-style long-form mappings.
- Defined literal/ANY behavior: unknown keycodes are stored and emitted as raw strings, not rejected.
- Added migration behavior for existing imported keyboards with hardware edits or source overrides.
- Clarified that encoder work in generated mode is schema alignment, not missing encoder support.
- Added rotation import validation.
- Added keymap JSON download as a first-class artifact for `qmk_json`.

## Reframed Points

- QMK Configurator's thin frontend is now treated as the compatibility target for upstream keyboard imports, not as a feature ceiling for qmk-nexus. qmk-nexus can still keep richer hardware modeling for custom/generated keyboards.
- Poll interval parity with QMK Configurator is not a requirement. The revised plan notes this as operational tuning, not alignment-critical behavior.
- Generated mode metadata improvements are now clearly scoped to custom keyboards and explicit forks, not normal upstream imports.

## Remaining Decisions

- Whether builder/index QMK commit mismatch should be a hard failure or a warning in development.
- Whether the builder should pin to a QMK release, a specific QMK `master` commit, or a qmk-nexus-managed fork.
- How much upstream `info.json` metadata should be visible in the UI versus retained only for build fidelity.

## Net Change To The Plan

The revised plan now treats these as blockers for the first implementation slice:

1. QMK commit pinning and visibility.
2. `qmk` CLI availability in the builder.
3. Layout metadata preservation.
4. Skeleton-shaped `keymap.json` generation.
5. Payload validation.
6. Deterministic key reconciliation.
7. Keycode alias normalization and literal pass-through.

This makes the first build path more work than originally stated, but avoids shipping a fragile partial `qmk_json` mode.
