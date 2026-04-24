#!/bin/bash
# Starts build in background, serves HTTP on :8080 via socat for status/download polling.

echo "building" > /tmp/build_status
: > /tmp/build_log
: > /tmp/artifact_path

(
    /usr/local/bin/build.sh >> /tmp/build_log 2>&1
    if [ $? -eq 0 ]; then
        ARTIFACT=$(find /build/output -maxdepth 1 \( -name "*.hex" -o -name "*.uf2" -o -name "*.bin" \) 2>/dev/null | head -1)
        echo "$ARTIFACT" > /tmp/artifact_path
        echo "success" > /tmp/build_status
    else
        echo "failed" > /tmp/build_status
    fi
) &

# Kill container if not downloaded within 10 minutes
(sleep 600 && kill -TERM $$) &

exec socat TCP-LISTEN:8080,reuseaddr,fork EXEC:/api.sh
