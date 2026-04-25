import type { KeyboardConfig } from '@/store/keyboard'

export interface MatrixValidationResult {
  matrixOk: boolean
  ledOk: boolean
  errors: string[]
}

export function validateMatrices(config: KeyboardConfig): MatrixValidationResult {
  const edges = config.matrixEdges ?? []
  const errors: string[] = []

  const inRowEdge = new Set(edges.filter((e) => e.type === 'row').flatMap((e) => [e.from, e.to]))
  const inColEdge = new Set(edges.filter((e) => e.type === 'col').flatMap((e) => [e.from, e.to]))
  const inLedEdge = new Set(edges.filter((e) => e.type === 'led').flatMap((e) => [e.from, e.to]))

  const missingRow = config.keys.filter((k) => k.row === null && !inRowEdge.has(k.id))
  const missingCol = config.keys.filter((k) => k.col === null && !inColEdge.has(k.id))

  if (missingRow.length > 0) errors.push(`${missingRow.length} key${missingRow.length === 1 ? '' : 's'} missing row assignment`)
  if (missingCol.length > 0) errors.push(`${missingCol.length} key${missingCol.length === 1 ? '' : 's'} missing col assignment`)

  const matrixOk = missingRow.length === 0 && missingCol.length === 0

  const ledEnabled = !!config.features['rgb_matrix']
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
