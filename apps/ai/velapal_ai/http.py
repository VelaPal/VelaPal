import hashlib
import hmac
import json
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
import httpx

class ServiceError(Exception):
    def __init__(self, code, message, status=503, retryable=False):
        self.code, self.message, self.status, self.retryable = code, message, status, retryable

def canonical(obj):
    # Mirror repo canonicalHash: sort TOP-LEVEL keys, preserve nested insertion order.
    return json.dumps({k: obj[k] for k in sorted(obj)}, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()

def digest(obj): return "sha256_" + hashlib.sha256(canonical(obj)).hexdigest()

async def bounded_json(client, method, path, *, limit=2_000_000, **kwargs):
    try:
        async with client.stream(method, path, **kwargs) as r:
            if r.status_code >= 400:
                code = {401: "UPSTREAM_AUTH_FAILED", 403: "UPSTREAM_AUTH_FAILED", 404: "UPSTREAM_NOT_FOUND", 409: "STALE_CONTEXT", 429: "UPSTREAM_RATE_LIMITED"}.get(r.status_code, "UPSTREAM_FAILED")
                raise ServiceError(code, f"Dependency returned HTTP {r.status_code}.", 409 if r.status_code == 409 else 503, r.status_code == 429 or r.status_code >= 500)
            chunks, size = [], 0
            async for chunk in r.aiter_bytes():
                size += len(chunk)
                if size > limit: raise ServiceError("RESPONSE_TOO_LARGE", "Dependency response exceeds limit.", 502)
                chunks.append(chunk)
            try: return json.loads(b"".join(chunks))
            except (ValueError, UnicodeError): raise ServiceError("RESPONSE_INVALID", "Dependency returned invalid JSON.", 502) from None
    except httpx.RequestError:
        raise ServiceError("UPSTREAM_UNAVAILABLE", "A required service is unavailable.", 503, True) from None

def verify_manifest(ctx, secret):
    try:
        signed = dict(ctx["signedManifest"])
        signature = signed.pop("hmacSignature")
        expected = "hmac_sha256_" + hmac.new(secret.encode(), canonical(signed), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected): raise ValueError()
        if datetime.fromisoformat(signed["expiresAt"].replace("Z", "+00:00")) <= datetime.now(timezone.utc): raise ValueError()
        for k in ("runId", "actorId", "tenantId", "caseId", "purpose", "audience", "inputVersion", "caseVersion", "privateContextVersion", "accessRevision"):
            if signed[k] != ctx[k]: raise ValueError()
        inputs = {k: v for k, v in ctx.items() if k not in {"signedManifest", "control", "committedResult", "reviewDecision"}}
        if signed["manifestHash"] != digest(inputs): raise ValueError()
    except (KeyError, ValueError, TypeError):
        raise ServiceError("MANIFEST_INVALID", "Context signature, input binding, or expiry is invalid.", 403) from None

class Gateway:
    def __init__(self, settings):
        self.settings = settings
        self.client = httpx.AsyncClient(base_url=settings.api_url + "/", headers={"X-AI-Callback-Token": settings.callback_token},
            timeout=20, follow_redirects=False, trust_env=False)
    async def close(self): await self.client.aclose()
    async def context(self, run_id, decision_id=None):
        data = await bounded_json(self.client, "GET", f"internal/v1/case-runs/{run_id}/context", params={"decisionId": decision_id} if decision_id else {})
        verify_manifest(data, self.settings.hmac_secret)
        return data
    async def index_context(self, job_id): return await bounded_json(self.client, "GET", f"internal/v1/index-jobs/{job_id}/context")
    async def revoke_context(self, job_id): return await bounded_json(self.client, "GET", f"internal/v1/revoke-jobs/{job_id}/context")
    async def checkpoint(self, ctx, result, decision_id=None):
        signed = ctx["signedManifest"]
        payload = {k: signed[k] for k in ("manifestId", "replayId", "manifestHash", "hmacSignature", "inputVersion", "accessRevision")}
        payload["resultPayload"] = result
        if decision_id: payload["decisionId"] = decision_id
        r = await bounded_json(self.client, "POST", f"internal/v1/case-runs/{ctx['runId']}/checkpoints", json=payload)
        if r.get("data", {}).get("committed") is not True: raise ServiceError("CHECKPOINT_REJECTED", "Backend did not commit this result.", 409)
    async def bytes(self, req):
        u, expected = urlparse(req.readHandle.url), urlparse(self.settings.api_url)
        q = parse_qs(u.query)
        if (u.scheme, u.netloc) != (expected.scheme, expected.netloc) or u.username or u.password or u.fragment or \
            u.path != f"/internal/v1/sources/{req.sourceId}/bytes" or q.get("jobId") != [req.jobId] or q.get("v") != [str(req.sourceVersion)] or not q.get("token"):
            raise ServiceError("READ_HANDLE_INVALID", "Evidence URL is not bound to the configured backend and job.", 403)
        if req.readHandle.expiresAt <= datetime.now(timezone.utc): raise ServiceError("READ_HANDLE_EXPIRED", "Evidence read handle expired.", 409)
        try:
            async with self.client.stream("GET", req.readHandle.url) as r:
                if r.status_code != 200: raise ServiceError("SOURCE_ACCESS_CHANGED", "Evidence is no longer readable.", 409)
                if r.headers.get("content-type", "").split(";")[0] != req.mime: raise ServiceError("FILE_INVALID", "Evidence MIME differs from authorized metadata.", 422)
                size, chunks = 0, []
                async for part in r.aiter_bytes():
                    size += len(part)
                    if size > 5 * 1024 * 1024: raise ServiceError("FILE_TOO_LARGE", "Evidence exceeds 5 MiB.", 422)
                    chunks.append(part)
                raw = b"".join(chunks)
                if hashlib.sha256(raw).hexdigest() != req.sha256: raise ServiceError("FILE_HASH_MISMATCH", "Evidence hash does not match authorized bytes.", 422)
                return raw
        except httpx.RequestError: raise ServiceError("STORAGE_UNAVAILABLE", "Evidence could not be downloaded.", 503, True) from None
