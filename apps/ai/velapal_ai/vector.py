import hashlib
import time
import uuid
import httpx
from .http import bounded_json, ServiceError

def condition(key, value): return {"key": key, "match": {"value": value}}
class VectorStore:
    def __init__(self, settings):
        space = f"{settings.mode}:{settings.embedding_model}:768"
        self.collection = "velapal_" + settings.mode + "_" + hashlib.sha256(space.encode()).hexdigest()[:12]
        self.client = httpx.AsyncClient(base_url=settings.qdrant_url + "/", headers={"api-key": settings.qdrant_key} if settings.qdrant_key else {},
            timeout=15, follow_redirects=False, trust_env=False)
        self._ready = False
    async def close(self): await self.client.aclose()
    async def ready(self):
        # Existing collection dimensions must agree. Never silently overwrite another collection.
        r = await self.client.get(f"collections/{self.collection}")
        if r.status_code == 404:
            await bounded_json(self.client, "PUT", f"collections/{self.collection}", json={"vectors": {"size": 768, "distance": "Cosine"}})
        elif r.status_code == 200:
            if r.json()["result"]["config"]["params"]["vectors"]["size"] != 768: raise ServiceError("VECTOR_SPACE_MISMATCH", "Collection dimension mismatch.", 503)
        else: raise ServiceError("VECTOR_UNAVAILABLE", "Qdrant is unavailable.", 503, True)
        self._ready = True
    async def ensure(self):
        if not self._ready: await self.ready()
    async def upsert(self, docs, vectors):
        await self.ensure()
        points = [{"id": str(uuid.uuid5(uuid.NAMESPACE_URL, ":".join(str(d[k]) for k in ("tenantId", "caseId", "sourceId", "version", "locator")))),
            "vector": v, "payload": d} for d, v in zip(docs, vectors, strict=True)]
        if points: await bounded_json(self.client, "PUT", f"collections/{self.collection}/points?wait=true", json={"points": points})
    async def delete(self, tenant, case, source, up_to, all_spaces=False):
        await self.ensure()
        f = {"must": [condition("tenantId", tenant), condition("caseId", case), condition("sourceId", source), {"key": "version", "range": {"lte": up_to}}]}
        collections = [self.collection]
        if all_spaces:
            data = await bounded_json(self.client, "GET", "collections")
            collections = [c["name"] for c in data["result"]["collections"] if c["name"].startswith(("velapal_fixture_", "velapal_live_"))]
        for collection in collections:
            await bounded_json(self.client, "POST", f"collections/{collection}/points/delete?wait=true", json={"filter": f})
    async def retrieve(self, ctx, vector):
        allowed = ctx["allowedSources"]
        if not allowed: return []
        if len(allowed) > 40: raise ServiceError("CONTEXT_TOO_LARGE", "Use at most forty evidence sources per assessment.", 422)
        await self.ensure()
        clauses = []
        for s in allowed:
            must = [condition("sourceId", s["sourceId"]), condition("version", s["version"]),
                condition("sha256", s["sha256"]), condition("audience", s["audience"])]
            if s["audience"] == "PRIVATE": must.append(condition("ownerId", ctx["actorId"]))
            clauses.append({"must": must})
        f = {"must": [condition("tenantId", ctx["tenantId"]), condition("caseId", ctx["caseId"]),
            {"should": clauses}, {"key": "retentionUntil", "range": {"gt": int(time.time())}}]}
        d = await bounded_json(self.client, "POST", f"collections/{self.collection}/points/search", json={"vector": vector, "filter": f, "limit": 12, "with_payload": True})
        docs = [p["payload"] for p in d["result"]]
        # Independently enforce returned ACL even if vector configuration is broken.
        scopes = {(s["sourceId"], s["version"], s["sha256"], s["audience"]) for s in allowed}
        if any((d["sourceId"], d["version"], d["sha256"], d["audience"]) not in scopes or d["tenantId"] != ctx["tenantId"] or d["caseId"] != ctx["caseId"] or
            (d["audience"] == "PRIVATE" and d["ownerId"] != ctx["actorId"]) for d in docs):
            raise ServiceError("RETRIEVAL_SCOPE_INVALID", "Retrieved evidence did not match the current permission manifest.", 403)
        return docs

    async def purge_expired(self):
        await self.ensure()
        await bounded_json(self.client, "POST", f"collections/{self.collection}/points/delete?wait=true", json={"filter": {
            "must": [{"key": "retentionUntil", "range": {"lte": int(time.time())}}]}})
