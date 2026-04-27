import re


def safe_name(name: str) -> str:
    """Sanitize keyboard name for use in env vars and paths."""
    return re.sub(r'[^a-z0-9_]', '_', name.lower())[:32] or 'keyboard'
