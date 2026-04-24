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
        STATUS=$(cat /tmp/build_status 2>/dev/null || echo "unknown")

        LOG_JSON="["
        first=1
        while IFS= read -r line; do
            escaped=$(json_esc "$line")
            if [ "$first" = "1" ]; then
                LOG_JSON="${LOG_JSON}\"${escaped}\""
                first=0
            else
                LOG_JSON="${LOG_JSON},\"${escaped}\""
            fi
        done < <(cat /tmp/build_log 2>/dev/null)
        LOG_JSON="${LOG_JSON}]"

        ARTIFACT=$(tr -d '[:space:]' < /tmp/artifact_path 2>/dev/null)
        if [ -n "$ARTIFACT" ] && [ -f "$ARTIFACT" ]; then
            AVAIL="true"
        else
            AVAIL="false"
        fi

        BODY="{\"status\":\"${STATUS}\",\"log\":${LOG_JSON},\"artifact_available\":${AVAIL}}"
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
