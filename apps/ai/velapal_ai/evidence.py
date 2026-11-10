import asyncio
import io
import json
import sys
import time
from datetime import datetime, timezone
from PIL import Image
from .http import ServiceError

Image.MAX_IMAGE_PIXELS = 20_000_000
async def pdf_pages(raw):
    p = await asyncio.create_subprocess_exec(sys.executable, "-m", "velapal_ai.pdf_worker", stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
    try:
        output, _ = await asyncio.wait_for(p.communicate(raw), 15)
    except (TimeoutError, asyncio.CancelledError):
        p.kill(); await p.wait(); raise ServiceError("PDF_UNREADABLE", "PDF processing timed out.", 422) from None
    if p.returncode or len(output) > 250_000: raise ServiceError("PDF_UNREADABLE", "Upload an unencrypted text PDF of at most five pages.", 422)
    return json.loads(output)["pages"]
def check_image(raw, mime):
    try:
        with Image.open(io.BytesIO(raw)) as img:
            if img.format != ("PNG" if mime == "image/png" else "JPEG") or img.width * img.height > Image.MAX_IMAGE_PIXELS: raise ValueError()
            img.verify()
    except Exception: raise ServiceError("IMAGE_INVALID", "Image format or pixel limits are invalid.", 422) from None

class EvidenceService:
    def __init__(self, s, model, gateway, vector, registry):
        self.s, self.model, self.gateway, self.vector, self.registry = s, model, gateway, vector, registry
        self.lock = asyncio.Lock()
    def validate_scope(self, req, ctx):
        if any(getattr(req, k) != ctx[k] for k in ("tenantId", "caseId", "sourceId", "sourceVersion", "accessRevision", "audience", "mime", "sha256")):
            raise ServiceError("SOURCE_ACCESS_CHANGED", "Index job no longer matches current source permissions or bytes.", 409)
    async def index(self, req):
        async with self.lock, self.registry.guard(req.tenantId, req.caseId), asyncio.timeout(110):
            if req.embeddingSpace != f"{self.s.embedding_model}-dim768":
                raise ServiceError("EMBEDDING_SPACE_MISMATCH", "Worker and AI embedding models must agree.", 422)
            before = await self.gateway.index_context(req.jobId); self.validate_scope(req, before)
            raw = await self.gateway.bytes(req)
            if len(raw) != before["byteCount"]: raise ServiceError("FILE_INVALID", "Evidence byte count differs from backend.", 422)
            if req.mime == "application/pdf":
                if not raw.startswith(b"%PDF-"): raise ServiceError("FILE_INVALID", "Evidence is not a PDF.", 422)
                pages = await pdf_pages(raw)
            else:
                await asyncio.to_thread(check_image, raw, req.mime)
                e = await self.model.extract_image(raw, req.mime)
                pages = [{"locator": "image:1", "text": "\n".join(e.observations)}] if e.legible else []
            expires = min(int(req.retentionUntil.timestamp()), int(time.time()) + self.s.retention_days * 86400)
            if expires <= time.time(): raise ServiceError("RETENTION_EXPIRED", "Evidence retention expired.", 409)
            docs = []
            for page in pages:
                text = page["text"].strip()
                for start in range(0, len(text), 900):
                    docs.append({**{k: before[k] for k in ("tenantId", "caseId", "sourceId", "audience", "ownerId", "ownerParty", "mime", "sha256")},
                        "version": req.sourceVersion, "locator": f"{page['locator']}:chunk:{start // 900 + 1}",
                        "text": text[start:start+1000], "retentionUntil": expires})
            if len(docs) > 16: raise ServiceError("FILE_TOO_COMPLEX", "Split evidence into shorter files (maximum sixteen chunks).", 422)
            vectors = [await self.model.embed(d["text"]) for d in docs]
            self.validate_scope(req, await self.gateway.index_context(req.jobId))
            await self.vector.delete(req.tenantId, req.caseId, req.sourceId, req.sourceVersion)
            await self.vector.upsert(docs, vectors)
            try: self.validate_scope(req, await self.gateway.index_context(req.jobId))
            except BaseException:
                await self.vector.delete(req.tenantId, req.caseId, req.sourceId, req.sourceVersion); raise
            return {"jobId": req.jobId, "sourceId": req.sourceId, "sourceVersion": req.sourceVersion,
                "state": "INDEXED" if docs else "NEEDS_INFO", "chunks": len(docs), "modelMode": self.s.mode,
                "message": "Text extracted; document authenticity is not established." if docs else "No legible text; fixture mode has no image OCR. Try a text PDF or live Gemini vision."}
    async def revoke(self, req):
        async with self.lock, self.registry.guard(req.tenantId, req.caseId):
            authorized = await self.gateway.revoke_context(req.jobId)
            if any(getattr(req, k) != authorized[k] for k in ("tenantId", "caseId", "sourceId", "revokedUpToVersion", "accessRevision")):
                raise ServiceError("REVOCATION_SCOPE_INVALID", "Revocation scope differs from authoritative job.", 403)
            await self.vector.delete(req.tenantId, req.caseId, req.sourceId, req.revokedUpToVersion, all_spaces=True)
            await self.registry.purge_case(req.tenantId, req.caseId)
            return {"sourceId": req.sourceId, "revokedUpToVersion": req.revokedUpToVersion, "state": "PURGED"}
