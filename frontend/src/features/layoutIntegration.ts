import { KeyboardLayoutMeta, FeatureConfig } from './types';

export function initializeFeatures(layoutMeta: KeyboardLayoutMeta, currentConfigs: FeatureConfig[]): FeatureConfig[] {
  // Deep clone to avoid mutating the original definitions
  let newConfigs = JSON.parse(JSON.stringify(currentConfigs)) as FeatureConfig[];

  // 1. Pre-calculate required features set for O(1) lookup
  const requiredIds = new Set(layoutMeta.requiredFeatures || []);

  // 2. Apply rules: Auto-enable, Lock, and Pre-fill
  const processedConfigs: FeatureConfig[] = [];

  newConfigs.forEach((feature) => {
    // Check if this feature is explicitly required by layout
    if (requiredIds.has(feature.id)) {
      feature.enabled = true;
      feature.lockedOn = true;
    }

    // 3. Inference Rules: Auto-enable based on hardware presence
    if (feature.id === 'split_keyboard' && layoutMeta.isSplit) {
      feature.enabled = true;
      feature.lockedOn = true;
    }
    if (feature.id === 'encoder' && (layoutMeta.encoderCount ?? 0) >= 1) {
      feature.enabled = true;
      feature.lockedOn = true;
    }
    if (feature.id === 'oled' && (layoutMeta.oledCount ?? 0) >= 1) {
      feature.enabled = true;
      feature.lockedOn = true;
    }
    if (feature.id === 'rgblight' && (layoutMeta.rgbLedCount ?? 0) >= 1) {
      feature.enabled = true;
      feature.lockedOn = true;
    }
    if (feature.id === 'rgb_matrix' && (layoutMeta.rgbMatrixLedCount ?? 0) >= 1) {
      feature.enabled = true;
      feature.lockedOn = true;
    }
    if (feature.id === 'backlight' && layoutMeta.backlightPin) {
      feature.enabled = true;
      feature.lockedOn = true;
    }
    if (feature.id === 'audio' && layoutMeta.audioPin) {
      feature.enabled = true;
      feature.lockedOn = true;
    }
    if (feature.id === 'pointing_device' && (layoutMeta.trackballCount ?? 0) >= 1) {
      feature.enabled = true;
      feature.lockedOn = true;
    }

    // 4. Pre-fill inputs from layoutKey
    if (feature.inputs) {
      feature.inputs.forEach((input) => {
        if (input.layoutKey) {
          const layoutValue = (layoutMeta as any)[input.layoutKey];
          
          if (layoutValue !== undefined && layoutValue !== null) {
            // Pre-fill value
            if (typeof layoutValue === 'string' || typeof layoutValue === 'number') {
              input.defaultValue = String(layoutValue);
            } else if (Array.isArray(layoutValue)) {
                input.defaultValue = layoutValue.join(', ');
            }

            // Flag as pre-filled so the UI can show the "Pre-filled" note
            input.isPrefilled = true;
          }
        }
      });
    }

    processedConfigs.push(feature);
  });

  return processedConfigs;
}
