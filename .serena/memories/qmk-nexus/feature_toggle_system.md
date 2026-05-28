# QMK Nexus Feature Toggle System

## Current data/store requirements
- `layoutMeta` must be populated in the keyboard store with defaults for optional feature config keys.
- Feature inputs use layout/store keys to map UI fields to saved config.
- Initialization merges feature definitions with `layoutMeta` to set defaults.
- TypeScript strictness requires removing unused imports/state.

## Current implementation state
- Conditional feature fields are supported in current frontend code.
- Repeated-per-count feature fields are supported in current frontend code.
- Current code has handling in both the build-stage toggle path and newer keymap/features component path.
- Verify exact behavior with focused frontend typecheck/lint/build before changing feature definitions.

## Priority defaults
- User priority for QMK work: split keyboards + RGB matrix.
- When adding defaults/examples/tooltips/phase order for feature work, prioritize split + RGB matrix.

## Still watch
- Keep `layoutKey`/store mappings consistent when adding fields.
- Avoid toggling a feature by clicking labels/text fields; global UI preference says toggles should respond only to the toggle/checkbox itself.
- Run TypeScript checks after feature schema or UI changes.