# QMK-derived source and notice audit

Pinned reference: QMK `ba9642c83dc78050c7e9764c6dcb128076aef691`. Every local path below exists at the same relative path in that commit. `identical` means byte-for-byte equality with `git show <ref>:<path>`; `modified` means Nexus carries a local delta. The SHA-256 column is the first 12 hex digits of the local file hash. Header evidence describes the copied file, not a legal conclusion about its dependencies.

| `firmware/core/` path | Against pinned QMK | Local SHA-256 prefix | Declared license | Evidence |
| --- | --- | --- | --- | --- |
| `drivers/led/issi/is31fl3737.c` | identical | `b5f6986c4c48` | GPL-2.0-or-later | GPL header |
| `drivers/led/issi/is31fl3737.h` | identical | `467d13dee148` | GPL-2.0-or-later | GPL header |
| `drivers/led/issi/is31fl3741.c` | identical | `854a25ece761` | GPL-2.0-or-later | GPL header |
| `drivers/led/issi/is31fl3741.h` | identical | `1eb53dbaa627` | GPL-2.0-or-later | GPL header |
| `drivers/led/ws2812.c` | identical | `dc53aa187c53` | GPL-2.0-or-later | SPDX header |
| `drivers/led/ws2812.h` | identical | `1a15cc52d602` | GPL-2.0-or-later | GPL header |
| `quantum/keycode.h` | identical | `7ccd9b99aeba` | GPL-2.0-or-later | GPL header |
| `quantum/keycodes.h` | identical | `e7b518776c66` | GPL-2.0-or-later | SPDX header |
| `quantum/keymap_common.c` | modified | `ee6ee278b360` | GPL-2.0-or-later | GPL header |
| `quantum/keymap_common.h` | identical | `0f2943153513` | GPL-2.0-or-later | SPDX header |
| `quantum/matrix.c` | modified | `822f431d7fdc` | GPL-2.0-or-later | GPL header |
| `quantum/matrix.h` | identical | `f02d6ea28b08` | GPL-2.0-or-later | GPL header |
| `quantum/matrix_common.c` | modified | `e854d2a666d4` | unresolved | no local license header |
| `quantum/quantum.c` | modified | `6730a17388e9` | GPL-2.0-or-later | GPL header |
| `quantum/quantum.h` | identical | `93468bd9964d` | GPL-2.0-or-later | GPL header |
| `quantum/split_common/post_config.h` | identical | `d88ea5f3f71b` | unresolved | no local license header |
| `quantum/split_common/split_util.c` | identical | `cb24852b6a19` | GPL-3.0-or-later | GPL header |
| `quantum/split_common/split_util.h` | identical | `757480f81b67` | unresolved | no local license header |
| `quantum/split_common/transaction_id_define.h` | modified | `ec3a75772980` | GPL-2.0-or-later | GPL header |
| `quantum/split_common/transactions.c` | modified | `71bd25982e24` | GPL-2.0-or-later | GPL header |
| `quantum/split_common/transactions.h` | identical | `f4797b9ee19e` | GPL-2.0-or-later | GPL header |
| `quantum/split_common/transport.c` | identical | `37be2286b8b1` | GPL-2.0-or-later | GPL header |
| `quantum/split_common/transport.h` | modified | `a03a813883ff` | GPL-2.0-or-later | GPL header |
| `tmk_core/protocol/lufa/lufa.c` | identical | `6f014331db09` | LUFA permissive notice | embedded LUFA permission and warranty text |
| `tmk_core/protocol/lufa/lufa.h` | identical | `3a3471acfd13` | LUFA permissive notice | embedded LUFA permission and warranty text |
| `tmk_core/protocol/lufa/usb_util.c` | identical | `3fca3a59766e` | GPL-3.0-or-later | GPL header |

## Local deltas

- `quantum/keymap_common.c`: adds `<inttypes.h>`.
- `quantum/matrix.c` and `quantum/matrix_common.c`: replace `is_keyboard_left()` calls with `isLeftHand`.
- `quantum/quantum.c`: changes audio shutdown/timer behavior and adds `GOODBYE_SONG`; inspect this delta before runtime reuse.
- `quantum/split_common/transaction_id_define.h`, `transactions.c`, and `transport.h`: change split RPC compile guards; inspect before runtime reuse.

## Notice and redistribution status

- `notices/license_GPLv2.md`, `notices/license_GPLv3.md`, and `notices/license_Modified_BSD.md` are verbatim license texts from the pinned QMK root. The repository root `LICENSE` is GPLv3 text. Keep the original headers in every copied source file. GPLv2-or-later files must not be described as GPLv3-only merely because the root file is GPLv3.
- `tmk_core/protocol/lufa/lufa.c` and `.h` contain Dean Camera and Denver Gingerich copyright, permission, and warranty text in their headers. Keep those complete embedded notices in source and accompanying distributions. A separate LUFA submodule notice audit remains necessary for binaries containing other LUFA files.
- `quantum/matrix_common.c`, `quantum/split_common/post_config.h`, and `split_util.h` have no local license header. Their exact equality or modification against QMK is recorded above, but the effective license must be confirmed from upstream project context before independent redistribution. Do not infer their license from adjacent files.
- The builder's `git submodule update` includes `lib/lufa` (`549b97320d515bfca2f95c145a67bd13be968faa`), `lib/vusb` (`819dbc1e5d5926b17e27e00ca6d3d2988adae04e`), `lib/chibios` (`8bd61b804303f1614d574546c2dd735eeabb09f5`), `lib/chibios-contrib` (`8d863d9ee4eecea68ad8d15f7e7c2b451aea79d9`), `lib/pico-sdk` (`d0c5cac430cc955b65efa0e899748853d9a80928`), and `lib/printf` (`c2e3b4e10d281e7f0f694d3ecbd9f320977288cc`). These are pinned gitlinks at the reference commit. Static source review alone cannot establish which HAL or USB objects each fixture links. Keep their own notices with any redistributed builder/runtime and obtain a link map from the actual build before a complete binary notice claim.

## Reproduce the file comparison

```bash
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/qmk/qmk_firmware.git qmk-reference
git -C qmk-reference fetch --depth 1 origin ba9642c83dc78050c7e9764c6dcb128076aef691
for file in $(find firmware/core -type f | sort); do
  rel=${file#firmware/core/}
  git -C qmk-reference show "FETCH_HEAD:$rel" | cmp - "$file" || true
done
```

The comparison identifies source provenance and local changes. It does not replace review of transitive component notices, source offer obligations, or linked object provenance.
