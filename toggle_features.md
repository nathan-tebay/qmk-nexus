# Feature Toggle Implementation Plan

> **For Hermes:** Execute this plan phase-by-phase, checking tasks as complete.

**Goal:** Implement the full feature toggle spec with structured inputs, warnings, layout integration, conditional visibility, OLED multi-instance, validation, and accessibility.

**Architecture:** Add new types layer, enrich feature definitions with structured inputs/warnings, update store with lock/derived state, refactor UI components to use new data model.

**Tech Stack:** React 18, TypeScript, Zustand, CSS Modules

---

## Current State (from evaluation)

All 14 features exist in `frontend/src/features/featureDefinitions.ts` with basic toggle/expand functionality. Types exist in `frontend/src/features/types.ts`. Gaps identified:

### Critical Gaps
1. Feature definitions missing most inputs (only ~10 of 40+ inputs defined)
2. No `conditionalOn` logic on any inputs (RGB Matrix, Split)
3. No `derivedFromLayout` flags on count fields
4. No `layoutKey` mappings on many inputs
5. No OLED multi-instance support (missing repeatPerCount)
6. No input validation (pin regex, number ranges, required fields)
7. No accessibility attributes (ARIA)
8. No inference rules for auto-enabling features from layout data
9. No serialization to QMK output format
10. Per-input state management not wired to store

### High Gaps
11. Locking model uses config key presence, not `requiredFeatures` or inference
12. No distinction between "derived/disabled" and "pre-filled/editable" for pin fields
13. No tooltips on locked checkboxes
14. Conditional input visibility checks layout instead of sibling field values
15. Input values stored in `defaultValue` which mutates definitions instead of maintaining separate state
16. No build validation gate

---

## Phase 1: Complete Feature Input Definitions

**Objective:** Add all missing inputs to feature definitions with proper layoutKey, derivedFromLayout, and conditionalOn fields.

- [x] Task 1.1: Types already exist in `frontend/src/features/types.ts` - verify completeness
- [ ] Task 1.2: Add all missing inputs to RGB Light (rgblight_pin, rgblight_led_count)
- [ ] Task 1.3: Add all missing inputs to RGB Matrix (driver, pin, sda, scl, led_count) with conditionalOn
- [ ] Task 1.4: Add all missing inputs to Encoder (count, pad_a, pad_b, resolution)
- [ ] Task 1.5: Add all missing inputs to Split (transport, soft_serial_pin, i2c_sda, i2c_scl, master) with conditionalOn
- [ ] Task 1.6: Add all missing inputs to OLED (count, per-instance driver/sda/scl/display_size) with repeatPerCount
- [ ] Task 1.7: Add all missing inputs to Backlight (pin, levels)
- [ ] Task 1.8: Add all missing inputs to Audio (pin)
- [ ] Task 1.9: Verify all layoutKey mappings are correct
- [ ] Task 1.10: Verify TypeScript compilation passes

## Phase 2: Layout Integration and Inference Rules

**Objective:** Implement the layout-derived behavior rules.

- [ ] Task 2.1: Add `lockedOn` boolean to feature state in keyboard store
- [ ] Task 2.2: Implement inference rules (encoderCount >= 1 -> encoder, isSplit -> split, etc.)
- [ ] Task 2.3: Add `derivedFromLayout` flag per input value
- [ ] Task 2.4: Distinguish "derived/disabled" vs "pre-filled/editable" fields
- [ ] Task 2.5: Handle `requiredFeatures` array from layout meta
- [ ] Task 2.6: Update `initializeFeatures` to use new logic
- [ ] Task 2.7: Implement per-input pre-fill logic using layoutKey mappings

## Phase 3: Conditional Input Visibility

**Objective:** Implement conditionalOn logic for RGB Matrix and Split features.

- [ ] Task 3.1: Add conditional rendering logic in FeatureToggles component
- [ ] Task 3.2: Implement RGB Matrix driver-dependent pin visibility
- [ ] Task 3.3: Implement Split transport-dependent pin visibility
- [ ] Task 3.4: Preserve hidden field values when toggling

## Phase 4: OLED Multi-Instance Support

**Objective:** Implement repeatPerCount logic for OLED displays.

- [ ] Task 4.1: Add `repeatPerCount` support to input rendering
- [ ] Task 4.2: Implement indexed labels (OLED 1, OLED 2)
- [ ] Task 4.3: Handle single-OLED case (omit index from labels)
- [ ] Task 4.4: Add "Left Half" / "Right Half" labels for split keyboards
- [ ] Task 4.5: Dynamic add/remove when oled_count changes

## Phase 5: Warnings UI

**Objective:** Render warnings with proper styles and icons.

- [ ] Task 5.1: Create warning banner component with hardware/info/caution styles
- [ ] Task 5.2: Add warning icons (wrench, info, exclamation)
- [ ] Task 5.3: Render warnings at top of expanded feature section
- [ ] Task 5.4: Add ARIA alert role to warnings

## Phase 6: Validation

**Objective:** Implement input validation for all field types.

- [ ] Task 6.1: Add pin validation regex (`/^[A-K]\\d{1,2}$/i`)
- [ ] Task 6.2: Add number min/max validation
- [ ] Task 6.3: Add required field validation
- [ ] Task 6.4: Show inline validation errors beneath inputs
- [ ] Task 6.5: Skip validation for disabled (layout-derived) fields
- [ ] Task 6.6: Add build gate that checks all required fields filled

## Phase 7: Accessibility

**Objective:** Add ARIA attributes throughout.

- [ ] Task 7.1: Add `aria-disabled="true"` to locked checkboxes
- [ ] Task 7.2: Add descriptive `aria-label` to locked checkboxes
- [ ] Task 7.3: Add `aria-expanded` to expandable sections
- [ ] Task 7.4: Add `aria-describedby` linking inputs to help text and errors
- [ ] Task 7.5: Add `aria-disabled="true"` to disabled inputs

## Phase 8: Serialization

**Objective:** Add method to serialize feature config to QMK format.

- [ ] Task 8.1: Create serialization function for rules.mk output
- [ ] Task 8.2: Create serialization function for config.h output
- [ ] Task 8.3: Create serialization function for info.json output
- [ ] Task 8.4: Add serialization method to keyboard store

## Phase 9: Polish and Testing

**Objective:** Final touches and verification.

- [ ] Task 9.1: Add tooltips to locked checkboxes
- [ ] Task 9.2: Fix feature ID mismatch (`split_keyboard` -> `split`)
- [ ] Task 9.3: Verify all 14 features render correctly with new system
- [ ] Task 9.4: Test layout change reinitialization
- [ ] Task 9.5: Run typecheck and lint

---

## File Structure (Target)

```
frontend/src/features/
  types.ts                      # KeyboardLayoutMeta, FeatureInput, Warning, FeatureConfig
  featureDefinitions.ts         # All 14 features with complete inputs, warnings, conditionalOn
  layoutIntegration.ts          # Layout-derived behavior, inference rules, pre-fill logic
  FeatureToggles.tsx            # Main component with conditional inputs, warnings, validation, ARIA
  FeatureToggles.module.css     # Warning styles, validation error styles, animations
  store/keyboard.ts             # Feature state with lockedOn, derivedFromLayout, serialization
```
