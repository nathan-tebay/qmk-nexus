import React, { useState, useEffect, useCallback } from 'react'
import { useKeyboardStore } from '@/store/keyboard'
import { FeatureConfig, FeatureInput as FeatureInputType, KeyboardLayoutMeta } from '../../../features/types'
import { featureDefinitions } from '../../../features/featureDefinitions'
import { initializeFeatures } from '../../../features/layoutIntegration'
import type { Warning } from '../../../features/types'

const PIN_REGEX = /^[A-K]\d{1,2}$/i

const WARNING_ICONS: Record<Warning['type'], string> = {
  hardware: '🔧',
  info: 'ℹ️',
  caution: '⚠️',
}

const WARNING_COLORS: Record<Warning['type'], { bg: string; border: string }> = {
  hardware: { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b' },
  info:     { bg: 'rgba(209, 138, 0, 0.1)',  border: '#d18a00' },
  caution:  { bg: 'rgba(239, 68, 68, 0.1)',   border: '#ef4444' },
}

function WarningBanner({ warning }: { warning: Warning }) {
  const { bg, border } = WARNING_COLORS[warning.type]
  return (
    <div
      role="alert"
      className={`warning-banner warning-${warning.type}`}
      style={{ padding: '8px', borderRadius: '4px', marginBottom: '8px', backgroundColor: bg, borderLeft: `4px solid ${border}`, fontSize: '1.125em' }}
    >
      <strong>{WARNING_ICONS[warning.type]}</strong> {warning.message}
    </div>
  )
}

function validateInput(input: FeatureInputType, value: string, isDerived: boolean): string | null {
  if (isDerived || !value) return input.required && !isDerived ? 'Required' : null
  if (input.type === 'pin' && !PIN_REGEX.test(value)) return 'Invalid pin (e.g. B2, F4)'
  if (input.type === 'number') {
    const n = parseFloat(value)
    if (Number.isNaN(n)) return 'Must be a number'
    if (input.validation?.min !== undefined && n < input.validation.min) return `Min ${input.validation.min}`
    if (input.validation?.max !== undefined && n > input.validation.max) return `Max ${input.validation.max}`
  }
  return null
}

interface FeatureTogglePanelProps {
  layoutMeta: KeyboardLayoutMeta
}

export const FeatureTogglePanel: React.FC<FeatureTogglePanelProps> = ({ layoutMeta }) => {
  const config = useKeyboardStore((s) => s.config)
  const toggleFeature = useKeyboardStore((s) => s.toggleFeature)
  const setFeatureInputValue = useKeyboardStore((s) => s.setFeatureInputValue)

  const [features, setFeatures] = useState<FeatureConfig[]>(() =>
    initializeFeatures(layoutMeta, featureDefinitions)
  )

  useEffect(() => {
    setFeatures(
      initializeFeatures(layoutMeta, featureDefinitions).map((def) => ({
        ...def,
        enabled: config.features[def.id] ?? def.enabled,
      }))
    )
  }, [layoutMeta, config.features])

  const handleToggle = (id: string) => {
    toggleFeature(id)
    setFeatures((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)))
  }

  const sortedFeatures = [...features].sort((a, b) => b.usagePercent - a.usagePercent)

  return (
    <div className="feature-toggle-panel">
      {sortedFeatures.map((feature) => {
        const storedValues = config.featureInputValues[feature.id] ?? {}
        return (
          <FeatureCard
            key={feature.id}
            feature={feature}
            onToggle={() => handleToggle(feature.id)}
            storedValues={storedValues}
            onInputChange={(inputId, value) => setFeatureInputValue(feature.id, inputId, value)}
            layoutMeta={layoutMeta}
          />
        )
      })}
    </div>
  )
}

interface FeatureCardProps {
  feature: FeatureConfig
  onToggle: () => void
  storedValues: Record<string, string>
  onInputChange: (inputId: string, value: string) => void
  layoutMeta: KeyboardLayoutMeta
}

interface ExpandedInput {
  input: FeatureInputType
  renderId: string
  renderLabel: string
}

function expandInputs(
  inputs: FeatureInputType[],
  siblingValues: Record<string, string>,
  isSplit: boolean
): ExpandedInput[] {
  const result: ExpandedInput[] = []
  for (const input of inputs) {
    if (!input.repeatPerCount) {
      result.push({ input, renderId: input.id, renderLabel: input.label })
      continue
    }
    const countStr = siblingValues[input.repeatPerCount.countField] ?? '1'
    const count = Math.max(1, Math.min(parseInt(countStr, 10) || 1, 8))
    for (let n = 1; n <= count; n++) {
      let label: string
      if (count === 1) {
        label = input.label
      } else if (isSplit && count === 2) {
        label = input.repeatPerCount.labelTemplate.replace('{n}', n === 1 ? 'Left Half' : 'Right Half')
      } else {
        label = input.repeatPerCount.labelTemplate.replace('{n}', String(n))
      }
      result.push({
        input,
        renderId: count === 1 ? input.id : `${input.id}_${n}`,
        renderLabel: label,
      })
    }
  }
  return result
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  feature,
  onToggle,
  storedValues,
  onInputChange,
  layoutMeta,
}) => {
  // Build sibling value map: inputId → current value (stored > layout-prefilled default)
  const siblingValues: Record<string, string> = {}
  feature.inputs?.forEach((inp) => {
    siblingValues[inp.id] = storedValues[inp.id] ?? inp.defaultValue ?? ''
  })

  const expandedInputs = expandInputs(feature.inputs ?? [], siblingValues, !!layoutMeta.isSplit)

  return (
    <div className={`feature-card ${feature.enabled ? 'expanded' : ''}`}>
      <div
        className="feature-card-header"
        style={{ cursor: feature.lockedOn ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
      >
        <input
          type="checkbox"
          checked={feature.enabled}
          disabled={feature.lockedOn}
          aria-disabled={feature.lockedOn}
          aria-label={
            feature.lockedOn
              ? `${feature.name} (required by keyboard layout)`
              : `${feature.name} toggle`
          }
          title={feature.lockedOn ? 'Required by your keyboard layout — cannot be disabled' : undefined}
          onChange={(e) => { e.stopPropagation(); onToggle() }}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="feature-title-group" style={{ flexGrow: 1 }}>
          <span className="feature-name" style={{ fontWeight: 'bold' }}>{feature.name}</span>
          <span className="feature-usage" style={{ opacity: 0.7, fontSize: '1.0625em', marginLeft: '8px' }}>
            {feature.usagePercent}% usage
          </span>
        </div>
        {feature.lockedOn && (
          <div className="lock-container" title="Required by your keyboard layout">
            <span style={{ fontSize: '1.5em' }}>🔒</span>
          </div>
        )}
      </div>

      <p className="feature-description" style={{ opacity: 0.8, margin: '4px 0' }}>
        {feature.description}
      </p>

      {feature.enabled && (
        <div className="feature-expanded-content" style={{ marginTop: '12px', paddingLeft: '24px' }}>
          {feature.warnings?.map((warning, idx) => (
            <WarningBanner key={idx} warning={warning} />
          ))}

          {expandedInputs.map(({ input, renderId, renderLabel }) => (
            <FeatureInputField
              key={renderId}
              input={input}
              renderId={renderId}
              renderLabel={renderLabel}
              layoutMeta={layoutMeta}
              storedValue={storedValues[renderId]}
              siblingValues={siblingValues}
              onInputChange={onInputChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface FeatureInputFieldProps {
  input: FeatureInputType
  renderId: string
  renderLabel: string
  layoutMeta: KeyboardLayoutMeta
  storedValue: string | undefined
  siblingValues: Record<string, string>
  onInputChange: (id: string, val: string) => void
}

const FeatureInputField: React.FC<FeatureInputFieldProps> = ({
  input,
  renderId,
  renderLabel,
  layoutMeta,
  storedValue,
  siblingValues,
  onInputChange,
}) => {
  // Conditional visibility: check sibling field value (not layoutMeta)
  const depValue = input.conditionalOn ? siblingValues[input.conditionalOn.field] ?? '' : ''
  const isHidden = !!input.conditionalOn && !input.conditionalOn.values.includes(depValue)

  const layoutValue = input.layoutKey ? (layoutMeta as Record<string, unknown>)[input.layoutKey] : undefined
  const isDerived = !!input.derivedFromLayout && layoutValue !== undefined
  const isPrefilled = !isDerived && layoutValue !== undefined

  const currentValue =
    storedValue ?? input.defaultValue ?? (layoutValue !== undefined ? String(layoutValue) : '')

  const [error, setError] = useState<string | null>(() => validateInput(input, currentValue, isDerived))

  const handleChange = useCallback((value: string) => {
    setError(validateInput(input, value, isDerived))
    onInputChange(renderId, value)
  }, [input, isDerived, renderId, onInputChange])

  const helpId = `${renderId}-help`
  const errorId = `${renderId}-error`
  const describedBy = [helpId, error ? errorId : ''].filter(Boolean).join(' ')

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px',
    marginTop: '4px',
    borderColor: error ? '#ef4444' : undefined,
    outline: error ? '1px solid #ef4444' : undefined,
  }

  if (isHidden) return null

  return (
    <div className="feature-input-group" style={{ marginBottom: '12px' }}>
      <label htmlFor={renderId} className="feature-input-label" style={{ display: 'block', fontSize: '1.125em', fontWeight: 500 }}>
        {renderLabel}{input.required && !isDerived && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>

      {input.type === 'select' ? (
        <select
          id={renderId}
          disabled={isDerived}
          aria-disabled={isDerived}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          value={currentValue}
          onChange={(e) => { e.stopPropagation(); handleChange(e.target.value) }}
          style={inputStyle}
        >
          {input.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          id={renderId}
          type={input.type === 'number' ? 'number' : 'text'}
          disabled={isDerived}
          aria-disabled={isDerived}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          value={currentValue}
          placeholder={input.placeholder}
          min={input.validation?.min}
          max={input.validation?.max}
          onChange={(e) => { e.stopPropagation(); handleChange(e.target.value) }}
          style={inputStyle}
        />
      )}

      {error && (
        <p id={errorId} role="alert" style={{ fontSize: '0.9375em', color: '#ef4444', margin: '2px 0' }}>
          {error}
        </p>
      )}

      <div id={helpId}>
        {isDerived && (
          <p style={{ fontSize: '0.9375em', opacity: 0.6, margin: '2px 0', color: '#ef4444' }}>
            Derived from keyboard layout — read only
          </p>
        )}
        {isPrefilled && !isDerived && (
          <p style={{ fontSize: '0.9375em', opacity: 0.6, margin: '2px 0' }}>
            Pre-filled from keyboard layout
          </p>
        )}
        {input.helpText && (
          <p style={{ fontSize: '0.9375em', opacity: 0.6, marginTop: '2px' }}>{input.helpText}</p>
        )}
      </div>
    </div>
  )
}
