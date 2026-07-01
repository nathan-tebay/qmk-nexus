import { useKeyboardStore, type OledElement, type TrackballElement, type TrackballDpiIndicator, type JoystickAxis } from '@/store/keyboard'
import { ENCODER_DIAMETER_OPTIONS, TRACKBALL_DIAMETER_OPTIONS } from '../peripheralSizes'
import { POINTING_DRIVER_OPTIONS, getSensorCpiRange } from '../build/pointingSensors'
import styles from './KeyProperties.module.css'

const MAX_JOYSTICK_AXES = 6
const HAT_DIRECTIONS = ['N', 'E', 'S', 'W', 'NE', 'SE', 'SW', 'NW', 'C'] as const

export default function PeripheralProperties() {
  const {
    config,
    selectedPeripheralId,
    selectedPeripheralType,
    updateEncoder,
    removeEncoder,
    updateOled,
    removeOled,
    updateTrackball,
    removeTrackball,
    updateJoystick,
    removeJoystick,
    setSelectedPeripheral,
  } = useKeyboardStore()

  if (!selectedPeripheralId || !selectedPeripheralType) {
    return (
      <div className={styles.empty}>
        <span>Select a peripheral to edit its properties</span>
      </div>
    )
  }

  function num(v: string, fallback: number): number {
    const n = parseFloat(v)
    return isNaN(n) ? fallback : n
  }

  if (selectedPeripheralType === 'encoder') {
    const enc = config.encoders?.find((e) => e.id === selectedPeripheralId)
    if (!enc) return null
    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>Encoder</h3>
        <div className={styles.row}>
          <Field label="X (u)">
            <input type="number" step={0.25} value={enc.x}
              onChange={(e) => updateEncoder(enc.id, { x: num(e.target.value, 0) })} />
          </Field>
          <Field label="Y (u)">
            <input type="number" step={0.25} value={enc.y}
              onChange={(e) => updateEncoder(enc.id, { y: num(e.target.value, 0) })} />
          </Field>
        </div>
        <Field label="Diameter">
          <select
            value={enc.diameter}
            onChange={(e) => updateEncoder(enc.id, { diameter: Number(e.target.value) })}
          >
            {ENCODER_DIAMETER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <span className={styles.note}>Pin config in Features + Build → Encoder</span>
        <div className={styles.divider} />
        <button
          className={styles.removeBtn}
          onClick={() => { removeEncoder(enc.id); setSelectedPeripheral(null, null) }}
        >
          Remove Encoder
        </button>
      </div>
    )
  }

  if (selectedPeripheralType === 'oled') {
    const oled = config.oleds?.find((o) => o.id === selectedPeripheralId)
    if (!oled) return null
    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>OLED Display</h3>
        <div className={styles.row}>
          <Field label="X (u)">
            <input type="number" step={0.25} value={oled.x}
              onChange={(e) => updateOled(oled.id, { x: num(e.target.value, 0) })} />
          </Field>
          <Field label="Y (u)">
            <input type="number" step={0.25} value={oled.y}
              onChange={(e) => updateOled(oled.id, { y: num(e.target.value, 0) })} />
          </Field>
        </div>
        <Field label="Rotation (°)">
          <input type="number" step={90} value={oled.rotation}
            onChange={(e) => updateOled(oled.id, { rotation: num(e.target.value, 0) })} />
        </Field>
        <Field label="Display Size">
          <select
            value={oled.displaySize}
            onChange={(e) => updateOled(oled.id, { displaySize: e.target.value as OledElement['displaySize'] })}
          >
            <option value="128_64">128×64</option>
            <option value="128_32">128×32</option>
            <option value="64_48">64×48</option>
            <option value="64_32">64×32</option>
          </select>
        </Field>
        <span className={styles.note}>Pin config in Features + Build → OLED Display</span>
        <div className={styles.divider} />
        <button
          className={styles.removeBtn}
          onClick={() => { removeOled(oled.id); setSelectedPeripheral(null, null) }}
        >
          Remove OLED
        </button>
      </div>
    )
  }

  if (selectedPeripheralType === 'trackball') {
    const tb = config.trackballs?.find((t) => t.id === selectedPeripheralId)
    if (!tb) return null

    const sensor = getSensorCpiRange(tb.driver)
    const dpiDisabled = sensor.hasFixedCpi === true
    const cpiOutOfRange = !dpiDisabled && (tb.cpi < sensor.cpiMin || tb.cpi > sensor.cpiMax)
    const lightingEnabled = Boolean(config.features?.rgblight || config.features?.rgb_matrix)
    const stages = tb.dpiStages ?? []
    const indicator = tb.dpiIndicator ?? { mode: 'off', colors: [], pins: [] }

    const onDriverChange = (driver: string) => {
      const nextSensor = getSensorCpiRange(driver)
      updateTrackball(tb.id, {
        driver: driver as TrackballElement['driver'],
        cpi: nextSensor.cpiDefault,
        dpiStages: [],
      })
    }

    const updateStage = (index: number, value: number) => {
      const next = stages.map((s, i) => i === index ? value : s)
      updateTrackball(tb.id, { dpiStages: next })
    }

    const addStage = () => {
      updateTrackball(tb.id, { dpiStages: [...stages, sensor.cpiDefault] })
    }

    const removeStage = (index: number) => {
      const next = stages.filter((_, i) => i !== index)
      const colors = indicator.colors.filter((_, i) => i !== index)
      updateTrackball(tb.id, { dpiStages: next, dpiIndicator: { ...indicator, colors } })
    }

    const setIndicatorMode = (mode: TrackballDpiIndicator['mode']) => {
      updateTrackball(tb.id, { dpiIndicator: { ...indicator, mode } })
    }

    const updateColor = (index: number, color: string) => {
      const colors = [...indicator.colors]
      colors[index] = color
      updateTrackball(tb.id, { dpiIndicator: { ...indicator, colors } })
    }

    const updatePin = (index: number, pin: string) => {
      const pins = [...indicator.pins]
      pins[index] = pin
      updateTrackball(tb.id, { dpiIndicator: { ...indicator, pins } })
    }

    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>Trackball</h3>
        <div className={styles.row}>
          <Field label="X (u)">
            <input type="number" step={0.25} value={tb.x}
              onChange={(e) => updateTrackball(tb.id, { x: num(e.target.value, 0) })} />
          </Field>
          <Field label="Y (u)">
            <input type="number" step={0.25} value={tb.y}
              onChange={(e) => updateTrackball(tb.id, { y: num(e.target.value, 0) })} />
          </Field>
        </div>
        <Field label="Ball Diameter">
          <select
            value={tb.diameter}
            onChange={(e) => updateTrackball(tb.id, { diameter: Number(e.target.value) })}
          >
            {TRACKBALL_DIAMETER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Driver">
          <select
            value={tb.driver}
            onChange={(e) => onDriverChange(e.target.value)}
          >
            {POINTING_DRIVER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <div className={styles.divider} />
        <span className={styles.label}>DPI / CPI</span>
        {dpiDisabled && (
          <span className={styles.note}>{sensor.label} has no adjustable CPI.</span>
        )}
        {!dpiDisabled && (
          <>
            <Field label={`Default DPI (${sensor.cpiMin}-${sensor.cpiMax})`}>
              <input
                type="number"
                min={sensor.cpiMin}
                max={sensor.cpiMax}
                step={sensor.cpiStep}
                value={tb.cpi}
                onChange={(e) => updateTrackball(tb.id, { cpi: num(e.target.value, sensor.cpiDefault) })}
              />
            </Field>
            {cpiOutOfRange && (
              <span className={styles.note}>Out of range for {sensor.label} ({sensor.cpiMin}-{sensor.cpiMax}).</span>
            )}

            <span className={styles.label}>DPI Stages</span>
            {stages.map((stage, i) => {
              const stageOutOfRange = stage < sensor.cpiMin || stage > sensor.cpiMax
              return (
                <div key={i} className={styles.row}>
                  <Field label={`Stage ${i + 1}`}>
                    <input
                      type="number"
                      min={sensor.cpiMin}
                      max={sensor.cpiMax}
                      step={sensor.cpiStep}
                      value={stage}
                      onChange={(e) => updateStage(i, num(e.target.value, sensor.cpiDefault))}
                    />
                  </Field>
                  <button className={styles.removeBtn} onClick={() => removeStage(i)} title="Remove stage">×</button>
                  {stageOutOfRange && <span className={styles.note}>out of range</span>}
                </div>
              )
            })}
            <button className={styles.removeBtn} onClick={addStage}>+ Add DPI Stage</button>
            {stages.length > 0 && (
              <span className={styles.note}>Cycle: {stages.join(' → ')}</span>
            )}
          </>
        )}

        <div className={styles.divider} />
        <span className={styles.label}>DPI Indicator</span>
        <Field label="Mode">
          <select
            value={indicator.mode}
            onChange={(e) => setIndicatorMode(e.target.value as TrackballDpiIndicator['mode'])}
          >
            <option value="off">Off</option>
            <option value="rgb" disabled={!lightingEnabled}>RGB color per stage</option>
            <option value="pins">LED pins</option>
          </select>
        </Field>
        {!lightingEnabled && (
          <span className={styles.note}>Enable RGB Light or RGB Matrix to use the RGB indicator mode.</span>
        )}

        {indicator.mode === 'rgb' && stages.map((stage, i) => (
          <Field key={i} label={`Stage ${i + 1} (${stage} DPI) color`}>
            <input
              type="color"
              value={indicator.colors[i] ?? '#ffffff'}
              onChange={(e) => updateColor(i, e.target.value)}
            />
          </Field>
        ))}

        {indicator.mode === 'pins' && stages.map((stage, i) => (
          <Field key={i} label={`Stage ${i + 1} (${stage} DPI) pin`}>
            <input
              type="text"
              value={indicator.pins[i] ?? ''}
              onChange={(e) => updatePin(i, e.target.value)}
            />
          </Field>
        ))}

        <span className={styles.note}>Pin config in Features + Build → Pointing Device</span>
        <div className={styles.divider} />
        <button
          className={styles.removeBtn}
          onClick={() => { removeTrackball(tb.id); setSelectedPeripheral(null, null) }}
        >
          Remove Trackball
        </button>
      </div>
    )
  }

  if (selectedPeripheralType === 'joystick') {
    const joy = config.joysticks?.find((j) => j.id === selectedPeripheralId)
    if (!joy) return null

    const updateAxis = (index: number, patch: Partial<JoystickAxis>) => {
      const axes = joy.axes.map((a, i) => i === index ? { ...a, ...patch } : a)
      updateJoystick(joy.id, { axes })
    }

    const addAxis = () => {
      if (joy.axes.length >= MAX_JOYSTICK_AXES) return
      const axes = [...joy.axes, { pin: '', low: 0, rest: 512, high: 1023, virtual: false }]
      updateJoystick(joy.id, { axes })
    }

    const removeAxis = (index: number) => {
      const axes = joy.axes.filter((_, i) => i !== index)
      updateJoystick(joy.id, { axes })
    }

    const updateHat = (dir: string, pin: string) => {
      const hat = { ...(joy.hat ?? {}) }
      if (pin) {
        hat[dir] = pin
      } else {
        delete hat[dir]
      }
      updateJoystick(joy.id, { hat })
    }

    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>Joystick</h3>
        <div className={styles.row}>
          <Field label="X (u)">
            <input type="number" step={0.25} value={joy.x}
              onChange={(e) => updateJoystick(joy.id, { x: num(e.target.value, 0) })} />
          </Field>
          <Field label="Y (u)">
            <input type="number" step={0.25} value={joy.y}
              onChange={(e) => updateJoystick(joy.id, { y: num(e.target.value, 0) })} />
          </Field>
        </div>
        <Field label="Button Count">
          <input type="number" min={0} max={32} step={1} value={joy.buttonCount}
            onChange={(e) => updateJoystick(joy.id, { buttonCount: num(e.target.value, 0) })} />
        </Field>
        <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={joy.hasHat}
            onChange={(e) => updateJoystick(joy.id, { hasHat: e.target.checked })}
          />
          Has hat switch
        </label>

        <div className={styles.divider} />
        <span className={styles.label}>Axes ({joy.axes.length}/{MAX_JOYSTICK_AXES})</span>
        {joy.axes.map((axis, i) => (
          <div key={i} className={styles.panel} style={{ padding: 0, gap: 4 }}>
            <div className={styles.row}>
              <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <input
                  type="checkbox"
                  checked={axis.virtual}
                  onChange={(e) => updateAxis(i, { virtual: e.target.checked })}
                />
                Axis {i + 1} virtual
              </label>
              <button
                className={styles.removeBtn}
                onClick={() => removeAxis(i)}
                disabled={joy.axes.length <= 1}
                title={joy.axes.length <= 1 ? 'At least one axis is required' : 'Remove this axis'}
              >
                ×
              </button>
            </div>
            {!axis.virtual && (
              <>
                <Field label="Pin">
                  <input type="text" value={axis.pin}
                    onChange={(e) => updateAxis(i, { pin: e.target.value })} />
                </Field>
                <div className={styles.row}>
                  <Field label="Low">
                    <input type="number" value={axis.low}
                      onChange={(e) => updateAxis(i, { low: num(e.target.value, 0) })} />
                  </Field>
                  <Field label="Rest">
                    <input type="number" value={axis.rest}
                      onChange={(e) => updateAxis(i, { rest: num(e.target.value, 512) })} />
                  </Field>
                  <Field label="High">
                    <input type="number" value={axis.high}
                      onChange={(e) => updateAxis(i, { high: num(e.target.value, 1023) })} />
                  </Field>
                </div>
              </>
            )}
          </div>
        ))}
        <button
          className={styles.removeBtn}
          onClick={addAxis}
          disabled={joy.axes.length >= MAX_JOYSTICK_AXES}
          title={joy.axes.length >= MAX_JOYSTICK_AXES ? `Limit of ${MAX_JOYSTICK_AXES} axes reached` : 'Add another axis'}
        >
          + Add Axis
        </button>

        {joy.hasHat && (
          <>
            <div className={styles.divider} />
            <span className={styles.label}>Hat Switch Pins</span>
            <div className={styles.row} style={{ flexWrap: 'wrap' }}>
              {HAT_DIRECTIONS.map((dir) => (
                <Field key={dir} label={dir}>
                  <input
                    type="text"
                    value={joy.hat?.[dir] ?? ''}
                    onChange={(e) => updateHat(dir, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </>
        )}

        <span className={styles.note}>Pin config in Features + Build → Joystick</span>
        <div className={styles.divider} />
        <button
          className={styles.removeBtn}
          onClick={() => { removeJoystick(joy.id); setSelectedPeripheral(null, null) }}
        >
          Remove Joystick
        </button>
      </div>
    )
  }

  return null
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
    </div>
  )
}
