# QMK Nexus AVR Firmware Test Plan

## Purpose

Add a firmware validation and simulation layer to QMK Nexus that proves generated QMK firmware is more than syntactically buildable. The goal is to validate generated source, compile target firmware, produce structured reports, and later run AVR-focused simulator checks against selected MCUs.

This feature also strengthens QMK Nexus as a hardware/software integration project: generated embedded firmware, Linux build orchestration, C++17 test tooling, containerized toolchains, and simulator-backed validation.

## Current QMK Nexus Hooks

The existing project already has most of the infrastructure needed:

- `backend/routers/builds.py` stages generated sources and manages build lifecycle.
- `backend/codegen/generator.py` emits QMK source files into `build_dir/src`.
- `docker/builder/build.sh` compiles firmware with the vendored QMK tree.
- `docker/builder/entrypoint.sh` starts build jobs and exposes status through socat.
- `docker/builder/api.sh` serves `/status` and `/download` from the builder container.
- `docker/builder/server.py` is the local build proxy used in development.
- `docker/builder/fargate_build.py` runs production builds in ECS/Fargate.
- `frontend/src/stages/build/BuildPanel.tsx` already displays build status and logs.
- `frontend/src/api/builds.ts` already wraps build API calls.

Do not make this a separate app. Add it as a firmware validation/test job inside QMK Nexus.

## User-Facing Shape

Add firmware testing beside normal builds:

```text
Build Firmware
Validate Firmware
Run Simulation   (later)
```

Initial UI should avoid over-promising full MCU simulation. Use names like:

- `Validate Firmware`
- `Firmware Test Report`
- `Simulation: Experimental`

## Recommended Architecture

Use a separate job type from firmware builds.

Preferred backend route:

```text
POST /api/firmware-tests/{keyboard_id}
GET  /api/firmware-tests/{test_id}/status
GET  /api/firmware-tests/{test_id}/report
```

Alternative: extend `/api/builds` with `jobKind=build|verify`, but a separate router is cleaner and avoids mixing firmware artifact downloads with validation reports.

High-level flow:

```text
KeyboardConfig
  -> sanitize + validate
  -> generate_all(config, build_dir)
  -> generate test-plan.json
  -> dispatch builder with JOB_KIND=verify
  -> builder compiles/runs checks
  -> builder emits test-report.json
  -> frontend polls status and displays report
```

## Phase 1 — Compile + Static Validation Report

Fastest useful MVP.

Checks:

- Generated source files exist.
- `keyboard.json` / `info.json` parses.
- `keymap.c` exists and contains expected layer count.
- Layout macro is present where expected.
- QMK compile succeeds.
- Artifact file exists.
- Firmware size is recorded.
- Warnings/errors are captured.

Example report:

```json
{
  "status": "passed",
  "keyboard": "My Keyboard",
  "mcu": "atmega32u4",
  "sourceMode": "generated",
  "checks": [
    { "name": "source_files", "status": "passed" },
    { "name": "keyboard_json_parse", "status": "passed" },
    { "name": "qmk_compile", "status": "passed" },
    { "name": "artifact_exists", "status": "passed" }
  ],
  "artifact": {
    "filename": "my_keyboard_default.hex",
    "bytes": 28672
  },
  "logTail": []
}
```

## Phase 2 — Generated Test Plan

Add:

```text
backend/codegen/test_plan.py
```

Generate `/build/test-plan.json` from `KeyboardConfig`.

Example:

```json
{
  "version": 1,
  "keyboard": "My Keyboard",
  "mcu": "atmega32u4",
  "sourceMode": "generated",
  "matrix": [
    { "row": 0, "col": 0, "keyId": "k0", "expected": "KC_A" },
    { "row": 0, "col": 1, "keyId": "k1", "expected": "KC_B" }
  ],
  "layers": [
    { "index": 0, "id": "layer0", "name": "Base" }
  ],
  "features": {
    "encoder": false,
    "rgb_matrix": false,
    "split_keyboard": false
  }
}
```

Use this as the contract between Python codegen and the future C++17 test runner.

## Phase 3 — C++17 Firmware Test Runner

Add a Linux C++17 runner inside the builder image.

Suggested path:

```text
docker/builder/firmware_lab/
  CMakeLists.txt
  src/main.cpp
  src/TestPlan.cpp
  src/TestReport.cpp
  src/QmkCompileBackend.cpp
  src/SimAvrBackend.cpp
  tests/
```

Command shape:

```bash
firmware-lab \
  --src /build/src \
  --plan /build/test-plan.json \
  --out /build/output/test-report.json
```

Responsibilities:

- Parse `test-plan.json`.
- Run compile/static checks.
- Normalize log output.
- Run simulator backend when supported.
- Emit deterministic `test-report.json`.
- Exit nonzero only for hard validation failures.

This is the strongest Sphere/AED-aligned component because it demonstrates:

- C++17
- CMake
- Linux tooling
- process orchestration
- structured test reports
- hardware/software boundary thinking
- simulator backend abstraction

## Phase 4 — AVR Simulation Backend

Start with AVR targets only:

- `atmega32u4`
- `atmega32u2`
- `at90usb1286`
- `atmega328p`

Candidate tool:

- `simavr`

Initial sim checks should be modest:

- Firmware ELF/HEX loads.
- Simulator starts.
- Main loop reaches a known debug/checkpoint hook if available.
- Matrix dimensions/config are compatible with generated test plan.
- Sim exits cleanly or reaches timeout with useful diagnostics.

Do **not** start by promising full USB HID host validation. That is much harder.

Full target later:

```text
inject virtual matrix event
  -> firmware scans matrix
  -> firmware emits HID report
  -> test runner asserts expected keycode/report
```

This may require QMK debug instrumentation, custom matrix hooks, or a special test firmware mode.

## Builder Changes

Add a verify mode to `docker/builder/entrypoint.sh`:

```bash
if [ "${JOB_KIND:-build}" = "verify" ]; then
    /usr/local/bin/firmware_test.sh >> /tmp/build_log 2>&1
else
    /usr/local/bin/build.sh >> /tmp/build_log 2>&1
fi
```

Add:

```text
docker/builder/firmware_test.sh
```

MVP shell version can:

1. inspect source files
2. run `/usr/local/bin/build.sh`
3. collect artifact info
4. write `/build/output/test-report.json`

Later, `firmware_test.sh` invokes `firmware-lab`.

Add `/report` endpoint to:

- `docker/builder/api.sh`
- `docker/builder/server.py`

For ECS/Fargate:

- pass `JOB_KIND=verify`
- upload `report/test-report.json` to S3
- include `report_available` in status JSON

## Backend Changes

Add:

```text
backend/codegen/test_plan.py
backend/routers/firmware_tests.py
```

Model sketch:

```python
class FirmwareTestStatus(BaseModel):
    model_config = _camel()

    id: str
    keyboard_id: str
    status: str
    log: list[str] = Field(default_factory=list)
    report_available: bool = False
    error: str | None = None
    summary: dict | None = None
    keyboard_name: str | None = None
    created_at: str | None = None
    mode: str | None = None
    mcu: str | None = None
```

Reuse build concepts from `backend/routers/builds.py`, but avoid duplicating too much. Candidate refactor later:

```text
backend/job_runner.py
```

Shared helpers could handle:

- build directory creation
- build/test cookie handling
- proxy dispatch
- ECS dispatch
- status normalization

Do not refactor first. Add the test path small, then unify if duplication becomes painful.

## Frontend Changes

Add:

```text
frontend/src/api/firmwareTests.ts
frontend/src/stages/build/FirmwareTestPanel.tsx
frontend/src/store/firmwareTest.ts   (optional)
```

Display:

- status pill
- log view
- report summary
- failed checks
- copy report button

Integrate into `BuildStage.tsx` below or beside `BuildPanel`.

## QMK Test Harness Caveat

Current builder image removes QMK `tests/` during Docker build:

```dockerfile
rm -rf ... tests ...
```

If using QMK native host tests, keep the needed QMK test harness in the image or copy a minimal subset. Otherwise Phase 1 can run without QMK tests, relying on compile/static checks.

## Scope Guardrails

Good first promise:

> QMK Nexus validates generated firmware by compiling target QMK output, checking generated source structure, and producing a structured firmware test report.

Good later promise:

> Experimental AVR simulation runs selected generated firmware through a simulator backend for deeper regression checks.

Avoid early promise:

> Simulates every QMK keyboard and verifies exact USB HID output.

That is too broad and likely false for many boards, especially custom matrix, split, and upstream-native keyboards.

## Best First MVP

1. Add `FirmwareTestPanel`.
2. Add firmware test backend route.
3. Reuse `generate_all()`.
4. Add `backend/codegen/test_plan.py`.
5. Add `JOB_KIND=verify` to builder.
6. Add `firmware_test.sh` that runs compile + report generation.
7. Add `/report` through builder API/proxy.
8. Display report in UI.

Then add C++17 runner and simavr backend.

## Portfolio Framing

Use this summary:

> QMK Nexus Firmware Test Lab validates generated embedded firmware by compiling target QMK output, generating behavioral test plans, and running pluggable host/simulator backends from a Linux C++17 test runner.

This frames the work as hardware/software integration, not just keyboard tooling.
