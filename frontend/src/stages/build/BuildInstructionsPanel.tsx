import { useState } from 'react'
import { keyboardsApi } from '@/api/keyboards'
import type { KeyboardConfig, KeyDef, MatrixEdge } from '@/store/keyboard'
import styles from './BuildInstructionsPanel.module.css'

interface Props {
  config: KeyboardConfig
  enabledFeatures: string[]
  keyboardId: string | null
  onSaveFirst: () => Promise<string | null>
}

function filenameBase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'keyboard'
}

function labelForKey(key: KeyDef, index: number): string {
  return key.label?.trim() || `K${index + 1}`
}

function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printHtml(filename: string, html: string) {
  const opened = window.open('', '_blank', 'noopener,noreferrer')
  if (!opened) {
    downloadText(filename, html, 'text/html;charset=utf-8')
    return
  }
  opened.document.write(html)
  opened.document.close()
  opened.focus()
  opened.print()
}

function sortedKeys(keys: KeyDef[]): KeyDef[] {
  return [...keys].sort((a, b) => a.y - b.y || a.x - b.x)
}

function matrixExtent(keys: KeyDef[], field: 'row' | 'col'): number {
  const values = keys.map((key) => key[field]).filter((value): value is number => value !== null)
  return values.length ? Math.max(...values) + 1 : 0
}

function edgeList(edges: MatrixEdge[], type: MatrixEdge['type'], keysById: Map<string, KeyDef>): string[] {
  return edges
    .filter((edge) => edge.type === type)
    .map((edge) => {
      const from = keysById.get(edge.from)
      const to = keysById.get(edge.to)
      return `- ${from?.label || edge.from} -> ${to?.label || edge.to}`
    })
}

function makeBom(config: KeyboardConfig): string[] {
  const switchCount = config.keys.length
  const diodeCount = switchCount > 1 ? switchCount : 0
  const rows = matrixExtent(config.keys, 'row')
  const cols = matrixExtent(config.keys, 'col')
  const featureConfigs = config.featureConfigs
  const bom = [
    `| Qty | Item | Notes |`,
    `| ---: | --- | --- |`,
    `| ${switchCount} | MX-compatible switches | Match PCB footprint and plate choice. |`,
    `| ${switchCount} | Keycaps | Match layout units and stabilizer sizes. |`,
  ]

  if (diodeCount > 0) {
    bom.push(`| ${diodeCount} | 1N4148 diodes | One per switch for NKRO and ghosting prevention. |`)
  }
  bom.push(`| 1 | MCU/controller | ${config.mcu}; expose USB, reset, VCC, GND, row and column nets. |`)
  if (rows) bom.push(`| ${rows} | Row nets | Route to configured row pins. |`)
  if (cols) bom.push(`| ${cols} | Column nets | Route to configured column pins. |`)

  if (config.features.rgb_matrix || config.features.rgblight) {
    const count = featureConfigs.rgb_matrix?.RGB_MATRIX_LED_COUNT || featureConfigs.rgblight?.RGBLIGHT_LED_COUNT || `${switchCount}`
    bom.push(`| ${count} | Addressable RGB LEDs | Confirm WS2812/SK6812 or driver-specific footprint before ordering. |`)
  }
  if (config.features.encoder && config.encoders.length) {
    bom.push(`| ${config.encoders.length} | Rotary encoders | Match shaft height, detent type, and optional switch footprint. |`)
  }
  if (config.features.oled && config.oleds.length) {
    bom.push(`| ${config.oleds.length} | OLED modules | Match display size, voltage, and I2C pinout. |`)
  }
  if (config.trackballs.length) {
    bom.push(`| ${config.trackballs.length} | Trackball module(s) | Match selected driver footprint and breakout pinout. |`)
  }
  if (config.features.split_keyboard) {
    bom.push(`| 2 | TRRS, USB-C, or board-to-board connectors | Match split transport and protect against miswired cables. |`)
  }
  bom.push(`| As needed | Stabilizers, sockets, reset switch, ESD protection, mounting hardware | Confirm clearances in CAD before fabrication. |`)
  return bom
}

function makeMarkdown(config: KeyboardConfig, enabledFeatures: string[]): string {
  const keys = sortedKeys(config.keys)
  const keysById = new Map(config.keys.map((key) => [key.id, key]))
  const rowPins = [...config.rowPins].sort((a, b) => a.row - b.row)
  const colPins = [...config.colPins].sort((a, b) => a.col - b.col)
  const keyboardPath = config.sourceMode === 'qmk_native'
    ? config.upstreamKeyboard || '(upstream keyboard path not set)'
    : `custom/${filenameBase(config.name)}`
  const lines: string[] = [
    `# ${config.name || 'Keyboard'} Build Packet`,
    '',
    '## Keyboard Metadata',
    '',
    `- Manufacturer: ${config.manufacturer || 'Unspecified'}`,
    `- MCU: ${config.mcu}`,
    `- USB VID: ${config.usbVid}`,
    `- USB PID: ${config.usbPid}`,
    `- QMK target: ${keyboardPath}`,
    `- Layout macro: ${config.layoutMacro || 'LAYOUT'}`,
    `- Source mode: ${config.sourceMode}`,
    `- Enabled features: ${enabledFeatures.length ? enabledFeatures.join(', ') : 'None'}`,
    '',
    '## Hardware BOM',
    '',
    ...makeBom(config),
    '',
    '## Soldering Notes',
    '',
    '1. Solder diodes first. Align every diode stripe to the same diode direction used by firmware.',
    '2. Solder hotswap sockets or switch pins after confirming the plate and PCB footprints match.',
    '3. Solder the controller, reset switch, USB connector, and power components.',
    '4. Solder optional peripherals after validating VCC/GND orientation and signal pins.',
    '5. Before inserting switches, test continuity for each row, column, VCC, and GND net.',
    '6. Flash a matrix test firmware before final case assembly.',
    '',
    '## Matrix Pinout',
    '',
    '| Matrix | Pin |',
    '| --- | --- |',
    ...rowPins.map((pin) => `| Row ${pin.row} | ${pin.pin || 'Unassigned'} |`),
    ...colPins.map((pin) => `| Column ${pin.col} | ${pin.pin || 'Unassigned'} |`),
    '',
    '## Wiring Layout',
    '',
    '| Key | Row | Column | X | Y | W | H | LED |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...keys.map((key, index) => (
      `| ${labelForKey(key, index)} | ${key.row ?? ''} | ${key.col ?? ''} | ${key.x} | ${key.y} | ${key.w} | ${key.h} | ${key.ledIndex ?? ''} |`
    )),
    '',
    '## Matrix Edge Routing',
    '',
    '### Rows',
    '',
    ...(edgeList(config.matrixEdges, 'row', keysById).length ? edgeList(config.matrixEdges, 'row', keysById) : ['- No row edges recorded.']),
    '',
    '### Columns',
    '',
    ...(edgeList(config.matrixEdges, 'col', keysById).length ? edgeList(config.matrixEdges, 'col', keysById) : ['- No column edges recorded.']),
    '',
    '### LEDs',
    '',
    ...(edgeList(config.matrixEdges, 'led', keysById).length ? edgeList(config.matrixEdges, 'led', keysById) : ['- No LED chain edges recorded.']),
    '',
    '## Keymap',
    '',
  ]

  for (const layer of config.layers) {
    lines.push(`### ${layer.name}`)
    lines.push('')
    lines.push('| Key | Keycode |')
    lines.push('| --- | --- |')
    for (const [index, key] of keys.entries()) {
      lines.push(`| ${labelForKey(key, index)} | ${layer.keycodes[key.id] || 'KC_TRNS'} |`)
    }
    lines.push('')
  }

  lines.push(
    '## PCBWay Fabrication Handoff',
    '',
    'Provide these files to the PCB fabricator after recreating the schematic and PCB in KiCad or equivalent CAD:',
    '',
    '- Gerber files for copper, mask, paste, silkscreen, and board outline layers.',
    '- Excellon drill files.',
    '- Board stackup, thickness, copper weight, solder mask color, and finish.',
    '- Pick-and-place/CPL file if assembly is requested.',
    '- BOM with exact manufacturer part numbers for assembly.',
    '- Netlist generated from the matrix pinout and wiring layout above.',
    '- Assembly drawing showing switch, diode, controller, connector, LED, encoder, OLED, and mounting positions.',
    '',
    '## Schematic Checklist',
    '',
    '- One switch per key between its row and column net.',
    '- One diode per switch if using a keyboard matrix.',
    '- MCU row and column pins match the matrix pinout above.',
    '- USB D+/D-, VBUS, GND, CC resistors, ESD protection, reset, boot, and decoupling match the selected MCU reference design.',
    '- Optional peripherals are routed to their configured pins and voltage domains.',
    '- Split keyboards include transport, connector pinout, and protection notes.',
    ''
  )

  return lines.join('\n')
}

function makeCsv(config: KeyboardConfig): string {
  const keys = sortedKeys(config.keys)
  const rows = config.rowPins.reduce<Record<number, string>>((acc, pin) => ({ ...acc, [pin.row]: pin.pin }), {})
  const cols = config.colPins.reduce<Record<number, string>>((acc, pin) => ({ ...acc, [pin.col]: pin.pin }), {})
  const lines = ['ref,label,row,row_pin,col,col_pin,x,y,w,h,led_index']
  keys.forEach((key, index) => {
    lines.push([
      `K${index + 1}`,
      JSON.stringify(labelForKey(key, index)),
      key.row ?? '',
      key.row !== null ? rows[key.row] || '' : '',
      key.col ?? '',
      key.col !== null ? cols[key.col] || '' : '',
      key.x,
      key.y,
      key.w,
      key.h,
      key.ledIndex ?? '',
    ].join(','))
  })
  return lines.join('\n')
}

function makePrintableLayoutHtml(config: KeyboardConfig): string {
  const keys = sortedKeys(config.keys)
  const maxX = Math.max(1, ...keys.map((key) => key.x + key.w))
  const maxY = Math.max(1, ...keys.map((key) => key.y + key.h))
  const widthPx = Math.max(720, Math.ceil(maxX * 54))
  const heightPx = Math.max(180, Math.ceil(maxY * 54))

  const layerSections = config.layers.map((layer) => {
    const keyBlocks = keys.map((key, index) => {
      const x = (key.x / maxX) * 100
      const y = (key.y / maxY) * 100
      const w = (key.w / maxX) * 100
      const h = (key.h / maxY) * 100
      const code = layer.keycodes[key.id] || 'KC_TRNS'
      return `
        <div class="key" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;">
          <div class="key-label">${htmlEscape(labelForKey(key, index))}</div>
          <div class="key-code">${htmlEscape(code)}</div>
        </div>`
    }).join('')

    return `
      <section class="layer">
        <h2>${htmlEscape(layer.name)}</h2>
        <div class="layout" style="width:${widthPx}px;height:${heightPx}px;">
          ${keyBlocks}
        </div>
      </section>`
  }).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(config.name || 'Keyboard')} Layer Layout</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 24px; color: #111; font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    h2 { margin: 24px 0 10px; font-size: 16px; break-after: avoid; }
    .meta { margin-bottom: 18px; color: #555; }
    .layer { break-inside: avoid; page-break-inside: avoid; }
    .layout { position: relative; max-width: 100%; border: 1px solid #aaa; background: #fafafa; overflow: hidden; }
    .key { position: absolute; padding: 3px; border: 1px solid #333; border-radius: 4px; background: white; overflow: hidden; }
    .key-label { font-size: 9px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .key-code { margin-top: 2px; font-size: 10px; font-weight: 700; overflow-wrap: anywhere; }
    @page { size: landscape; margin: 12mm; }
    @media print {
      body { margin: 0; }
      .layer { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${htmlEscape(config.name || 'Keyboard')} Layer Layout</h1>
  <div class="meta">
    ${htmlEscape(config.manufacturer || 'Unspecified manufacturer')} · ${htmlEscape(config.mcu)} · ${config.keys.length} keys · ${config.layers.length} layers
  </div>
  ${layerSections}
</body>
</html>`
}

export function BuildInstructionsPanel({ config, enabledFeatures, keyboardId, onSaveFirst }: Props) {
  const base = filenameBase(config.name)
  const keyboardSlug = base || 'my_keyboard'
  const isNativeQmk = config.sourceMode === 'qmk_native'
  const upstreamKeyboard = config.upstreamKeyboard || keyboardSlug
  const [showSourcesModal, setShowSourcesModal] = useState(false)
  const [downloadingSources, setDownloadingSources] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function downloadQmkSources() {
    setDownloadingSources(true)
    setError(null)
    try {
      let id = keyboardId
      if (!id) {
        id = await onSaveFirst()
        if (!id) return
      }
      await keyboardsApi.downloadSources(id, `${base}_qmk_sources.zip`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Source download failed')
    } finally {
      setDownloadingSources(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Build Instructions</div>
          <div className={styles.subtitle}>Assembly, BOM, keymap, wiring, and PCB fabrication handoff</div>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.primary}
          onClick={() => downloadText(`${base}_build_packet.md`, makeMarkdown(config, enabledFeatures), 'text/markdown;charset=utf-8')}
          title="Download assembly notes, BOM, keymap, wiring layout, and PCB fabrication checklist"
          aria-label="Download build packet"
        >
          Download Build Packet
        </button>
        <button
          className={styles.primary}
          onClick={() => printHtml(`${base}_layer_layout.html`, makePrintableLayoutHtml(config))}
          title="Open a printable view of the physical keyboard layout with every layer's keycodes"
          aria-label="Print all layer layouts"
        >
          Print Layer Layout
        </button>
        <button
          className={styles.primary}
          onClick={() => downloadText(`${base}_matrix_netlist.csv`, makeCsv(config), 'text/csv;charset=utf-8')}
          title="Download a CSV matrix netlist for schematic and PCB layout work"
          aria-label="Download matrix netlist CSV"
        >
          Download Netlist CSV
        </button>
        <button
          className={styles.primary}
          onClick={() => setShowSourcesModal(true)}
          title="Show QMK source export and local QMK build instructions"
          aria-label="Download QMK files"
        >
          Download QMK Files
        </button>
      </div>
      {error && <div className={styles.error}>{error}</div>}

      {showSourcesModal && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowSourcesModal(false) }}>
          <div className={styles.sourcesModal} role="dialog" aria-modal="true" aria-labelledby="qmk-sources-title">
            <div className={styles.modalHeader}>
              <h2 id="qmk-sources-title">Build In QMK_firmware</h2>
              <button
                className={styles.modalClose}
                onClick={() => setShowSourcesModal(false)}
                title="Close QMK source instructions"
                aria-label="Close QMK source instructions"
              >x</button>
            </div>
            <div className={styles.modalBody}>
              {isNativeQmk ? (
                <>
                  <p>
                    Download the QMK-native overlay, then apply it to a local QMK_firmware checkout.
                  </p>
                  <ol>
                    <li>Clone and set up QMK_firmware.</li>
                    <li>Unzip the generated archive.</li>
                    <li>Copy the contents of <code>upstream_overlay/</code> into the QMK_firmware root.</li>
                    <li>Copy <code>keymap.c</code> into <code>keyboards/{upstreamKeyboard}/keymaps/nexus/</code>.</li>
                    <li>Compile or flash the upstream keyboard with the <code>nexus</code> keymap.</li>
                  </ol>
                  <pre className={styles.commandBlock}>{`git clone https://github.com/qmk/qmk_firmware.git
cd qmk_firmware
qmk setup
# unzip the generated files outside this checkout, then copy:
# upstream_overlay/* -> ./
mkdir -p keyboards/${upstreamKeyboard}/keymaps/nexus
# keymap.c -> keyboards/${upstreamKeyboard}/keymaps/nexus/keymap.c
qmk compile -kb ${upstreamKeyboard} -km nexus
qmk flash -kb ${upstreamKeyboard} -km nexus`}</pre>
                </>
              ) : (
                <>
                  <p>
                    Download the generated QMK source files, then add them as a custom keyboard in a local QMK_firmware checkout.
                  </p>
                  <ol>
                    <li>Clone and set up QMK_firmware.</li>
                    <li>Create a keyboard folder such as <code>keyboards/custom/{keyboardSlug}</code>.</li>
                    <li>Copy <code>config.h</code>, <code>rules.mk</code>, <code>info.json</code>, <code>keyboard.c</code>, and <code>keyboard.h</code> into that folder.</li>
                    <li>Create <code>keymaps/default/</code> inside the keyboard folder and move <code>keymap.c</code> there.</li>
                    <li>Compile or flash with the QMK commands below.</li>
                  </ol>
                  <pre className={styles.commandBlock}>{`git clone https://github.com/qmk/qmk_firmware.git
cd qmk_firmware
qmk setup
mkdir -p keyboards/custom/${keyboardSlug}/keymaps/default
# unzip the generated files, then copy:
# config.h rules.mk info.json keyboard.c keyboard.h -> keyboards/custom/${keyboardSlug}/
# keymap.c -> keyboards/custom/${keyboardSlug}/keymaps/default/
qmk compile -kb custom/${keyboardSlug} -km default
qmk flash -kb custom/${keyboardSlug} -km default`}</pre>
                </>
              )}
              <button
                className={styles.downloadSourcesBtn}
                onClick={downloadQmkSources}
                disabled={downloadingSources}
                title="Download the generated QMK source archive"
                aria-label="Download generated QMK source ZIP"
              >
                {downloadingSources ? 'Downloading...' : 'Download Generated ZIP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
