import { KeyboardLayoutMeta, FeatureConfig } from './types';

export function initializeFeatures(layoutMeta: KeyboardLayoutMeta, currentConfigs: FeatureConfig[]): FeatureConfig[] {
  // Deep clone to avoid mutating the original definitions
  const newConfigs = JSON.parse(JSON.stringify(currentConfigs)) as FeatureConfig[];

  // 1. Pre-calculate required features set for O(1) lookup
  const requiredIds = new Set(layoutMeta.requiredFeatures || []);

  // 2. Apply rules: Auto-enable, Lock, and Pre-fill
  newConfigs.forEach((feature) => {
    // Check if this feature is explicitly required by layout
    if (requiredIds.has(feature.id)) {
      feature.enabled = true;
      feature.lockedOn = true;
    }

    // 3. Inference Rules: Auto-enable based on hardware presence
    // Note: We only lock if it's a physical property like encoderCount or isSplit
    if (feature.id === 'split' && layoutMeta.isSplit) {
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
                // For things like encoderPadA, we might want the first one or a joined string
                input.defaultValue = layoutValue.join(', ');
            }

            // Handle derived/disabled logic
            if (input.derivedFromLayout) {
              // We use a special convention for "disabled" in the UI, 
              // but here we just ensure the value is set.
              // The component will check 'derivedFromLayout' and 'layoutKey' presence.
            }
          }
        }
      });
    }
  });

  return newConfigs;
}
