#!/usr/bin/env python3
"""
Local dev proxy for QMK Nexus build service.
Spawns the qmk-nexus-builder container via Podman (detached, random port)
and proxies status/logs/artifact requests to the container's socat HTTP server.
Zero external dependencies — Python 3.11+ stdlib only.
"""

import json
import os
import re
import shutil
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("DEV_SERVER_PORT", "8080"))
BIND_HOST = os.environ.get("BIND_HOST", "127.0.0.1")  # nginx proxies from same host
BUILD_IMAGE = os.environ.get("BUILD_IMAGE", "qmk-nexus-builder")
BUILDS_ROOT = Path(os.environ.get("BUILDS_ROOT", "/tmp/tebay-builds"))
BUILD_TIMEOUT = int(os.environ.get("BUILD_TIMEOUT", "600"))
PODMAN_BIN = os.environ.get("PODMAN_BIN", "podman")
CONTAINER_HOST = os.environ.get("CONTAINER_HOST", "")

# {build_id: {build_id, status, container_id, port, started_at, finished_at, error, cached_status}}
builds: dict[str, dict] = {}
build_locks: dict[str, threading.Lock] = {}
global_lock = threading.Lock()


def _podman_base() -> list[str]:
    if CONTAINER_HOST:
        return [PODMAN_BIN, "--remote", f"--url={CONTAINER_HOST}"]
    return [PODMAN_BIN]


def podman(*args, **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run([*_podman_base(), *args], **kwargs)


def _container_get(port: str, path: str, timeout: int = 5) -> tuple[int, bytes, dict]:
    """HTTP GET to container socat server. Returns (status_code, body, headers)."""
    conn = HTTPConnection("localhost", int(port), timeout=timeout)
    conn.request("GET", path)
    r = conn.getresponse()
    body = r.read()
    headers = dict(r.getheaders())
    conn.close()
    return r.status, body, headers


def spawn_build(build_id: str, payload: dict) -> None:
    """
    Spawn builder container detached with a random host port mapped to :8080.
    Container mounts build_dir at /build and serves socat HTTP on :8080.
    """
    build_dir = BUILDS_ROOT / build_id
    build_dir.mkdir(parents=True, exist_ok=True)
    (build_dir / "output").mkdir(exist_ok=True)

    # When a caller-provided build_id is used, the backend pre-places source
    # files in src/ before posting here.  Fail fast rather than spawning a
    # container against an empty directory.
    src_dir = build_dir / "src"
    if not src_dir.exists() or not any(src_dir.iterdir()):
        with build_locks[build_id]:
            builds[build_id]["status"] = "failed"
            builds[build_id]["error"] = "src/ directory missing or empty — codegen may not have completed"
            builds[build_id]["finished_at"] = datetime.now(timezone.utc).isoformat()
        return

    env_vars = payload.get("env", {})
    extra_args = payload.get("args", [])
    if isinstance(extra_args, str):
        extra_args = [extra_args]

    cmd = [
        *_podman_base(), "run", "-d",
        "-p", "0:8080",
        "-v", f"{build_dir}:/build:Z",
    ]
    for key, val in env_vars.items():
        cmd += ["-e", f"{key}={val}"]
    cmd.append(BUILD_IMAGE)
    cmd += extra_args

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        container_id = result.stdout.strip()

        port_out = subprocess.run(
            [*_podman_base(), "port", container_id, "8080"],
            capture_output=True, text=True, check=True,
        )
        port = port_out.stdout.strip().rsplit(":", 1)[-1]

        with build_locks[build_id]:
            builds[build_id]["container_id"] = container_id
            builds[build_id]["port"] = port
            builds[build_id]["status"] = "running"

    except subprocess.CalledProcessError as exc:
        with build_locks[build_id]:
            builds[build_id]["status"] = "error"
            builds[build_id]["error"] = exc.stderr.strip()
            builds[build_id]["finished_at"] = datetime.now(timezone.utc).isoformat()


def _poll_status(build_id: str) -> dict:
    """
    Fetch /status from the container's socat HTTP server.
    Falls back to cached data if the container is unreachable.
    Container status values: building | success | failed
    """
    info = builds.get(build_id, {})
    port = info.get("port")
    container_id = info.get("container_id")

    if not port:
        return {"status": info.get("status", "queued"), "log": [], "artifact_available": False}

    try:
        code, body, _ = _container_get(port, "/status")
        if code == 200:
            data = json.loads(body)
            container_status = data.get("status", "building")
            terminal = container_status in ("success", "failed")

            with build_locks[build_id]:
                builds[build_id]["cached_status"] = data
                if terminal and builds[build_id]["status"] == "running":
                    builds[build_id]["status"] = container_status
                    builds[build_id]["finished_at"] = datetime.now(timezone.utc).isoformat()

            return data
    except OSError:
        pass

    # Container unreachable — use cache or inspect
    cached = info.get("cached_status")
    if cached:
        return cached

    if container_id:
        r = subprocess.run(
            [*_podman_base(), "inspect", "--format", "{{.State.Status}}", container_id],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            with build_locks[build_id]:
                if builds[build_id]["status"] == "running":
                    builds[build_id]["status"] = "failed"
                    builds[build_id]["error"] = "Container exited unexpectedly"
                    builds[build_id]["finished_at"] = datetime.now(timezone.utc).isoformat()

    return {"status": builds[build_id].get("status", "unknown"), "log": [], "artifact_available": False}


class BuildHandler(BaseHTTPRequestHandler):
    ROUTE_BUILDS   = re.compile(r"^/builds/?$")
    ROUTE_STATUS   = re.compile(r"^/builds/([\w-]+)/status/?$")
    ROUTE_LOGS     = re.compile(r"^/builds/([\w-]+)/logs/?$")
    ROUTE_ARTIFACT = re.compile(r"^/builds/([\w-]+)/artifact/?$")
    ROUTE_BUILD    = re.compile(r"^/builds/([\w-]+)/?$")

    def log_message(self, format, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.command} {self.path} → {args[1]}")

    def _send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def _get_build_id(self, pattern: re.Pattern) -> str | None:
        m = pattern.match(self.path)
        return m.group(1) if m else None

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if not self.ROUTE_BUILDS.match(self.path):
            self._send_json(404, {"error": "not found"})
            return

        payload = self._read_body()
        # Accept a caller-provided build_id (e.g. from the backend which has
        # already written source files into BUILDS_ROOT/{build_id}/src/).
        build_id = payload.get("build_id") or str(uuid.uuid4())[:8]

        with global_lock:
            builds[build_id] = {
                "build_id": build_id,
                "status": "queued",
                "container_id": None,
                "port": None,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "finished_at": None,
                "error": None,
                "cached_status": None,
            }
            build_locks[build_id] = threading.Lock()

        threading.Thread(target=spawn_build, args=(build_id, payload), daemon=True).start()
        self._send_json(201, {"build_id": build_id, "status": "queued"})

    def do_GET(self):
        # List all builds
        if self.ROUTE_BUILDS.match(self.path):
            self._send_json(200, {"builds": list(builds.values())})
            return

        # GET /builds/{id}/status — proxy to container /status
        build_id = self._get_build_id(self.ROUTE_STATUS)
        if build_id:
            if build_id not in builds:
                self._send_json(404, {"error": "build not found"})
                return
            container_data = _poll_status(build_id)
            self._send_json(200, {**builds[build_id], "container": container_data})
            return

        # GET /builds/{id}/logs — extract log array as plain text
        build_id = self._get_build_id(self.ROUTE_LOGS)
        if build_id:
            if build_id not in builds:
                self._send_json(404, {"error": "build not found"})
                return
            data = _poll_status(build_id)
            body = "\n".join(data.get("log", [])).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # GET /builds/{id}/artifact — proxy to container /download
        build_id = self._get_build_id(self.ROUTE_ARTIFACT)
        if build_id:
            if build_id not in builds:
                self._send_json(404, {"error": "build not found"})
                return
            port = builds[build_id].get("port")
            if not port:
                self._send_json(503, {"error": "container not ready"})
                return
            try:
                code, body, headers = _container_get(port, "/download", timeout=30)
                if code == 404:
                    self._send_json(404, {"error": "artifact not ready"})
                    return
                cd = headers.get(
                    "Content-Disposition",
                    f'attachment; filename="build-{build_id}.bin"',
                )
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Disposition", cd)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except OSError as exc:
                self._send_json(502, {"error": f"container unreachable: {exc}"})
            return

        self._send_json(404, {"error": "not found"})

    def do_DELETE(self):
        build_id = self._get_build_id(self.ROUTE_BUILD)
        if not build_id or build_id not in builds:
            self._send_json(404, {"error": "build not found"})
            return

        container_id = builds[build_id].get("container_id")
        if container_id:
            podman("rm", "-f", container_id, capture_output=True)

        build_dir = BUILDS_ROOT / build_id
        if build_dir.exists():
            shutil.rmtree(build_dir, ignore_errors=True)

        with global_lock:
            builds.pop(build_id, None)
            build_locks.pop(build_id, None)

        self._send_json(200, {"build_id": build_id, "deleted": True})


def main():
    BUILDS_ROOT.mkdir(parents=True, exist_ok=True)

    try:
        r = subprocess.run([PODMAN_BIN, "--version"], capture_output=True, text=True, check=True)
        print(f"Using: {r.stdout.strip()}")
    except (FileNotFoundError, subprocess.CalledProcessError):
        print(f"ERROR: '{PODMAN_BIN}' not found. Install podman or set PODMAN_BIN.")
        raise SystemExit(1)

    server = ThreadingHTTPServer((BIND_HOST, PORT), BuildHandler)
    print(f"Build proxy  http://{BIND_HOST}:{PORT}  (nginx → qmkbuild.local)")
    print(f"Image        {BUILD_IMAGE}")
    print(f"Builds dir   {BUILDS_ROOT}")
    print()
    print(f"  POST   /builds                    trigger build")
    print(f"  GET    /builds                    list builds")
    print(f"  GET    /builds/{{id}}/status        poll container")
    print(f"  GET    /builds/{{id}}/logs          stream logs")
    print(f"  GET    /builds/{{id}}/artifact      download firmware")
    print(f"  DELETE /builds/{{id}}               cancel + cleanup")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        for bid, info in list(builds.items()):
            cid = info.get("container_id")
            if cid and info.get("status") == "running":
                print(f"  Killing {cid[:12]}")
                podman("rm", "-f", cid, capture_output=True)
        server.server_close()


if __name__ == "__main__":
    main()
