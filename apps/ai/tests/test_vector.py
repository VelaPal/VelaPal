import httpx
import pytest
from velapal_ai.config import Settings
from velapal_ai.vector import VectorStore
from velapal_ai.http import ServiceError

@pytest.mark.asyncio
async def test_vector_response_is_checked_against_current_acl():
    v = VectorStore(Settings());await v.client.aclose();v._ready = True
    forbidden = {"sourceId":"other", "version":1,"sha256":"x","audience":"PRIVATE", "ownerId":"seller","tenantId":"tenant","caseId":"case"}
    v.client = httpx.AsyncClient(base_url="http://localhost",transport=httpx.MockTransport(lambda r:httpx.Response(200,json={"result":[{"payload":forbidden}]})))
    try:
        with pytest.raises(ServiceError) as e:
            await v.retrieve({"actorId":"buyer","tenantId":"tenant","caseId":"case","allowedSources":[{"sourceId":"allowed","version":2,"sha256":"a","audience":"CASE_SHARED"}]},[.1]*768)
        assert e.value.code == "RETRIEVAL_SCOPE_INVALID"
    finally:await v.close()
def test_fixture_and_live_vector_spaces_are_distinct():
    a,b = VectorStore(Settings()),VectorStore(Settings(mode="live"))
    assert a.collection != b.collection
