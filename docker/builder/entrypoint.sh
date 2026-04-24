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

# Self-destruct after 10 minutes whether or not the artifact was downloaded.
# Use PID 1 (this script, before exec) so the signal reaches socat after exec.
_self=$$
(sleep 600 && kill -TERM "$_self") &

exec socat TCP-LISTEN:8080,reuseaddr,fork EXEC:/api.sh
