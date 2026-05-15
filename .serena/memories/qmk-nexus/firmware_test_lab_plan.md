# Firmware Test Lab / Simulation Plan

User explored adding QMK firmware validation/simulation to QMK Nexus, partly to align with Sphere/AED hardware-software role.

## Current project hooks
- Build route: `backend/routers/builds.py` stages generated sources with `generate_all(config, build_dir)` into `/tmp/tebay-builds/<id>/src`.
- Builder image: `docker/builder/Dockerfile`, runtime scripts `build.sh`, `entrypoint.sh`, `api.sh`, local proxy `server.py`, ECS worker `fargate_build.py`.
- Frontend build UI: `frontend/src/stages/build/BuildStage.tsx`, `BuildPanel.tsx`, `frontend/src/api/builds.ts`, `frontend/src/store/build.ts`.
- Existing status model: `backend/models.py::BuildStatus`; Dynamo records are flexible enough to add job/report fields.

## Recommended design
Add a separate Firmware Test/Verify job, not inside normal firmware build initially.
- Backend: new `backend/codegen/test_plan.py` from `KeyboardConfig`; new router `backend/routers/firmware_tests.py` or extend builds with `job_kind=verify`.
- Builder: add `firmware_test.sh`; dispatch via `JOB_KIND=build|verify` in `entrypoint.sh` and Fargate env. Add `/report` route in `api.sh` and proxy route in `docker/builder/server.py`.
- Frontend: add `FirmwareTestPanel` beside `BuildPanel` with Validate/Simulation button, log view, report summary.

## Phases
1. Compile + source validation report (already has most pieces).
2. Host-side QMK behavior tests using generated `test-plan.json` and QMK test harness. Note current builder Dockerfile removes QMK `tests/`; must keep tests or copy needed harness.
3. C++17 Linux runner inside builder (`tools/firmware_lab` or `docker/builder/firmware_lab`) using CMake/GoogleTest. Reads `test-plan.json`, runs compile/test/sim backends, emits `test-report.json`.
4. simavr backend for AVR targets first; avoid full USB HID emulation initially. Use serial/log/assertion hooks or matrix-state checks.
5. Later Renode/Wokwi backend for RP2040/ARM where platform support allows.

## Caveats
- QMK host tests are not true MCU simulation.
- Full USB HID host validation in simavr/Renode is hard; do not promise broad MCU simulation first.
- qmk_json/upstream/custom-matrix boards should start with compile + keymap/layout checks; generated simple matrix boards are the best first simulation targets.
