import logging
import json

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum
from starlette.middleware.base import BaseHTTPMiddleware

from config import settings
from routers import auth, keyboards, builds, qmk, telemetry


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }
        if record.exc_info:
            data['exc'] = self.formatException(record.exc_info)
        return json.dumps(data)


def _configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers = [handler]


_configure_logging()
logger = logging.getLogger('qmk-nexus')

_SAFE_METHODS = frozenset({'GET', 'HEAD', 'OPTIONS'})
_CSRF_HEADER = 'x-qmk-csrf'
_MAX_BODY_DEFAULT = 512 * 1024   # 512 KB
_MAX_BODY_LARGE = 2 * 1024 * 1024  # 2 MB for keyboard upload paths
_LARGE_BODY_PATHS = ('/api/keyboards',)


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if (
            request.method not in _SAFE_METHODS
            and request.url.path.startswith('/api/')
            and not request.url.path.startswith('/api/auth/')
            and not request.headers.get(_CSRF_HEADER)
        ):
            return JSONResponse({'detail': 'CSRF check failed'}, status_code=403)
        return await call_next(request)


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        limit = (
            _MAX_BODY_LARGE
            if any(request.url.path.startswith(p) for p in _LARGE_BODY_PATHS)
            else _MAX_BODY_DEFAULT
        )
        cl = request.headers.get('content-length')
        if cl and int(cl) > limit:
            return JSONResponse({'detail': 'Request body too large'}, status_code=413)
        return await call_next(request)


app = FastAPI(title='QMK Nexus', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, 'http://qmknexus.local'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['content-type', _CSRF_HEADER],
)
app.add_middleware(CSRFMiddleware)
app.add_middleware(BodySizeLimitMiddleware)

app.include_router(auth.router, prefix='/api')
app.include_router(keyboards.router, prefix='/api')
app.include_router(builds.router, prefix='/api')
app.include_router(qmk.router, prefix='/api')
app.include_router(telemetry.router, prefix='/api')


@app.on_event('startup')
async def _startup() -> None:
    if settings.is_prod and not settings.builder_qmk_commit:
        logger.warning(
            'builder_qmk_commit not set in production — version mismatch checks will be skipped'
        )


@app.get('/api/health')
async def health():
    return {'status': 'ok'}


handler = Mangum(app)
