# QMK baseline measurement record (TEB-14)

## Reproducibility boundary

The indexed QMK reference is `ba9642c83dc78050c7e9764c6dcb128076aef691` (`backend/data/qmk_meta.json`). `docker/builder/Dockerfile` now defaults its QMK source argument to that commit. Its Debian base image, apt packages, pip `qmk`, and QMK submodule refs are not yet locked to immutable versions. The builder image digest and exact `avr-gcc`, `arm-none-eabi-gcc`, binutils, `qmk`, and make versions are **unmeasured**. This is a remaining reproducibility gate, not a pinned toolchain claim.

This runner cannot initialize Podman: `podman info` fails with `Failed to obtain podman configuration: set sticky bit on: chmod /run/user/1000/libpod: read-only file system`. `/run/user/1000` is a read-only tmpfs, while Podman must update `/run/user/1000/libpod` during initialization. Setting `XDG_RUNTIME_DIR` to run scratch and passing alternate `--root`, `--runroot`, and `--tmpdir` paths did not bypass that initialization. Nathan reported that Podman Desktop is installed through Flatpak. `flatpak info io.podman_desktop.PodmanDesktop` confirms version 1.29.3; `flatpak run --command=sh io.podman_desktop.PodmanDesktop -c 'command -v podman; command -v docker'` finds neither engine in that Flatpak, and neither is on the host PATH. The Desktop installation does not provide an accessible builder in this runner. Neither AVR nor ARM compiler is installed on the host. Nathan reports access to Ergodox EZ and Hotdox v1/v2, but no board is attached to this runner and no ARM board was identified. No firmware ELF was produced. A `.hex` or `.bin` alone is not sufficient input to `size -A`; measure the ELF in the QMK build tree.

## Raw measurement availability

| Fixture | .text | .rodata | .data | .bss | Stack high-water | Scan-to-HID p50/p95 | Jitter | Cold build |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| minimal AVR | missing | missing | missing | missing | missing | missing | missing | missing |
| 60-key layered AVR | missing | missing | missing | missing | missing | missing | missing | missing |
| feature-rich AVR | missing | missing | missing | missing | missing | missing | missing | missing |
| ARM equivalents | missing | missing | missing | missing | missing | missing | missing | missing |

Existing generator goldens in `backend/tests/goldens/` cover `minimal_avr`, `split_rgb`, and `advanced_features`. They are generated source expectations. `baseline/fixtures/` now contains three complete QMK Configurator `keymap.json` inputs tied to board paths in the pinned QMK source. They passed static board/layout and JSON checks, but no QMK compiler was available here, so buildability and firmware measurements remain unverified. `baseline/trace_scenarios.json` preserves deterministic *stimulus definitions* for synthetic tests; its times are requested input offsets, not observed latency or jitter. Do not substitute example numbers for measurements.

## Collection commands once a builder and boards are available

```bash
# From repo root; first record immutable builder digest and tool versions.
podman build -f docker/builder/Dockerfile --build-arg QMK_FIRMWARE_REF=ba9642c83dc78050c7e9764c6dcb128076aef691 -t nexus-qmk-baseline docker/builder
podman image inspect nexus-qmk-baseline --format '{{.Digest}}'
podman run --rm --entrypoint sh nexus-qmk-baseline -c 'cat /qmk_firmware/.qmk_commit; avr-gcc --version | head -1; arm-none-eabi-gcc --version | head -1; qmk --version; make --version | head -1'
# Stage a complete generated fixture under /build/src, then run build.sh with
# /build mounted. Preserve full stdout/stderr, wall time, and .build/*.elf.
# In the builder: avr-size -A /qmk_firmware/.build/<target>.elf
# Or ARM: arm-none-eabi-size -A /qmk_firmware/.build/<target>.elf
```

For latency, timestamp a physical matrix transition and the corresponding USB HID report with a logic analyzer or equivalent synchronized capture. Record all samples and measurement resolution. Stack requires an instrumented high-water check under the feature-rich trace. Cold build means a clean `.build` directory and recorded host CPU/memory; repeat at least three times.

## Comparison budgets

No numeric comparison budget is defensible without the baseline values. The release gate is closed. After capture, record per-board and per-fixture limits derived from raw samples: section bytes and stack high-water must fit the selected MCU's flash/RAM with explicit headroom; latency and jitter limits must be based on the reference distribution plus a documented tolerance. Do not use the previous draft's arbitrary ±5%, ±0.1 ms, or ±10% as acceptance limits.
