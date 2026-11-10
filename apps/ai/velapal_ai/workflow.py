import asyncio
import json
import re
import time
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command, interrupt
from .http import ServiceError

class State(TypedDict, total=False):
    fingerprint: str
    started: float
    docs: list[dict]
    draft: dict
    evidenceDraft: dict
    functions: list[str]
    calls: int
    embeddingQueries: int
    retrievedChunks: int
    result: dict

def ref(doc): return {k: doc[k] for k in ("sourceId", "version", "locator")}
def text_doc(sid, text, version=1, locator="record:1", **kwargs):
    return {"sourceId": sid, "version": version, "locator": locator, "text": text, **kwargs}

def money(n, currency): return f"{currency} {n // 100}.{n % 100:02d}"

def records(ctx):
    docs = [text_doc(m["messageId"], m["text"], m["version"], m["locator"], party=m["party"], kind="PARTY_CLAIM") for m in ctx["allowedMessages"]]
    tx = ctx.get("transactionFacts")
    if tx:
        docs.append({**tx["snapshotSourceRef"], "text": f"Backend transaction record: orderId={tx['orderId']}; sku={tx['sku']}; variantId={tx['variantId']}; amountMinor={tx['amountMinor']}; currency={tx['currency']}; paymentStatus={tx['paymentStatus']}; refundableRemainingMinor={tx['refundableRemainingMinor']}. This record is not an independent PayPal verification.", "kind": "SERVER_RECORD"})
    for p in ctx.get("personalContext", {}).get("catalogItems", []):
        docs.append(text_doc(p["id"], f"{p['name']} ({p['sku']}). Listed price: {money(p['priceMinor'], p['currency'])}. Available options: " + "; ".join(f"{v['label']}: {money(v['priceMinor'], p['currency'])}" for v in p['variants']), p["catalogVersion"], kind="CATALOG"))
    for tx in ctx.get("personalContext", {}).get("recentTransactions", []):
        docs.append(text_doc(tx["id"], f"Backend transaction: orderId={tx['orderId']}; paymentStatus={tx['paymentStatus']}; amountMinor={tx['amountMinor']}; currency={tx['currency']}. This is not a subscription renewal schedule.", kind="SERVER_RECORD"))
    return docs

def normalize(s): return " ".join(s.split())
def verify_findings(draft, docs):
    lookup = {(d["sourceId"], d["version"], d["locator"]): d["text"] for d in docs}
    good, rejected = [], 0
    for finding in draft.get("findings", []):
        cites = finding.get("citations", [])
        valid = bool(cites) and all((c["sourceId"], c["version"], c["locator"]) in lookup and
            normalize(c["quote"]) in normalize(lookup[(c["sourceId"], c["version"], c["locator"])]) for c in cites)
        # Reject new numeric values. Semantic correctness still needs live evaluation and human review.
        numbers = set(re.findall(r"\d+(?:[.,]\d+)*", finding["text"]))
        supported = set(re.findall(r"\d+(?:[.,]\d+)*", " ".join(c["quote"] for c in cites)))
        if not valid or not numbers <= supported: rejected += 1; continue
        good.append({"findingId": f"finding_{len(good)+1}", "kind": finding["kind"], "text": finding["text"],
            "sourceRefs": [{k: c[k] for k in ("sourceId", "version", "locator")} for c in cites]})
    return good, rejected

class Workflow:
    def __init__(self, s, model, gateway, vector, saver, registry):
        self.s, self.model, self.gateway, self.vector, self.saver, self.registry = s, model, gateway, vector, saver, registry
        self.slots = asyncio.Semaphore(2)
        self.run_locks = [asyncio.Lock() for _ in range(64)]
    def graph(self, ctx):
        purpose, mode = ctx["purpose"], self.s.mode
        async def retrieve(state):
            docs = records(ctx)
            chunks = []
            if ctx["allowedSources"]:
                v = await self.model.embed(ctx.get("prompt") or f"{ctx['category']} compare order evidence packing invoice payment records", "RETRIEVAL_QUERY")
                chunks = await self.vector.retrieve(ctx, v)
            return {"docs": docs + chunks, "embeddingQueries": 1 if ctx["allowedSources"] else 0, "retrievedChunks": len(chunks)}
        async def prepare(state):
            role = {"PERSONAL_ASSISTANT": "personal", "CUSTOMER_PREPARATION": "customer_preparation", "SELLER_PREPARATION": "seller_preparation", "SHARED_ASSESSMENT": "evidence"}[purpose]
            d = await self.model.draft(role, state["docs"], ctx.get("prompt", ""))
            return {"draft": d.model_dump(), "evidenceDraft": d.model_dump(), "functions": [role], "calls": 1 if mode == "live" else 0}
        async def mediate(state):
            d = await self.model.draft("mediation", state["docs"], ctx.get("prompt", ""), state["evidenceDraft"])
            return {"draft": d.model_dump(), "functions": state["functions"] + ["mediation"], "calls": state["calls"] + (1 if mode == "live" else 0)}
        def ground(state):
            d = state["draft"]
            findings, rejected = verify_findings(d, state["docs"])
            missing = [x[:500] for x in d["missingEvidence"]]
            seen = {(x["sourceId"], x["version"]) for x in state["docs"]}
            if any((x["sourceId"], x["version"]) not in seen for x in ctx["allowedSources"]):
                missing.append("Some authorized files have no retrieved text. Wait for indexing, upload legible text, or narrow the evidence set.")
            if purpose == "PERSONAL_ASSISTANT" and re.search(r"subscription|renew", ctx.get("prompt", ""), re.I):
                findings = []
                missing.append("No subscription renewal records are available in this backend context. Check the provider dashboard; no renewals or cancellations were inferred.")
            needs_review = purpose == "SHARED_ASSESSMENT" and (d["needsReview"] or any(f["kind"] == "CONFLICT" for f in findings))
            status = "ABSTAINED" if rejected and not findings else "NEEDS_INFO" if missing or needs_review else "COMPLETED"
            tx = ctx.get("transactionFacts")
            facts = [{"text": f"Backend payment record: {tx['paymentStatus']}; amountMinor={tx['amountMinor']}; currency={tx['currency']}; refundableRemainingMinor={tx['refundableRemainingMinor']}. Independent provider verification is outside this AI run.",
                "sourceRefs": [tx["snapshotSourceRef"]]}] if tx else []
            claims = [{"party": m["party"], "text": m["text"][:1500], "sourceRefs": [{"sourceId": m["messageId"], "version": m["version"], "locator": m["locator"]}]} for m in ctx["allowedMessages"]]
            # Findings, not unconstrained generated prose, become the assistant's user-facing answer.
            message = "\n".join(f["text"] for f in findings[:4]) or "There is not enough supported information to answer this request."
            if missing: message += "\nNext: " + missing[0]
            result = {"runId": ctx["runId"], "inputVersion": ctx["inputVersion"], "caseVersion": ctx["caseVersion"], "status": status, "audience": ctx["audience"],
                "modelMode": mode, "businessDataMode": ctx["businessDataMode"], "category": ctx.get("category"),
                "verifiedFacts": facts, "claims": claims, "findings": findings, "missingEvidence": missing[:6],
                "uncertainty": d["uncertainty"] or "No authenticity or legal determination was made.",
                "policyReferences": ["VELAPAL_ASSISTANCE_V1 (internal workflow policy, not PayPal policy)"],
                "nextStep": "ESCALATE_TO_ADMIN" if needs_review else "REQUEST_CLARIFICATION" if missing else
                    "PROPOSE_VOLUNTARY_SETTLEMENT" if purpose == "SHARED_ASSESSMENT" and status == "COMPLETED" else "NONE",
                "requiresHumanApproval": needs_review, "manifestHash": ctx["signedManifest"]["manifestHash"],
                "modelVersion": self.model.version, "promptVersion": "ibnu-repo-6.1.2", "policyVersion": ctx["policyVersion"],
                "counters": {"generativeCalls": state["calls"], "embeddingQueries": state["embeddingQueries"], "retrievedChunks": state["retrievedChunks"],
                    "elapsedMs": int((time.time() - state["started"]) * 1000)},
                "functionsExecuted": state["functions"], "message": message, "groundingRejectedFindings": rejected }
            return {"result": result}
        def review_gate(state):
            r = dict(state["result"])
            if r["requiresHumanApproval"]:
                decision = interrupt({"reason": "EVIDENCE_REVIEW_REQUIRED", "runId": ctx["runId"], "manifestHash": r["manifestHash"]})
                approved = ctx.get("reviewDecision")
                if not approved or decision.get("decisionId") != approved["decisionId"] or approved["manifestHash"] != r["manifestHash"]:
                    raise ServiceError("REVIEW_DECISION_INVALID", "A current backend review decision is required.", 409)
                r["reviewedDecisionId"] = approved["decisionId"]
                r["requiresHumanApproval"] = False
                r["nextStep"] = "REQUEST_CLARIFICATION" if r["missingEvidence"] else "PROPOSE_VOLUNTARY_SETTLEMENT"
                r["status"] = "NEEDS_INFO" if r["missingEvidence"] else "COMPLETED"
            return {"result": r}
        g = StateGraph(State)
        for name, fn in (("retrieve", retrieve), ("prepare", prepare), ("mediate", mediate), ("ground", ground), ("review_gate", review_gate)): g.add_node(name, fn)
        g.add_edge(START, "retrieve");g.add_edge("retrieve", "prepare")
        if purpose == "SHARED_ASSESSMENT": g.add_edge("prepare", "mediate");g.add_edge("mediate", "ground")
        else: g.add_edge("prepare", "ground")
        g.add_edge("ground", "review_gate");g.add_edge("review_gate", END)
        return g.compile(checkpointer=self.saver)
    async def run(self, req, resume=False):
        import hashlib
        lock = self.run_locks[int(hashlib.sha256(req.runId.encode()).hexdigest(), 16) % 64]
        async with self.slots, lock, asyncio.timeout(110):
            decision_id = req.decisionId if resume else None
            ctx = await self.gateway.context(req.runId, decision_id)
            if req.runId != ctx["runId"] or req.purpose != ctx["purpose"]: raise ServiceError("RUN_SCOPE_INVALID", "Requested purpose does not match backend run.", 403)
            if req.expectedContextVersion != ctx["inputVersion"]: raise ServiceError("STALE_CONTEXT", "Run input version has changed. Start a fresh run.", 409)
            async with self.registry.guard(ctx["tenantId"], ctx["caseId"]):
                cached = ctx.get("committedResult")
                if cached and (not resume or cached.get("reviewedDecisionId") == decision_id): return cached
                graph = self.graph(ctx)
                config = {"configurable": {"thread_id": req.runId}, "recursion_limit": 12}
                saved = await graph.aget_state(config)
                fingerprint = ctx["signedManifest"]["manifestHash"]
                if saved.values and saved.values.get("fingerprint") != fingerprint:
                    await self.saver.adelete_thread(req.runId)
                    raise ServiceError("STALE_CONTEXT", "Saved graph belongs to an older permission or input snapshot.", 409)
                await self.registry.add(req.runId, ctx["tenantId"], ctx["caseId"], self.s.retention_days)
                if resume:
                    if not ctx.get("reviewDecision") or not saved.next: raise ServiceError("RESUME_NOT_PENDING", "There is no pending review for this run.", 409)
                    await graph.ainvoke(Command(resume={"decisionId": decision_id}), config)
                elif not saved.values:
                    await graph.ainvoke({"fingerprint": fingerprint, "started": time.time(), "functions": [], "calls": 0}, config)
                elif saved.next and not saved.values.get("result"):
                    await graph.ainvoke(None, config)
                saved = await graph.aget_state(config)
                result = saved.values.get("result")
                if not result: raise ServiceError("GRAPH_RESULT_MISSING", "Workflow did not produce a valid result.", 503, True)
                fresh = await self.gateway.context(req.runId, decision_id)
                if fresh["signedManifest"]["manifestHash"] != fingerprint: raise ServiceError("STALE_CONTEXT", "Context changed before commit. Result discarded.", 409)
                await self.gateway.checkpoint(fresh, result, decision_id)
                return result
