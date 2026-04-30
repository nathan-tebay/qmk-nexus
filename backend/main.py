import logging
import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

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

app = FastAPI(title='QMK Nexus', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, 'http://qmknexus.local'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth.router, prefix='/api')
app.include_router(keyboards.router, prefix='/api')
app.include_router(builds.router, prefix='/api')
app.include_router(qmk.router, prefix='/api')
app.include_router(telemetry.router, prefix='/api')


@app.get('/api/health')
async def health():
    return {'status': 'ok'}


handler = Mangum(app)
