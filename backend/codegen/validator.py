from __future__ import annotations

import json
import re

MAX_FILE_BYTES  = 65_536   # 64 KB per file
MAX_TOTAL_BYTES = 262_144  # 256 KB total

ALLOWED_FILES = frozenset({'keyboard.c', 'keyboard.h', 'config.h', 'rules.mk', 'keymap.c', 'info.json'})

_FORBIDDEN_INCLUDES = re.compile(
    r'#\s*include\s*[<"](stdlib\.h|stdio\.h|unistd\.h|dlfcn\.h|sys/|linux/|windows\.h)',
    re.IGNORECASE,
)

_FORBIDDEN_CALLS = re.compile(
    r'\b(system|popen|fork|execve|execvp|execle|execlp|execv|execl)\s*\(',
)

_SHELL_EXPAND = re.compile(r'\$\(\s*shell\b', re.IGNORECASE)


def _check_c(name: str, text: str) -> list[str]:
    errors: list[str] = []
    for lineno, line in enumerate(text.splitlines(), 1):
        if _FORBIDDEN_INCLUDES.search(line):
            errors.append(f'{name}:{lineno}: forbidden system include')
        m = _FORBIDDEN_CALLS.search(line)
        if m:
            errors.append(f'{name}:{lineno}: forbidden function call: {m.group(1)}()')
        if _SHELL_EXPAND.search(line):
            errors.append(f'{name}:{lineno}: shell expansion not allowed in C source')
    return errors


def _check_rules_mk(name: str, text: str) -> list[str]:
    errors: list[str] = []
    for lineno, line in enumerate(text.splitlines(), 1):
        stripped = line.lstrip('\t')
        if line.startswith('\t') and not stripped.startswith('#') and stripped.strip():
            errors.append(f'{name}:{lineno}: make recipe line not allowed (shell execution risk)')
        if _SHELL_EXPAND.search(line):
            errors.append(f'{name}:{lineno}: $(shell ...) expansion not allowed')
        if re.match(r'^\s*include\s+[/.]', line):
            errors.append(f'{name}:{lineno}: include of external path not allowed')
    return errors


def validate_upload(files: dict[str, str]) -> list[str]:
    """Validate a mapping of {filename: text_content}. Returns error list — empty means OK."""
    errors: list[str] = []
    total = 0

    for name, content in files.items():
        if name not in ALLOWED_FILES:
            errors.append(f'{name}: filename not allowed (expected one of {", ".join(sorted(ALLOWED_FILES))})')
            continue

        try:
            raw = content.encode('utf-8')
        except Exception:
            errors.append(f'{name}: content is not valid UTF-8')
            continue

        total += len(raw)
        if len(raw) > MAX_FILE_BYTES:
            errors.append(f'{name}: file size {len(raw) // 1024} KB exceeds {MAX_FILE_BYTES // 1024} KB limit')
            continue  # skip deep scan on huge files

        if name.endswith(('.c', '.h')):
            errors.extend(_check_c(name, content))
        elif name == 'rules.mk':
            errors.extend(_check_rules_mk(name, content))
        elif name == 'info.json':
            try:
                json.loads(content)
            except json.JSONDecodeError as exc:
                errors.append(f'{name}: invalid JSON — {exc}')

    if total > MAX_TOTAL_BYTES:
        errors.append(f'Total upload size {total // 1024} KB exceeds {MAX_TOTAL_BYTES // 1024} KB limit')

    return errors


def validate_keymap_json(payload: dict) -> list[str]:
    """Validate a decoded keymap.json payload. Returns list of errors — empty means OK."""
    errors = []
    for field in ('version', 'keyboard', 'keymap', 'layout', 'layers'):
        if field not in payload:
            errors.append(f'missing required field: {field}')
    if errors:
        return errors  # can't validate further without required fields
    if not isinstance(payload['layers'], list) or len(payload['layers']) == 0:
        errors.append('layers must be a non-empty list')
    else:
        layer_lengths = [len(l) for l in payload['layers'] if isinstance(l, list)]
        if len(set(layer_lengths)) > 1:
            errors.append(f'all layers must have the same length; got {sorted(set(layer_lengths))}')
    if not payload.get('keyboard'):
        errors.append('keyboard must not be empty')
    if not payload.get('layout'):
        errors.append('layout must not be empty')
    return errors
