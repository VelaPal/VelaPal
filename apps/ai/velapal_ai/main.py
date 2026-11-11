import asyncio
import hmac
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from fastapi import FastAPI, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from .config import Settings
from .evidence import EvidenceService
from .http import Gateway, ServiceError
from .models import IndexRequest, RevokeRequest, RunRequest, ResumeRequest
from .provider import Model
from .registry import Registry
from .vector import VectorStore
from .workflow import Workflow

@asynccontextmanager
async def lifespan(app):
    settings = Settings.load()
    path = Path(settings.data_dir) / "graph.sqlite"
    async with AsyncSqliteSaver.from_conn_string(str(path)) as saver:
        await saver.setup()
        try: path.chmod(0o600)
        except OSError: pass
        registry = Registry(Path(settings.data_dir) / "registry.sqlite", saver)
        await registry.setup();await registry.expire()
        model, gateway, vector = Model(settings), Gateway(settings), VectorStore(settings)
        app.state.settings, app.state.vector = settings, vector
        app.state.workflow = Workflow(settings, model, gateway, vector, saver, registry)
        app.state.evidence = EvidenceService(settings, model, gateway, vector, registry)
        async def cleanup():
            while True:
                await asyncio.sleep(60)
                try: await registry.expire();await vector.purge_expired()
                except Exception: pass  # ACL and retention filters still block retrieval; next minute retries physical purge.
        task = asyncio.create_task(cleanup())
        try: yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError): await task
            await model.close();await gateway.close();await vector.close()

app = FastAPI(title="VelaPal Ibnu AI", version="6.1.2", lifespan=lifespan)
@app.exception_handler(ServiceError)
async def service_error(_req, error):
    print(f"[AI ServiceError] code={error.code} status={error.status} message={error.message}")
    return JSONResponse(status_code=error.status, content={"error": {"code": error.code, "message": error.message, "retryable": error.retryable}})
@app.exception_handler(TimeoutError)
async def timeout_error(_req, error):
    print(f"[AI TimeoutError] {error}")
    return JSONResponse(status_code=503, content={"error": {"code": "AI_TIMEOUT", "message": "AI work exceeded the bounded request budget.", "retryable": True}})
@app.exception_handler(Exception)
async def unhandled_error(_req, error):
    import traceback
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": str(error), "retryable": False}})
@app.exception_handler(RequestValidationError)
async def validation_error(_req, _error):
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR", "message": "Request does not match contract 6.1.2.", "retryable": False}})
worker_key = APIKeyHeader(name="X-Worker-Service-Token", auto_error=False)
async def worker_auth(request: Request, token: str | None = Depends(worker_key)):
    token = token or ""
    if not hmac.compare_digest(token, request.app.state.settings.worker_token):
        raise ServiceError("UNAUTHENTICATED", "Valid X-Worker-Service-Token is required.", 401)
@app.get("/health")
async def health(): return {"ok": True, "service": "velapal-ai", "contractVersion": "6.1.2"}
@app.get("/ready")
async def ready(request: Request):
    try: await request.app.state.vector.ready()
    except Exception: raise ServiceError("VECTOR_UNAVAILABLE", "Qdrant is not ready.", 503, True) from None
    return {"ok": True, "modelMode": request.app.state.settings.mode, "dimensions": 768}
@app.post("/internal/v1/case-runs", dependencies=[Depends(worker_auth)])
async def run(body: RunRequest, request: Request): return await request.app.state.workflow.run(body)
@app.post("/internal/v1/case-runs/{run_id}/resume", dependencies=[Depends(worker_auth)])
async def resume(run_id: str, body: ResumeRequest, request: Request):
    if run_id != body.runId: raise ServiceError("RUN_SCOPE_INVALID", "URL runId differs from request body.", 422)
    return await request.app.state.workflow.run(body, resume=True)
@app.post("/internal/v1/evidence-index", dependencies=[Depends(worker_auth)])
async def index(body: IndexRequest, request: Request): return await request.app.state.evidence.index(body)
@app.post("/internal/v1/evidence-revoke", dependencies=[Depends(worker_auth)])
async def revoke(body: RevokeRequest, request: Request): return await request.app.state.evidence.revoke(body)
