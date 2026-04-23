import React, { useState, useEffect } from 'react';
import { FeatureConfig, KeyboardLayoutMeta } from '../../../features/types';
import { featureDefinitions } from '../../../features/featureDefinitions';
import { initializeFeatures } from '../../../features/layoutIntegration';

interface FeatureTogglePanelProps {
  layoutMeta: KeyboardLayoutMeta;
}

export const FeatureTogglePanel: React.FC<FeatureTogglePanelProps> = ({ layoutMeta }) => {
  const [features, setFeatures] =
    useState<FeatureConfig[]>(() => initializeFeatures(layoutMeta, featureDefinitions));

  useEffect(() => {
    setFeatures(initializeFeatures(layoutMeta, featureDefinitions));
  }, [layoutMeta]);

  const toggleFeature = (id: string) => {
    setFeatures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const updateInputValue = (featureId: string, inputId: string, value: string) => {
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.id === featureId && f.inputs) {
          return {
            ...f,
            inputs: f.inputs.map((i) =>
              i.id === inputId ? { ...i, defaultValue: value } : i
            ),
          };
        }
        return f;
      })
    );
  };

  const sortedFeatures = [...features].sort((a, b) => b.usagePercent - a.usagePercent);

  return (
    <div className="feature-toggle-panel">
      {sortedFeatures.map((feature) => (
        <FeatureCard
          key={feature.id}
          feature={feature}
          onToggle={() => toggleFeature(feature.id)}
          isLocked={feature.lockedOn}
          onInputChange={(inputId, value) => updateInputValue(feature.id, inputId, value)}
          layoutMeta={layoutMeta}
        />
      ))}
    </div>
  );
};

interface FeatureCardProps {
  feature: FeatureConfig;
  onToggle: () => void;
  isLocked: boolean;
  onInputChange: (inputId: string, value: string) => void;
  layoutMeta: KeyboardLayoutMeta;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  feature,
  onToggle,
  isLocked,
  onInputChange,
  layoutMeta,
}) => {
  const [isExpanded, setIsExpanded] = useState(feature.enabled);

  useEffect(() => {
    setIsExpanded(feature.enabled);
  }, [feature.enabled]);

  return (
    <div className={`feature-card ${feature.enabled ? 'expanded' : ''}`}>
      <div 
        className="feature-card-header" 
        onClick={() => !isLocked && onToggle()}
        style={{ cursor: isLocked ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
      >
        <input
          type="checkbox"
          checked={feature.enabled}
          disabled={isLocked}
          onChange={onToggle}
          aria-label={`${feature.name} toggle`}
        />
        <div className="feature-title-group" style={{ flexGrow: 1 }}>
          <span className="feature-name" style={{ fontWeight: 'bold' }}>{feature.name}</span>
          <span className="feature-usage" style={{ opacity: 0.7, fontSize: '0.85em', marginLeft: '8px' }}>
            {feature.usagePercent}% usage
          </span>
        </div>
        {isLocked && <span className="lock-icon" title="Required by your keyboard layout">🔒</span>}
      </div>

      <p className="feature-description" style={{ opacity: 0.8, margin: '4px 0' }}>{feature.description}</p>

      {feature.enabled && (
        <div className="feature-expanded-content" style={{ marginTop: '12px', paddingLeft: '24px' }}>
          {feature.warnings?.map((warning, idx) => (
            <div
              key={idx}
              className={`warning-banner warning-${warning.type}`}
              role="alert"
              style={{ 
                padding: '8px', 
                borderRadius: '4px', 
                marginBottom: '8px',
                backgroundColor: warning.type === 'hardware' ? '#fffbeb' : warning.type === 'caution' ? '#fef2f2' : '#eff6ff',
                borderLeft: `4px solid ${warning.type === 'hardware' ? '#f59e0b' : warning.type === 'caution' ? '#ef4444' : '#3b82f6'}`,
                fontSize: '0.9em'
              }}
            >
              <strong>⚠️</strong> {warning.message}
            </div>
          ))}

          {feature.inputs?.map((input) => (
            <FeatureInput
              key={input.id}
              input={input}
              layoutMeta={layoutMeta}
              onInputChange={onInputChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface FeatureInputProps {
  input: any;
  layoutMeta: KeyboardLayoutMeta;
  onInputChange: (id: string, val: string) => void;
}

const FeatureInput: React.FC<FeatureInputProps> = ({ input, layoutMeta, onInputChange }) => {
  const layoutValue = (layoutMeta as any)[input.layoutKey || ''];
  const isDerived = input.derivedFromLayout && layoutValue !== undefined;
  const isPrefilled = !isDerived && layoutValue !== undefined;

  return (
    <div className="feature-input-group" style={{ marginBottom: '12px' }}>
      <label htmlFor={input.id} className="feature-input-label" style={{ display: 'block', fontSize: '0.9em', fontWeight: 500 }}>
        {input.label}
      </label>

      {input.type === 'select' ? (
        <select
          id={input.id}
          disabled={isDerived}
          defaultValue={input.defaultValue || String(layoutValue || '')}
          onChange={(e) => onInputChange(input.id, e.target.value)}
          style={{ width: '100%', padding: '4px', marginTop: '4px' }}
        >
          {input.options?.map((opt: any) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={input.id}
          type={input.type === 'number' ? 'number' : 'text'}
          placeholder={input.placeholder}
          disabled={isDerived}
          defaultValue={input.defaultValue || String(layoutValue || '').replace('undefined', '')}
          onChange={(e) => onInputChange(input.id, e.target.value)}
          style={{ width: '100%', padding: '4px', marginTop: '4px' }}
        />
      )}

      {(isDerived || isPrefilled) && (
        <p className="layout-note" style={{ fontSize: '0.75em', opacity: 0.6, margin: '2px 0' }}>
          {isDerived ? 'Derived from keyboard layout' : 'Pre-filled from keyboard layout'}
        </p>
      )}

      {input.helpText && <p className="help-text" style={{ fontSize: '0.75em', opacity: 0.6, marginTop: '2px' }}>{input.helpText}</p>}
    </div>
  );
};
