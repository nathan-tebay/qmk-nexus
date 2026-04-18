import { useEffect, useState, useMemo } from 'react'
import { KEYCODES, CATEGORIES } from './keycodes'

interface Props {
  onSelect: (code: string) => void
  onClose: () => void
  currentCode?: string
}

export function KeycodePicker({ onSelect, onClose, currentCode }: Props) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return KEYCODES.filter((k) => {
      const matchSearch = !q || k.code.toLowerCase().includes(q) || k.label.toLowerCase().includes(q)
      const matchCat = activeCategory === 'all' || k.category === activeCategory
      return matchSearch && matchCat
    })
  }, [search, activeCategory])

  function handleChip(code: string) { onSelect(code); onClose() }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div style={{ width: 620, height: 500, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Assign Keycode</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            autoFocus
            placeholder="Search keycodes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 13 }}
          />
        </div>

        {/* Category filters */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
          {[{ id: 'all', label: 'All' }, ...CATEGORIES].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, border: '1px solid var(--border)', background: activeCategory === cat.id ? 'var(--accent)' : 'var(--bg-elevated)', color: activeCategory === cat.id ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6, alignContent: 'start' }}>
          {filtered.map((k) => (
            <button
              key={k.code}
              title={`${k.code}${k.description ? ` — ${k.description}` : ''}`}
              onClick={() => handleChip(k.code)}
              style={{ padding: '8px 4px', textAlign: 'center', borderRadius: 4, background: 'var(--bg-elevated)', border: `${currentCode === k.code ? 2 : 1}px solid ${currentCode === k.code ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text)', cursor: 'pointer', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {k.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <span style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 24 }}>No keycodes match</span>
          )}
        </div>
      </div>
    </div>
  )
}
