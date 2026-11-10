import pytest
from velapal_ai.workflow import verify_findings

DOC = {"sourceId": "invoice", "version": 2, "locator": "page:1:chunk:1", "text": "Invoice: 256GB, USD 59.00"}
def finding(text="Invoice states 256GB", **overrides):
    cite = {k: DOC[k] for k in ("sourceId", "version", "locator")}
    cite.update(quote=DOC["text"]);cite.update(overrides)
    return {"findings": [{"kind": "OBSERVATION", "text": text, "citations": [cite]}]}
def test_grounded_quote_and_number():
    good, rejected = verify_findings(finding(), [DOC]);assert len(good) == 1 and rejected == 0
@pytest.mark.parametrize("changes", [{"version": 1}, {"sourceId": "private_other"}, {"locator": "page:2"}, {"quote": "Full refund approved"}])
def test_rejects_unauthorized_or_invented_quote(changes):
    assert verify_findings(finding(**changes), [DOC]) == ([], 1)
def test_rejects_changed_amount():
    assert verify_findings(finding(text="Refund USD 590.00"), [DOC]) == ([], 1)
def test_whitespace_normalization_does_not_change_numbers():
    assert len(verify_findings(finding(quote="Invoice: 256GB,\nUSD 59.00"), [DOC])[0]) == 1
