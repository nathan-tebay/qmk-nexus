import re
from fastapi.encoders import jsonable_encoder


def jsonable_out(m):
    """Serialize a Pydantic model with camelCase aliases for API responses."""
    if hasattr(m, 'model_dump'):
        return jsonable_encoder(m.model_dump(by_alias=True))
    return jsonable_encoder(m)


def safe_name(name: str) -> str:
    """Sanitize keyboard name for use in env vars and paths."""
    return re.sub(r'[^a-z0-9_]', '_', name.lower())[:32] or 'keyboard'
