import { useRef, useEffect, useMemo, useState } from 'react'
import { useKeyboardStore } from '@/store/keyboard'
import type { Layer } from '@/store/keyboard'
import type { OledElement } from '@/store/keyboard'
import { OLED_BLOCKS, OLED_PIXEL_SIZES, OLED_DISPLAY_OPTIONS, getBlockPreviewLines } from './oledBlocks'
import styles from './OledConfigurator.module.css'

type OledState = 'startup' | 'active' | 'idle'

interface Props {
  oledId: string
  oledIndex: number
  onClose: () => void
}

function drawOledPreview(
  canvas: HTMLCanvasElement,
  size: { w: number; h: number },
  blocks: string[],
  layers: Layer[],
  activeLayerId: string,
  logoImg: HTMLImageElement | null,
) {
  canvas.width = size.w
  canvas.height = size.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, size.w, size.h)

  if (blocks.length === 0) {
    ctx.fillStyle = '#2a2a2a'
    ctx.font = '6px monospace'
    ctx.fillText('(empty)', 2, 10)
    return
  }

  ctx.fillStyle = '#c8c8c8'
  ctx.font = '6px monospace'
  const lineH = 8
  const BASELINE = 7  // font baseline offset; images start at pixel y = cursor - BASELINE
  let y = BASELINE

  for (const blockId of blocks) {
    if (y > size.h) return
    if (blockId === 'logo' && logoImg) {
      const top = y - BASELINE
      const drawH = Math.min(logoImg.height, size.h - top)
      ctx.drawImage(logoImg, 0, top, Math.min(logoImg.width, size.w), drawH)
      y += drawH
    } else {
      for (const line of getBlockPreviewLines(blockId, layers, activeLayerId)) {
        if (y > size.h) return
        ctx.fillText(line, 2, y)
        y += lineH
      }
    }
    y += 2
  }
}

function imageToOledBytes(img: HTMLImageElement, w: number, h: number): number[] {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h)
  const bytes: number[] = []
  for (let page = 0; page < Math.ceil(h / 8); page++) {
    for (let col = 0; col < w; col++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const row = page * 8 + bit
        if (row < h) {
          const i = (row * w + col) * 4
          const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
          if (lum > 127) byte |= (1 << bit)
        }
      }
      bytes.push(byte)
    }
  }
  return bytes
}

function cString(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r|\n/g, ' ')
}

function blockCode(blockId: string, indent: string, layers: Layer[], hasLogoBytes: boolean, oledIndex: number): string[] {
  switch (blockId) {
    case 'logo':
      return hasLogoBytes
        ? [`${indent}oled_write_raw_P(_oled${oledIndex}_logo, sizeof(_oled${oledIndex}_logo));`]
        : [`${indent}oled_write_P(PSTR("QMK Nexus\\n"), false);`]
    case 'layer_name':
      return [
        `${indent}switch (get_highest_layer(layer_state)) {`,
        ...layers.map((layer, i) => `${indent}    case ${i}: oled_write_P(PSTR("${cString(layer.name.padEnd(6, ' '))}"), false); break;`),
        `${indent}    default: oled_write_P(PSTR("???   "), false); break;`,
        `${indent}}`,
      ]
    case 'wpm':
      return [
        `${indent}oled_write_P(PSTR("WPM: "), false);`,
        `${indent}oled_write(get_u8_str(get_current_wpm(), '0'), false);`,
        `${indent}oled_write_P(PSTR("\\n"), false);`,
      ]
    case 'host_leds':
      return [
        `${indent}{`,
        `${indent}    led_t led_state = host_keyboard_led_state();`,
        `${indent}    oled_write_P(led_state.num_lock ? PSTR("NUM ") : PSTR("    "), false);`,
        `${indent}    oled_write_P(led_state.caps_lock ? PSTR("CAP ") : PSTR("    "), false);`,
        `${indent}    oled_write_P(led_state.scroll_lock ? PSTR("SCR ") : PSTR("    "), false);`,
        `${indent}}`,
      ]
    case 'mod_indicators':
      return [
        `${indent}{`,
        `${indent}    uint8_t mods = get_mods() | get_oneshot_mods();`,
        `${indent}    oled_write_P(mods & MOD_MASK_SHIFT ? PSTR("SFT ") : PSTR("    "), false);`,
        `${indent}    oled_write_P(mods & MOD_MASK_CTRL ? PSTR("CTL ") : PSTR("    "), false);`,
        `${indent}    oled_write_P(mods & MOD_MASK_ALT ? PSTR("ALT ") : PSTR("    "), false);`,
        `${indent}    oled_write_P(mods & MOD_MASK_GUI ? PSTR("GUI ") : PSTR("    "), false);`,
        `${indent}}`,
      ]
    case 'keylog':
      return [
        `${indent}// keylog: implement keylog_str in your keymap, then:`,
        `${indent}// oled_write(keylog_str, false);`,
      ]
    case 'master_slave':
      return [
        `${indent}oled_write_P(is_keyboard_master() ? PSTR("Master") : PSTR("Slave "), false);`,
        `${indent}oled_write_P(PSTR("\\n"), false);`,
      ]
    default:
      return [`${indent}// Unknown block: ${blockId}`]
  }
}

function appendBlocks(lines: string[], blocks: string[], indent: string, layers: Layer[], hasLogoBytes: boolean, oledIndex: number) {
  for (const blockId of blocks) lines.push(...blockCode(blockId, indent, layers, hasLogoBytes, oledIndex))
}

function generateCustomCodeFromPreset(oled: OledElement, layers: Layer[], oledIndex: number): string {
  const lines = ['// Generated from Preset Blocks. Edit freely.']
  const hasLogoBytes = oled.logoBytes.length > 0
  const hasStartup = oled.startupBlocks.length > 0
  const hasIdle = oled.idleBlocks.length > 0
  const hasActive = oled.activeBlocks.length > 0

  if (hasLogoBytes) {
    lines.push('// Logo data is emitted by QMK Nexus outside oled_task_user().')
  }

  if (hasStartup) {
    lines.push('static uint32_t startup_timer = 0;')
    lines.push('if (!startup_timer) startup_timer = timer_read32();')
    lines.push(`if (timer_elapsed32(startup_timer) < ${oled.startupDuration}U) {`)
    appendBlocks(lines, oled.startupBlocks, '    ', layers, hasLogoBytes, oledIndex)
    lines.push('    return false;')
    lines.push('}')
    lines.push('')
  }

  if (hasIdle) {
    lines.push(`if (last_input_activity_elapsed() > ${oled.idleTimeout}U) {`)
    appendBlocks(lines, oled.idleBlocks, '    ', layers, hasLogoBytes, oledIndex)
    lines.push('    return false;')
    lines.push('}')
    lines.push('')
  }

  if (hasActive) {
    appendBlocks(lines, oled.activeBlocks, '', layers, hasLogoBytes, oledIndex)
  }

  if (!hasStartup && !hasIdle && !hasActive) {
    lines.push('oled_write_P(PSTR("Hello!\\n"), false);')
  }

  return lines.join('\n')
}

export function OledConfigurator({ oledId, oledIndex, onClose }: Props) {
  const { config, updateOled, activeLayerId } = useKeyboardStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [focusedState, setFocusedState] = useState<OledState>('active')
  const [previewState, setPreviewState] = useState<OledState>('active')

  const oled = config.oleds.find((o) => o.id === oledId)
  const contentMode    = oled?.contentMode    ?? 'preset'
  const startupBlocks  = oled?.startupBlocks  ?? []
  const activeBlocks   = oled?.activeBlocks   ?? []
  const idleBlocks     = oled?.idleBlocks     ?? []
  const startupDuration = oled?.startupDuration ?? 15000
  const idleTimeout    = oled?.idleTimeout    ?? 10000
  const customCode     = oled?.customCode     ?? ''
  const customCodeTemplate = oled?.customCodeTemplate ?? ''
  const displaySize    = oled?.displaySize    ?? '128_32'
  const logoImage      = oled?.logoImage      ?? ''
  const pixelSize      = useMemo(() => OLED_PIXEL_SIZES[displaySize] ?? OLED_PIXEL_SIZES['128_32'], [displaySize])

  useEffect(() => {
    if (!logoImage) { setLogoImg(null); return }
    const img = new Image()
    img.onload = () => setLogoImg(img)
    img.src = logoImage
    return () => { img.onload = null }
  }, [logoImage])

  const previewBlocks = previewState === 'startup' ? startupBlocks
    : previewState === 'idle' ? idleBlocks : activeBlocks

  useEffect(() => {
    if (!canvasRef.current) return
    drawOledPreview(canvasRef.current, pixelSize, previewBlocks, config.layers, activeLayerId, logoImg)
  }, [previewBlocks, activeLayerId, config.layers, pixelSize, logoImg])

  if (!oled) return null

  function getBlocks(s: OledState) {
    if (s === 'startup') return startupBlocks
    if (s === 'idle') return idleBlocks
    return activeBlocks
  }

  function setBlocks(s: OledState, blocks: string[]) {
    if (s === 'startup') updateOled(oledId, { startupBlocks: blocks })
    else if (s === 'idle') updateOled(oledId, { idleBlocks: blocks })
    else updateOled(oledId, { activeBlocks: blocks })
  }

  function addBlock(id: string) {
    const cur = getBlocks(focusedState)
    if (cur.includes(id)) return
    setBlocks(focusedState, [...cur, id])
  }

  function removeBlock(s: OledState, id: string) {
    setBlocks(s, getBlocks(s).filter((b) => b !== id))
    if (id === 'logo') {
      const others: OledState[] = (['startup', 'active', 'idle'] as OledState[]).filter((st) => st !== s)
      const logoInOther = others.some((st) => getBlocks(st).includes('logo'))
      if (!logoInOther) {
        updateOled(oledId, { logoImage: '', logoBytes: [] })
        setLogoError(null)
      }
    }
  }

  function moveBlock(s: OledState, idx: number, dir: -1 | 1) {
    const next = [...getBlocks(s)]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setBlocks(s, next)
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        if (img.naturalWidth !== pixelSize.w || img.naturalHeight !== pixelSize.h) {
          setLogoError(`Must be exactly ${pixelSize.w}×${pixelSize.h}px — got ${img.naturalWidth}×${img.naturalHeight}px`)
          return
        }
        setLogoError(null)
        updateOled(oledId, { logoImage: src, logoBytes: imageToOledBytes(img, pixelSize.w, pixelSize.h) })
      }
      img.src = src
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const focusedSet = new Set(getBlocks(focusedState))
  const available = OLED_BLOCKS.filter((b) => !focusedSet.has(b.id))

  const logoInAnyState = startupBlocks.includes('logo') || activeBlocks.includes('logo') || idleBlocks.includes('logo')

  function switchToCustomMode() {
    if (!oled) return
    const generated = generateCustomCodeFromPreset(oled, config.layers, oledIndex)
    const shouldRefresh = !customCode.trim() || customCode === customCodeTemplate
    updateOled(oledId, {
      contentMode: 'custom',
      ...(shouldRefresh ? { customCode: generated, customCodeTemplate: generated } : {}),
    })
  }

  const STATE_DEFS: { id: OledState; label: string; badge?: string }[] = [
    { id: 'startup', label: 'Startup', badge: `${startupDuration / 1000}s on boot` },
    { id: 'active',  label: 'Active',  badge: 'while typing' },
    { id: 'idle',    label: 'Idle',    badge: `after ${idleTimeout / 1000}s idle` },
  ]

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>OLED {oledIndex + 1}</span>
          <div className={styles.resBtns}>
            {OLED_DISPLAY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`${styles.resBtn} ${displaySize === opt.value ? styles.resBtnActive : ''}`}
                onClick={() => {
                  const clearLogo = logoImage && opt.value !== displaySize
                  updateOled(oledId, { displaySize: opt.value, ...(clearLogo ? { logoImage: '', logoBytes: [] } : {}) })
                  if (clearLogo) setLogoError(null)
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        <div className={styles.modeRow}>
          <button
            className={`${styles.modeBtn} ${contentMode === 'preset' ? styles.modeBtnActive : ''}`}
            onClick={() => updateOled(oledId, { contentMode: 'preset' })}
          >
            Preset Blocks
          </button>
          <button
            className={`${styles.modeBtn} ${contentMode === 'custom' ? styles.modeBtnActive : ''}`}
            onClick={switchToCustomMode}
          >
            Custom C Code
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.configPanel}>
            {contentMode === 'preset' ? (
              <div className={styles.presetLayout}>
                {/* Available */}
                <div className={styles.availablePanel}>
                  <div className={styles.sectionHeader}>
                    Available
                    <span className={styles.addingTo}>→ {focusedState}</span>
                  </div>
                  <div className={styles.blockList}>
                    {available.map((b) => (
                      <button key={b.id} className={styles.blockItem} onClick={() => addBlock(b.id)} title={b.description}>
                        <span className={styles.blockLabel}>{b.label}</span>
                        <span className={styles.blockAdd}>+</span>
                      </button>
                    ))}
                    {available.length === 0 && <span className={styles.emptyHint}>All blocks in {focusedState}</span>}
                  </div>
                </div>

                {/* Three state sections */}
                <div className={styles.statesPanel}>
                  {STATE_DEFS.map(({ id: stateId, label, badge }) => {
                    const blocks = getBlocks(stateId)
                    const isFocused = focusedState === stateId
                    return (
                      <div key={stateId} className={`${styles.stateSection} ${isFocused ? styles.stateFocused : ''}`}>
                        <div
                          className={styles.stateHeader}
                          onClick={() => { setFocusedState(stateId); setPreviewState(stateId) }}
                        >
                          <span className={styles.stateLabel}>{label}</span>
                          <span className={styles.stateBadge}>{badge}</span>
                          {stateId === 'startup' && isFocused && (
                            <input
                              type="number"
                              min={1000}
                              step={1000}
                              value={startupDuration}
                              className={styles.durationInput}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateOled(oledId, { startupDuration: Math.max(1000, Number(e.target.value)) })}
                            />
                          )}
                          {stateId === 'idle' && isFocused && (
                            <input
                              type="number"
                              min={1000}
                              step={1000}
                              value={idleTimeout}
                              className={styles.durationInput}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateOled(oledId, { idleTimeout: Math.max(1000, Number(e.target.value)) })}
                            />
                          )}
                        </div>

                        <div className={styles.stateBlockList}>
                          {blocks.map((id, idx) => {
                            const def = OLED_BLOCKS.find((b) => b.id === id)
                            return (
                              <div key={id} className={styles.activeEntry}>
                                <div className={styles.activeBlock}>
                                  <div className={styles.activeBlockArrows}>
                                    <button className={styles.arrowBtn} onClick={() => moveBlock(stateId, idx, -1)} disabled={idx === 0}>▲</button>
                                    <button className={styles.arrowBtn} onClick={() => moveBlock(stateId, idx, 1)} disabled={idx === blocks.length - 1}>▼</button>
                                  </div>
                                  <span className={styles.blockLabel}>{def?.label ?? id}</span>
                                  <button className={styles.removeBtn} onClick={() => removeBlock(stateId, id)}>×</button>
                                </div>
                              </div>
                            )
                          })}
                          {blocks.length === 0 && <span className={styles.emptyHint}>Empty — click header to focus</span>}
                        </div>
                      </div>
                    )
                  })}

                  {/* Logo upload — shown once if logo is in any state */}
                  {logoInAnyState && (
                    <div className={styles.logoSection}>
                      <input type="file" accept="image/png,image/bmp,image/gif" id={`logo-${oledId}`} className={styles.fileInput} onChange={handleLogoUpload} />
                      <label htmlFor={`logo-${oledId}`} className={styles.uploadBtn}>
                        {logoImage ? 'Replace logo image' : `Upload logo (${pixelSize.w}×${pixelSize.h}px)`}
                      </label>
                      {logoImage && (
                        <button className={styles.clearBtn} onClick={() => { updateOled(oledId, { logoImage: '', logoBytes: [] }); setLogoError(null) }}>
                          Clear
                        </button>
                      )}
                      {logoError && <span className={styles.uploadError}>{logoError}</span>}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.customLayout}>
                <div className={styles.customHint}>
                  Body of <code>oled_task_user()</code>. <code>return false;</code> appended automatically.
                </div>
                <textarea
                  className={styles.codeArea}
                  value={customCode}
                  onChange={(e) => updateOled(oledId, { customCode: e.target.value })}
                  placeholder={`oled_write_P(PSTR("Hello!\\n"), false);\n// return false; is added automatically`}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                />
              </div>
            )}
          </div>

          <div className={styles.previewPanel}>
            <div className={styles.previewHeader}>
              <div className={styles.previewStateTabs}>
                {(['startup', 'active', 'idle'] as OledState[]).map((s) => (
                  <button
                    key={s}
                    className={`${styles.previewTab} ${previewState === s ? styles.previewTabActive : ''}`}
                    onClick={() => setPreviewState(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <span className={styles.previewDims}>{pixelSize.w}×{pixelSize.h}</span>
            </div>
            <div className={styles.previewCanvasWrap}>
              <canvas ref={canvasRef} className={styles.previewCanvas} title={`${pixelSize.w}×${pixelSize.h} px`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
