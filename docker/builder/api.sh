#!/bin/bash
# socat HTTP handler: /health, /status, /download

read -r REQUEST_LINE
REQ_PATH=$(echo "$REQUEST_LINE" | cut -d' ' -f2)

# consume headers
while IFS= read -r header; do
    header="${header%$'\r'}"
    [ -z "$header" ] && break
done

http_200() {
    local ct="$1" body="$2"
    printf "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %d\r\n\r\n%s" "$ct" "${#body}" "$body"
}

http_err() {
    local code="$1"
    printf "HTTP/1.1 %s\r\nContent-Length: 0\r\n\r\n" "$code"
}

json_esc() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g'
}

case "$REQ_PATH" in
    /health)
        http_200 "application/json" '{"status":"ok"}'
        ;;

    /status)
        BODY=$(python3 - <<'PY'
import json
from pathlib import Path

status = Path('/tmp/build_status').read_text(errors='replace').strip() if Path('/tmp/build_status').exists() else 'unknown'
log = Path('/tmp/build_log').read_text(errors='replace').splitlines() if Path('/tmp/build_log').exists() else []
artifact = Path('/tmp/artifact_path').read_text(errors='replace').strip() if Path('/tmp/artifact_path').exists() else ''
print(json.dumps({
    'status': status,
    'log': log,
    'artifact_available': bool(artifact and Path(artifact).is_file()),
}))
PY
)
        http_200 "application/json" "$BODY"
        ;;

    /download)
        ARTIFACT=$(tr -d '[:space:]' < /tmp/artifact_path 2>/dev/null)
        if [ -z "$ARTIFACT" ] || [ ! -f "$ARTIFACT" ]; then
            http_err "404 Not Found"
            exit 0
        fi
        SIZE=$(stat -c%s "$ARTIFACT")
        FILENAME=$(basename "$ARTIFACT")
        printf "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=\"%s\"\r\nContent-Length: %d\r\n\r\n" \
            "$FILENAME" "$SIZE"
        cat "$ARTIFACT"
        ;;

    *)
        http_err "404 Not Found"
        ;;
esac
