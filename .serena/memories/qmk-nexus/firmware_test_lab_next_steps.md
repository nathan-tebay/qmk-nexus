# Firmware Test Lab Next Steps

When implementing AVR/Firmware Test Lab in QMK Nexus, do this order:

1. Add `backend/codegen/test_plan.py` to serialize key matrix/layers/features from `KeyboardConfig` into `test-plan.json`.
2. Add a minimal `firmware_test.sh` in `docker/builder/` that:
   - checks `/build/src`
   - runs existing `/usr/local/bin/build.sh`
   - detects artifact/size
   - writes `/build/output/test-report.json`
3. Update `entrypoint.sh` to branch on `JOB_KIND=verify`.
4. Add `/report` to `api.sh` and local proxy `server.py`.
5. Add `backend/routers/firmware_tests.py` mirroring core build trigger/status/report behavior but returning report instead of firmware artifact.
6. Add frontend `FirmwareTestPanel.tsx` and `firmwareTests.ts`; put it near BuildPanel on Stage 3.
7. Only after MVP works, add C++17 runner under `docker/builder/firmware_lab/` with CMake/GoogleTest.
8. Only after C++ runner works, add simavr backend for AVR simulation.

Keep Phase 1 small. Compile + structured report already has user value and reduces risk.