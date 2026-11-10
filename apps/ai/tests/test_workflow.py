import copy
from pathlib import Path
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import pytest
from velapal_ai.config import Settings
from velapal_ai.http import ServiceError
from velapal_ai.models import RunRequest, ResumeRequest
from velapal_ai.provider import Model
from velapal_ai.registry import Registry
from velapal_ai.workflow import Workflow

class Gateway:
    def __init__(self,purpose):
        self.c={"runId":"run_1","actorId":"buyer","tenantId":"merchant","caseId":"case_1","purpose":purpose,
            "audience":"CASE_SHARED" if purpose=="SHARED_ASSESSMENT" else "PRIVATE","inputVersion":3,"caseVersion":3,"privateContextVersion":3,
            "accessRevision":2,"policyVersion":"test-policy","category":"CONTESTED_CLAIM","prompt":"help", "allowedSources":[], "allowedMessages":[
                {"messageId":"buyer_message","party":"CUSTOMER","text":"Invoice says 256GB","version":1,"locator":"statement:customer"},
                {"messageId":"seller_message","party":"SELLER","text":"Label says 128GB","version":1,"locator":"statement:seller"}],
            "signedManifest":{"manifestHash":"sha256_snapshot"}, "businessDataMode":"synthetic_fixture"}
        self.commits=[]
    async def context(self, _run, decision=None):
        c=copy.deepcopy(self.c)
        if decision: c['reviewDecision']={"decisionId":decision,"manifestHash":"sha256_snapshot","approved":True}
        return c
    async def checkpoint(self,c,r,decision=None):self.commits.append(copy.deepcopy(r))
class Vector:
    async def retrieve(self,*a):return []

@pytest.mark.asyncio
@pytest.mark.parametrize("purpose,function",[("PERSONAL_ASSISTANT","personal"),("CUSTOMER_PREPARATION","customer_preparation"),("SELLER_PREPARATION","seller_preparation"),("SHARED_ASSESSMENT","mediation")])
async def test_all_five_logical_functions_and_persisted_resume(tmp_path,purpose,function):
    s=Settings(data_dir=str(tmp_path));model=Model(s);gateway=Gateway(purpose)
    path=str(tmp_path/'graph.sqlite')
    try:
        async with AsyncSqliteSaver.from_conn_string(path) as saver:
            await saver.setup();r=Registry(tmp_path/'registry.sqlite',saver);await r.setup()
            wf=Workflow(s,model,gateway,Vector(),saver,r)
            result=await wf.run(RunRequest(runId='run_1',purpose=purpose,expectedContextVersion=3))
            assert result['modelMode']=='fixture' and result['counters']['generativeCalls']==0
            assert function in result['functionsExecuted']
            assert (await wf.run(RunRequest(runId='run_1',purpose=purpose,expectedContextVersion=3)))==result
        if purpose=='SHARED_ASSESSMENT':
            assert result['requiresHumanApproval'] and result['status']=='NEEDS_INFO'
            # Reopen saver to prove review resume survives a process lifecycle.
            async with AsyncSqliteSaver.from_conn_string(path) as saver:
                await saver.setup();r=Registry(tmp_path/'registry.sqlite',saver);await r.setup()
                wf=Workflow(s,model,gateway,Vector(),saver,r)
                resumed=await wf.run(ResumeRequest(runId='run_1',expectedContextVersion=3,decisionId='decision_approved'),resume=True)
                assert resumed['reviewedDecisionId']=='decision_approved' and not resumed['requiresHumanApproval']
                assert resumed['findings']==result['findings']  # Admin approval did not turn conflicting evidence into a fact.
                await r.purge_case('merchant','case_1')
                assert not (await wf.graph(gateway.c).aget_state({'configurable':{'thread_id':'run_1'}})).values
    finally:await model.close()
