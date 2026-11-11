from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Purpose = Literal["PERSONAL_ASSISTANT", "CUSTOMER_PREPARATION", "SELLER_PREPARATION", "SHARED_ASSESSMENT"]
Step = Literal["REQUEST_CLARIFICATION", "REQUEST_PACKING_SERIAL", "REQUEST_PAYMENT_PROOF", "PROPOSE_VOLUNTARY_SETTLEMENT", "ESCALATE_TO_ADMIN", "OFFICIAL_CHANNEL_HANDOFF", "NONE"]
Id = str
class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")
class RunRequest(Strict):
    runId: str = Field(min_length=1, max_length=150, pattern=r"^[a-zA-Z0-9_:-]+$")
    purpose: Purpose
    expectedContextVersion: int = Field(ge=1)
    traceId: str | None = Field(default=None, max_length=150)
class ResumeRequest(RunRequest):
    purpose: Purpose = "SHARED_ASSESSMENT"
    decisionId: str = Field(min_length=1, max_length=150, pattern=r"^[a-zA-Z0-9_:-]+$")
class ReadHandle(Strict):
    url: str = Field(max_length=2000)
    expiresAt: datetime
class IndexRequest(Strict):
    jobId: str = Field(min_length=1, max_length=150, pattern=r"^[a-zA-Z0-9_:-]+$")
    tenantId: str = Field(min_length=1, max_length=150)
    caseId: str = Field(min_length=1, max_length=150)
    sourceId: str = Field(min_length=1, max_length=150)
    sourceVersion: int = Field(ge=1)
    accessRevision: int = Field(ge=1)
    audience: Literal["PRIVATE", "CASE_SHARED", "PROVIDER_SHARED"]
    mime: Literal["image/png", "image/jpeg", "application/pdf"]
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    embeddingSpace: str = Field(max_length=120, pattern=r"^[a-z0-9._-]+-dim768$")
    retentionUntil: datetime
    readHandle: ReadHandle
class RevokeRequest(Strict):
    jobId: str = Field(min_length=1, max_length=150, pattern=r"^[a-zA-Z0-9_:-]+$")
    tenantId: str = Field(min_length=1, max_length=150)
    caseId: str = Field(min_length=1, max_length=150)
    sourceId: str = Field(min_length=1, max_length=150)
    revokedUpToVersion: int = Field(ge=1)
    accessRevision: int = Field(ge=1)
class Citation(Strict):
    sourceId: str = Field(max_length=150)
    version: int = Field(ge=1)
    locator: str = Field(max_length=180)
    quote: str = Field(min_length=1, max_length=700)
class Finding(Strict):
    kind: Literal["OBSERVATION", "CONFLICT", "GAP"]
    text: str = Field(min_length=1, max_length=900)
    citations: list[Citation] = Field(min_length=1, max_length=4)
class PartyAssessment(Strict):
    indication: Literal["CUSTOMER_SUPPORTED", "SELLER_SUPPORTED", "INCONCLUSIVE"] = "INCONCLUSIVE"
    confidence: Literal["LOW", "MODERATE", "HIGH"] = "LOW"
    rationale: str = Field(default="", max_length=700)
    supportingEvidence: list[Citation] = Field(default_factory=list, max_length=4)
    contraryEvidence: list[Citation] = Field(default_factory=list, max_length=4)
class Draft(Strict):
    findings: list[Finding] = Field(default_factory=list, max_length=10)
    partyAssessment: PartyAssessment = Field(default_factory=PartyAssessment)
    missingEvidence: list[str] = Field(default_factory=list, max_length=6)
    uncertainty: str = Field(default="", max_length=700)
    recommendation: str = Field(default="Request review of the cited evidence before taking action.", max_length=700)
    nextStep: Step = "REQUEST_CLARIFICATION"
    needsReview: bool = False
class Extraction(Strict):
    legible: bool
    observations: list[str] = Field(default_factory=list, max_length=12)
    uncertainty: str = Field(default="", max_length=500)
