import { firmwareExtension } from './firmwareExtension'

function filenameBase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'keyboard'
}

export function buildFilename(name: string, configHash: string | null | undefined, mcu: string | null | undefined): string {
  const ext = mcu ? firmwareExtension(mcu) : 'hex'
  const hash = configHash?.slice(0, 8) ?? ''
  const base = filenameBase(name || 'keyboard')
  return hash ? `${base}_${hash}.${ext}` : `${base}.${ext}`
}
