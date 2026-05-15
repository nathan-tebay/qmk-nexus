import re


def safe_name(name: str) -> str:
    """Sanitize keyboard name for use in env vars and paths."""
    s = re.sub(r'[^a-z0-9_]', '_', name.lower())
    s = re.sub(r'_+', '_', s).strip('_')
    return s[:32].rstrip('_') or 'keyboard'
