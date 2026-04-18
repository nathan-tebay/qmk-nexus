import { FEATURE_MODULES, incompatMap } from './modules'

interface Props {
  features: Record<string, boolean>
  onToggle: (id: string) => void
}

export function FeatureToggles({ features, onToggle }: Props) {
  function isDisabled(id: string): boolean {
    const incompat = incompatMap.get(id)
    if (!incompat) return false
    return [...incompat].some((dep) => features[dep])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {FEATURE_MODULES.map((mod) => {
        const enabled = !!features[mod.id]
        const disabled = !enabled && isDisabled(mod.id)
        return (
          <div
            key={mod.id}
            onClick={() => !disabled && onToggle(mod.id)}
            title={disabled ? `Incompatible with: ${mod.incompatibleWith.join(', ')}` : mod.description}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1, background: enabled ? 'rgba(79,142,247,0.08)' : 'transparent', transition: 'background 0.15s' }}
          >
            {/* Toggle pill */}
            <div style={{ width: 32, height: 18, borderRadius: 9, background: enabled ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: 2, left: enabled ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: enabled ? 'var(--text)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {mod.name}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.6 }}>
                  {(mod.qmkPrevalence * 100).toFixed(0)}% of keyboards
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {mod.description}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
