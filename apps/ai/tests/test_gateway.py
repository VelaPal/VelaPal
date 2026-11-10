import copy
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
import httpx
import pytest
from velapal_ai.config import Settings
from velapal_ai.http import Gateway, ServiceError, canonical, digest, verify_manifest
from velapal_ai.models import IndexRequest

def signed():
    c = {"runId": "run", "actorId": "actor", "tenantId": "tenant", "caseId": "case", "purpose": "CUSTOMER_PREPARATION", "audience": "PRIVATE", "inputVersion": 1, "caseVersion": 2, "privateContextVersion": 1, "accessRevision": 3, "control": "RUNNING", "prompt": "help", "allowedSources": []}
    h = digest({k: v for k, v in c.items() if k != "control"})
    m = {**{k: c[k] for k in ("runId", "actorId", "tenantId", "caseId", "purpose", "audience", "inputVersion", "caseVersion", "privateContextVersion", "accessRevision")}, "manifestId": "mf", "replayId": "rp", "manifestHash": h, "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()}
    m["hmacSignature"] = "hmac_sha256_" + hmac.new(b"secret", canonical(m), hashlib.sha256).hexdigest()
    c["signedManifest"] = m;return c

def test_exact_signature_valid(): verify_manifest(signed(), "secret")
@pytest.mark.parametrize("field", ["actorId", "tenantId", "caseId", "purpose", "prompt", "allowedSources", "accessRevision"])
def test_modified_context_rejected(field):
    c = signed();c[field] = [] if field == "allowedSources" else "tampered"
    if field == "allowedSources": c[field] = [{"sourceId": "opponent_private"}]
    with pytest.raises(ServiceError, match="signature"): verify_manifest(c, "secret")
def test_expired_signature_rejected():
    c = signed();m = c["signedManifest"];m["expiresAt"] = "2000-01-01T00:00:00Z";m.pop("hmacSignature")
    m["hmacSignature"] = "hmac_sha256_" + hmac.new(b"secret", canonical(m), hashlib.sha256).hexdigest()
    with pytest.raises(ServiceError): verify_manifest(c, "secret")

@pytest.mark.asyncio
async def test_cross_origin_handle_does_not_make_request():
    g = Gateway(Settings());called = []
    await g.client.aclose();g.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: called.append(r)))
    req = IndexRequest(jobId="job", tenantId="tenant", caseId="case", sourceId="src", sourceVersion=1, accessRevision=1,
        audience="PRIVATE", mime="application/pdf", sha256="a"*64, embeddingSpace="gemini-embedding-001-dim768",
        retentionUntil=datetime.now(timezone.utc)+timedelta(days=1), readHandle={"url":"http://evil.invalid/internal/v1/sources/src/bytes?v=1&jobId=job&token=x", "expiresAt":datetime.now(timezone.utc)+timedelta(minutes=2)})
    try:
        with pytest.raises(ServiceError) as e: await g.bytes(req)
        assert e.value.code == "READ_HANDLE_INVALID" and not called
    finally: await g.close()

@pytest.mark.asyncio
async def test_checkpoint_unwraps_express_data_envelope():
    g = Gateway(Settings());await g.client.aclose()
    g.client = httpx.AsyncClient(base_url="http://localhost",transport=httpx.MockTransport(lambda r: httpx.Response(200,json={"data":{"committed":True},"meta":{}})))
    try:
        c = signed();await g.checkpoint(c,{"runId":"run"})
    finally: await g.close()
