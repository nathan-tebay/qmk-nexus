# AVR Test Plan

Created `AVR_TEST_PLAN.md` at repo root of QMK Nexus.

## Purpose
Add firmware validation/simulation to QMK Nexus as a first-class feature. This should validate generated QMK source, compile target firmware, emit structured test reports, and later run AVR-focused simulator checks.

## Recommended user-facing shape
Add separate actions in Build stage:
- Build Firmware
- Validate Firmware
- Run Simulation (later/experimental)

Avoid promising full MCU/HID simulation early.

## Architecture
Preferred: separate firmware test routes, not normal build route overload:
- `POST /api/firmware-tests/{keyboard_id}`
- `GET /api/firmware-tests/{test_id}/status`
- `GET /api/firmware-tests/{test_id}/report`

Flow:
`KeyboardConfig -> sanitize/validate -> generate_all() -> generate test-plan.json -> dispatch builder JOB_KIND=verify -> builder emits test-report.json -> frontend polls/displays report`.

## Code touchpoints
- Backend: `backend/codegen/test_plan.py`, `backend/routers/firmware_tests.py`, optional later `backend/job_runner.py` shared helper.
- Models: `FirmwareTestStatus` similar to `BuildStatus` but with `report_available` and `summary`.
- Builder: `docker/builder/firmware_test.sh`; update `entrypoint.sh` to dispatch on `JOB_KIND=build|verify`; add `/report` to `api.sh`; add proxy report route in `server.py`; update `fargate_build.py` and `aws_builds.py` for verify jobs/S3 report upload.
- Frontend: `frontend/src/api/firmwareTests.ts`, `frontend/src/stages/build/FirmwareTestPanel.tsx`, optional `frontend/src/store/firmwareTest.ts`; integrate in `BuildStage.tsx` near `BuildPanel`.

## Phases
1. Compile/static validation report: source files exist, JSON parses, keymap/layer/layout checks, QMK compile succeeds, artifact exists, size/warnings/errors recorded.
2. Generate `test-plan.json` from `KeyboardConfig` via `backend/codegen/test_plan.py`.
3. Add Linux C++17 runner under `docker/builder/firmware_lab/` using CMake; parses test plan, runs backends, emits deterministic `test-report.json`.
4. Add simavr backend for AVR targets (`atmega32u4`, `atmega32u2`, `at90usb1286`, `atmega328p`) with modest checks first: load firmware, start sim, reach checkpoint/debug hook if available, timeout cleanly.
5. Later consider deeper matrix injection/HID report assertions.

## Caveats
Current builder Dockerfile removes QMK `tests/`; keep/copy needed harness if QMK native host tests are used. Full USB HID host validation is hard; do not make it MVP.

## Portfolio framing
"QMK Nexus Firmware Test Lab validates generated embedded firmware by compiling target QMK output, generating behavioral test plans, and running pluggable host/simulator backends from a Linux C++17 test runner."
