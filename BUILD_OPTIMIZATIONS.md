# Builder Image Optimization Notes

These notes capture the current builder image size investigation and the recommended path for reducing it without breaking QMK-native builds.

## Current Image Shape

The current `qmk-nexus-builder:latest` image is about 1.62 GB.

Measured contributors:

| Area | Approximate size |
| --- | ---: |
| Debian base | 78 MB |
| Apt toolchain layer | 1.03 GB |
| Copied `/qmk_firmware` tree | 470 MB |
| Python/QMK pip install layer | 37 MB |

Runtime directory sizes from the image:

| Path | Approximate size |
| --- | ---: |
| `/qmk_firmware` | 466 MB |
| `/usr/lib/gcc` | 460 MB |
| `/usr/lib/arm-none-eabi` | 374 MB |
| `/usr/lib/avr` | 43 MB |
| `/usr/local/lib/python3.11` | 38 MB |
| `/usr/lib/python3.11` | 29 MB |
| `/usr/lib/python3` | 24 MB |

The large increase is mostly from ARM support. `gcc-arm-none-eabi`, `binutils-arm-none-eabi`, and `libnewlib-arm-none-eabi` are required for the Keychron, ZSA, splitkb, STM32, and RP2040 QMK-native targets that now smoke-build.

## Recommendation

The highest-value optimization is to split the builder into target-family images instead of making every build use one universal image.

Suggested image set:

| Image | Purpose |
| --- | --- |
| `qmk-nexus-builder-avr` | Generated AVR boards and AVR-only QMK-native boards |
| `qmk-nexus-builder-arm` | STM32, RP2040, and other ARM QMK-native boards |
| `qmk-nexus-builder` | Temporary universal fallback while validating routing |

This avoids making normal AVR builds carry the ARM toolchain. Small cleanups can reduce the universal image somewhat, but they will not remove the main ARM payload.

## Implementation Path

1. Add builder image selection in the backend or build proxy.
   - Use generated keyboard MCU metadata for generated builds.
   - Use QMK-native metadata for imported upstream boards.
   - Route AVR targets to `qmk-nexus-builder-avr`.
   - Route ARM targets to `qmk-nexus-builder-arm`.

2. Refactor `docker/builder/Dockerfile` to support build flavors.
   - Keep one Dockerfile if possible.
   - Use build args for apt packages and QMK submodules.
   - AVR flavor should omit `gcc-arm-none-eabi`, `binutils-arm-none-eabi`, `libnewlib-arm-none-eabi`, `lib/chibios`, `lib/chibios-contrib`, and `lib/pico-sdk` unless a validated AVR target needs them.
   - ARM flavor can omit AVR packages and `lib/lufa` unless an ARM target needs them.

3. Keep the current universal image until the split images pass smoke tests.
   - Known passing smoke targets for the universal image:
     - `zsa/moonlander`
     - `zsa/voyager`
     - `keychron/q1v2/ansi_encoder`
     - `keychron/q11/ansi_encoder`
     - `splitkb/elora/rev1`
     - `splitkb/halcyon/elora/rev2`

4. Prune the QMK source tree further after the split.
   - Current pruning removes upstream keyboards, docs, tests, users, community layouts, docker/vagrant files, VCS metadata, and Python caches.
   - Additional candidates are docs, examples, tests, demos, and non-build assets inside `lib/chibios`, `lib/chibios-contrib`, and `lib/pico-sdk`.
   - Prune incrementally and smoke-build after each pass. QMK can reference platform files indirectly, so broad deletes are risky.

5. Restructure install cleanup.
   - Combine apt install, pip install, and cleanup into fewer layers.
   - Remove `python3-pip` and related install-only packages from the final layer if practical.
   - Expected savings are modest, likely tens of MB.

## Expected Impact

Likely results:

| Change | Expected benefit |
| --- | --- |
| Split AVR and ARM images | Largest practical win; AVR builds avoid the ARM toolchain entirely |
| QMK submodule pruning | Medium win, possibly 100-250 MB depending on safe removals |
| Pip/install cleanup | Small win, likely 20-50 MB |
| Single universal image cleanup only | Limited; ARM-capable image will likely remain around 1.3-1.6 GB |

Do not optimize by mounting a host QMK checkout into the container as the default path. That would reduce the image, but it would make builds depend on host state and reduce reproducibility.

