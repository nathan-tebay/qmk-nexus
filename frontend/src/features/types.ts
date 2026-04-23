export interface KeyboardLayoutMeta {
  // LED counts
  rgbLedCount?: number;           // Total WS2812 underglow LEDs
  rgbMatrixLedCount?: number;     // Total per-key RGB matrix LEDs
  backlightLedCount?: number;

  // Encoder info
  encoderCount?: number;
  encoderPadA?: string[];         // e.g. ["B2", "F4"]
  encoderPadB?: string[];         // e.g. ["B3", "F5"]

  // Split info
  isSplit?: boolean;
  splitTransport?: 'serial' | 'i2c';
  softSerialPin?: string;
  splitI2cSda?: string;
  splitI2cScl?: string;
  splitMaster?: 'left' | 'right' | 'eeprom' | 'usb';

  // OLED info
  oledCount?: number;             // 0, 1, or 2 (split boards may have 2)
  oledDisplaySize?: '128x32' | '128x64';
  oledDriver?: 'ssd1306';
  oledI2cSda?: string;
  oledI2cScl?: string;

  // RGB pins
  rgbLightPin?: string;
  rgbMatrixDriver?: string;
  rgbMatrixPin?: string;
  rgbMatrixSda?: string;
  rgbMatrixScl?: string;

  // Backlight
  backlightPin?: string;

  // Audio
  audioPin?: string;

  // Features the layout explicitly requires
  requiredFeatures?: string[];    // Array of feature IDs, e.g. ["split", "oled", "encoder"]
}

export interface Warning {
  type: 'hardware' | 'info' | 'caution';
  message: string;
}

export interface FeatureInput {
  id: string;
  label: string;
  type: 'pin' | 'select' | 'number' | 'text';
  placeholder?: string;
  options?: { value: string; label: string }[];
  required: boolean;
  helpText?: string;
  defaultValue?: string;
  derivedFromLayout?: boolean;     // If true AND layout provides value: disable field
  layoutKey?: string;              // Key in KeyboardLayoutMeta to read from
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
  };
  conditionalOn?: {               // Show this input only when...
    field: string;                 // ...this sibling field's value...
    values: string[];              // ...is one of these values
  };
  repeatPerCount?: {               // For inputs that repeat per unit (e.g. per OLED)
    countField: string;            // Which field or layout key determines the count
    labelTemplate: string;         // e.g. "OLED {n} — I2C SDA Pin"
  };
}

export interface FeatureConfig {
  id: string;
  name: string;
  description: string;
  usagePercent: number;
  enabled: boolean;
  lockedOn: boolean;              // True if requiredFeatures includes this ID
  warnings?: Warning[];
  inputs?: FeatureInput[];
}
