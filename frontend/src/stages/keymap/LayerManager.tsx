import { useState } from 'react'
import type { Layer } from '@/store/keyboard'

interface Props {
  layers: Layer[]
  activeLayerId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onRename: (id: string, name: string) => void
}

export function LayerManager({ layers, activeLayerId, onSelect, onAdd, onRemove, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  function startEdit(id: string, name: string) {
    setEditingId(id)
    setEditingName(name)
  }

  function commitEdit() {
    if (editingId && editingName.trim()) onRename(editingId, editingName.trim())
    setEditingId(null)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 12px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
      {layers.map((layer) => {
        const isActive = layer.id === activeLayerId
        const isBase = layer.id === 'layer0'
        const isEditing = editingId === layer.id

        return (
          <div
            key={layer.id}
            onClick={() => onSelect(layer.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', cursor: 'pointer', borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`, color: isActive ? 'var(--accent)' : 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap', userSelect: 'none' }}
          >
            {isEditing ? (
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                onClick={(e) => e.stopPropagation()}
                style={{ width: 80, padding: '1px 4px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--text)' }}
              />
            ) : (
              <span onDoubleClick={(e) => { e.stopPropagation(); startEdit(layer.id, layer.name) }}>
                {layer.name}
              </span>
            )}
            {!isBase && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(layer.id) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: '0 2px', opacity: 0.6 }}
                title="Remove layer"
              >×</button>
            )}
          </div>
        )
      })}
      <button
        onClick={onAdd}
        style={{ padding: '6px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', margin: '0 4px', flexShrink: 0 }}
        title="Add layer"
      >+</button>
    </div>
  )
}
