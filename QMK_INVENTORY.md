# QMK and third-party source inventory (TEB-14)

## What this repository contains

`firmware/core/` has 26 checked-in QMK-derived source/header files: LED drivers under `drivers/led/`, key processing and matrix/split code under `quantum/`, and LUFA protocol adapter files under `tmk_core/protocol/lufa/`. This is a partial snapshot, not a complete independent firmware runtime. Generate its exact file list with `find firmware/core -type f | sort`. File headers carry individual copyright lines; preserve them.

`docker/builder/Dockerfile` fetches the complete upstream `qmk_firmware` tree at `QMK_FIRMWARE_REF` and initializes `lib/lufa`, `lib/vusb`, `lib/chibios`, `lib/chibios-contrib`, `lib/pico-sdk`, and `lib/printf`. The resulting image contains much more third-party code than the 26 repo files. `docker/builder/build.sh` uses that tree for all source modes. The current build path therefore depends on QMK, its USB/HAL libraries, and its build system.

## Notice audit

| Component | Present/usage | Required action before redistribution or independent-runtime reuse |
| --- | --- | --- |
| Checked-in QMK-derived files | 26 files in `firmware/core/`; file headers visible | Compare each file with the pinned QMK commit, record provenance and license per file, retain copyright/license notices |
| Upstream QMK tree | Builder image | Preserve QMK license and third-party notices from the exact fetched commit in the distributed image |
| LUFA, V-USB | QMK submodules in builder | Review each pinned submodule revision and its license; retain applicable notices |
| ChibiOS, ChibiOS-Contrib, Pico SDK, printf | QMK submodules in builder | Review component and transitive licenses, including HAL/USB files actually linked, and retain applicable notices |
| Debian/pip toolchain packages | Builder image | Record package versions and applicable image notices separately |

The repo's top-level `LICENSE` is MIT. That does **not** establish that every copied file or upstream submodule is MIT or BSD 3-Clause. The previous draft's LUFA and QMK blanket license assertions were unverified. A complete bill of materials and checked-in notice bundle remain open gates before replacing or redistributing third-party code in an independent runtime.

## Reproducible inspection

```bash
find firmware/core -type f | sort
rg -n 'Copyright|SPDX-License-Identifier|Licensed|license' firmware/core
rg -n 'git submodule|QMK_FIRMWARE_REF' docker/builder/Dockerfile
```
