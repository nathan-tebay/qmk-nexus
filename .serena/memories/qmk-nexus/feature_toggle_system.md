# QMK Nexus Feature Toggle System

## Store/data requirements
- `layoutMeta` must be populated in the keyboard store with default values for all `optionalConfig` keys from `modules.ts`.
- Feature inputs use `layoutKey` to map to store properties.
- `FeatureTogglePanel` derives input values from `layoutMeta[feature.inputs[i].layoutKey]`.
- `initializeFeatures` in `layoutIntegration.ts` merges feature definitions with `layoutMeta` to set proper defaults.
- TypeScript strictness requires removing unused imports such as `KeyboardLayoutMeta` when unused and unused state variables.

## Phase 1 toggle_features.md progress as of May 2026
Completed:
- Tasks 1.2-1.8.
- Added missing inputs to `modules.ts` for RGB Light, RGB Matrix, Encoder, Split, OLED, Backlight, Audio.
- Updated `featureDefaults` in `keyboard.ts`.
- `ConfigField` supports `conditionalOn: Record<string,string>` and `repeatPerCount: string`.

Still needed:
- Rewrite `FeatureToggles.tsx` to handle `conditionalOn` and `repeatPerCount`.
- Verify `layoutKey` mappings.
- Verify TypeScript compilation.
