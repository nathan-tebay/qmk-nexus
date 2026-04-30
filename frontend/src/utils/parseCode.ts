import { keycodeMap } from '@/stages/keymap/keycodes'

export interface ParsedCode {
  tap: string
  hold?: string
}

export function parseAssignedCode(code: string): ParsedCode {
  if (!code || code === 'KC_TRNS' || code === '_______') return { tap: '____' }
  if (code === 'KC_NO' || code === 'XXXXXXX') return { tap: '' }

  const mt = code.match(/^MT\(([^,]+),\s*(.+)\)$/)
  if (mt) {
    const bits = mt[1].trim()
    const tap = keycodeMap.get(mt[2].trim())?.label ?? mt[2].trim().replace(/^KC_/, '')
    const holdParts = bits.split('|').map((b) => b.trim())
    const modLabels: Record<string, string> = {
      MOD_LSFT: 'Sft', MOD_LCTL: 'Ctl', MOD_LALT: 'Alt', MOD_LGUI: 'OS',
    }
    const hold = holdParts.map((b) => modLabels[b] ?? b).join('+')
    return { tap, hold: `${hold}↓` }
  }
  const lt = code.match(/^LT\((\d+),\s*(.+)\)$/)
  if (lt) {
    const layer = lt[1]
    const tap = keycodeMap.get(lt[2].trim())?.label ?? lt[2].trim().replace(/^KC_/, '')
    return { tap, hold: `L${layer}↓` }
  }
  const kc = keycodeMap.get(code)
  return { tap: kc?.label ?? code.replace(/^KC_/, '').slice(0, 8) }
}
