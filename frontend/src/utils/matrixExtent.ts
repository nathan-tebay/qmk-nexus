import type { KeyDef } from '@/store/keyboard'

export function matrixExtent(keys: KeyDef[], field: 'row' | 'col'): number {
  return matrixExtentOrNull(keys, field) ?? 0
}

export function matrixExtentOrNull(keys: KeyDef[], field: 'row' | 'col'): number | null {
  const values = keys
    .map((key) => key[field])
    .filter((value): value is number => value !== null)
  return values.length ? Math.max(...values) + 1 : null
}
