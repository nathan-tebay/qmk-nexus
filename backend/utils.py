from fastapi.encoders import jsonable_encoder

from naming import safe_name


def jsonable_out(m):
    """Serialize a Pydantic model with camelCase aliases for API responses."""
    if hasattr(m, 'model_dump'):
        return jsonable_encoder(m.model_dump(by_alias=True))
    return jsonable_encoder(m)
