import type { KeyboardConfig } from '@/store/keyboard'

export interface MatrixValidationResult {
  matrixOk: boolean
  ledOk: boolean
  errors: string[]
}

export function validateMatrices(config: KeyboardConfig): MatrixValidationResult {
  // Both qmk_native and qmk_json compile against upstream QMK files that already
  // own the matrix/pin definition — client-side wiring validation does not apply.
  if (config.sourceMode === 'qmk_native' || config.sourceMode === 'qmk_json') {
    return { matrixOk: true, ledOk: true, errors: [] }
  }

  const edges = config.matrixEdges ?? []
  const errors: string[] = []
  const isSingleKeyDirect = config.keys.length === 1 && config.keys[0].row === null && config.keys[0].col === null

  const inRowEdge = new Set(edges.filter((e) => e.type === 'row').flatMap((e) => [e.from, e.to]))
  const inColEdge = new Set(edges.filter((e) => e.type === 'col').flatMap((e) => [e.from, e.to]))
  const inLedEdge = new Set(edges.filter((e) => e.type === 'led').flatMap((e) => [e.from, e.to]))

  const missingRow = config.keys.filter((k) => k.row === null && !inRowEdge.has(k.id))
  const missingCol = config.keys.filter((k) => k.col === null && !inColEdge.has(k.id))

  if (!isSingleKeyDirect && missingRow.length > 0) errors.push(`${missingRow.length} key${missingRow.length === 1 ? '' : 's'} missing row assignment`)
  if (!isSingleKeyDirect && missingCol.length > 0) errors.push(`${missingCol.length} key${missingCol.length === 1 ? '' : 's'} missing col assignment`)

  const hasSingleRowPin = !!config.rowPins.find((p) => p.row === 0)?.pin.trim()
  const hasSingleColPin = !!config.colPins.find((p) => p.col === 0)?.pin.trim()
  if (isSingleKeyDirect && (!hasSingleRowPin || !hasSingleColPin)) {
    errors.push('Single-key keyboards require row pin 0 and column pin 0')
  }

  const rowValues = config.keys
    .map((k) => k.row)
    .filter((row): row is number => row !== null)
  const colValues = config.keys
    .map((k) => k.col)
    .filter((col): col is number => col !== null)
  const rowCount = rowValues.length > 0 ? Math.max(...rowValues) + 1 : 0
  const colCount = colValues.length > 0 ? Math.max(...colValues) + 1 : 0
  const splitEnabled = !!config.features['split_keyboard']
  const expectedRowCount = splitEnabled && rowCount % 2 === 0 && config.rowPins.length < rowCount
    ? rowCount / 2
    : rowCount
  const expectedColCount = splitEnabled && colCount % 2 === 0 && config.colPins.length < colCount
    ? colCount / 2
    : colCount
  const assignedRows = new Set(config.rowPins.filter((p) => p.pin.trim()).map((p) => p.row))
  const assignedCols = new Set(config.colPins.filter((p) => p.pin.trim()).map((p) => p.col))
  const missingRowPins = Array.from({ length: expectedRowCount }, (_, row) => row).filter((row) => !assignedRows.has(row))
  const missingColPins = Array.from({ length: expectedColCount }, (_, col) => col).filter((col) => !assignedCols.has(col))

  if (!isSingleKeyDirect && missingRowPins.length > 0) {
    errors.push(`Matrix row pins missing assignments: ${missingRowPins.join(', ')}`)
  }
  if (!isSingleKeyDirect && missingColPins.length > 0) {
    errors.push(`Matrix column pins missing assignments: ${missingColPins.join(', ')}`)
  }

  const matrixOk = isSingleKeyDirect
    ? hasSingleRowPin && hasSingleColPin
    : missingRow.length === 0 && missingCol.length === 0 && missingRowPins.length === 0 && missingColPins.length === 0

  const ledEnabled = !!config.features['rgb_matrix'] || !!config.features['rgblight']
  let ledOk = true

  if (ledEnabled) {
    const missingLed = config.keys.filter((k) => k.ledIndex === null && !inLedEdge.has(k.id))
    if (missingLed.length > 0) {
      errors.push(`${missingLed.length} key${missingLed.length === 1 ? '' : 's'} missing LED index`)
      ledOk = false
    }
  }

  return { matrixOk, ledOk, errors }
}
