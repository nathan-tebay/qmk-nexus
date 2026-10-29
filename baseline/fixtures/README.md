# QMK reference fixture inputs

These three QMK Configurator `keymap.json` files are complete inputs for the
`qmk_json` path in `docker/builder/build.sh`. The board paths and layouts exist
at QMK commit `ba9642c83dc78050c7e9764c6dcb128076aef691`:

| Fixture | Board path at pinned commit | MCU | Layout | Stimulus |
| --- | --- | --- | --- | --- |
| `minimal_avr` | `1upkeyboards/1up60hse` | ATmega32U4 | `LAYOUT_60_ansi` (61 keys) | `KC_A` at layout index 0; remaining keys disabled |
| `layered_60_avr` | `1upkeyboards/1up60hse` | ATmega32U4 | `LAYOUT_60_ansi` (61 keys) | `MO(1)` at index 60; layer 1 has `KC_C` at index 2 |
| `feature_rich_ergodox` | `ergodox_ez/base` | ATmega32U4 | inherited `LAYOUT_ergodox` (76 keys) | Split board, three layers, media key; `MO(1)` at index 75 and `MO(2)` at index 74 on layer 1 |

The `1up60hse` board metadata is `keyboards/1upkeyboards/1up60hse/keyboard.json`.
The Ergodox base revision is `keyboards/ergodox_ez/base/keyboard.json`, with its
layout inherited from `keyboards/ergodox_ez/info.json`. The minimal fixture is a
minimal *configuration* on a 60-key board, not a one-key hardware revision.
Feature rich here means the split 76-key board with multiple layers and media
input. These fixtures do not exercise every Nexus feature or establish parity.

From the repository root, after building the QMK image described in
`BUILD_MEASUREMENTS.md`, run each exact input through the existing builder:

```bash
for fixture in minimal_avr layered_60_avr feature_rich_ergodox; do
  mkdir -p "baseline/output/$fixture"
  podman run --rm \
    --entrypoint /usr/local/bin/build.sh \
    -e TARGET_MCU=atmega32u4 \
    -e KEYBOARD_NAME="nexus_${fixture}" \
    -v "$PWD/baseline/fixtures/$fixture:/build/src:ro" \
    -v "$PWD/baseline/output/$fixture:/build/output" \
    nexus-qmk-baseline
done
```

For direct QMK compilation inside the pinned builder image, run
`qmk compile /build/src/keymap.json` with the same read-only fixture mount.
Record the image digest, tool versions, complete stdout/stderr, exit status,
ELF path/hash, and firmware artifact hash. The current runner has no working
builder; none of these inputs has a verified firmware build yet. Avoid treating
static JSON validation as a compiler result.

`baseline/trace_scenarios.json` retains the original test-harness stimuli for
`minimal_avr_kb` and `advanced_features_kb`. Those are four-key synthetic
configurations, separate from the physical board fixtures above. In particular,
`feature_rich_combo` is a synthetic combo test; the Ergodox Configurator input
does not define that combo. Its `at_ms` values schedule transitions, not measured
scan-to-HID latency or jitter. A physical trace mapping and raw capture must be
added after the build runtime and board access are available.
