# VelaPal AI — Ibnu's repo integration

FastAPI service for the VelaPal Express/Next.js repository at commit `95cfe69`. Implements personal assistance, private customer/seller preparation, evidence analysis and voluntary mediation in one bounded LangGraph. It has no PayPal execution client.

See [Windows setup and team handoff](../../docs/ibnu/START_HERE.md), [wire contract](../../docs/ibnu/KONTRAK_INTEGRASI.md), and [test evidence](../../docs/ibnu/TESTING.md).

## Quick start

Python 3.11+; PostgreSQL, Qdrant and private S3-compatible storage from the repository's infrastructure. Use one AI worker.

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m pip install -r requirements-dev.in
.venv/bin/python scripts/setup_env.py
.venv/bin/python -m pytest -q
.venv/bin/python -m uvicorn velapal_ai.main:app --host 127.0.0.1 --port 8000 --workers 1
```

On Windows substitute `.venv\Scripts\python.exe`. Start Express on port 4000 and Next.js on port 3000 using the integration guide. `GET /health` checks liveness; `GET /ready` checks Qdrant configuration. Readiness does not perform a paid Gemini probe.

## Real model activation

Fixture mode is deterministic and labeled. It reads real text PDFs, uses feature-hash test vectors in a separate collection, and does not pretend to OCR images. It makes no Gemini requests.

Set `GEMINI_API_KEY` locally, discover available models with `scripts/provider_smoke.py --list-models`, set `GEMINI_MODEL`, and explicitly run `--allow-live` to test structured JSON, grounded quotation, image input, and 768-dimensional embeddings. Then set `AI_MODEL_MODE=live` and restart. Errors do not silently fall back to fixture.

Model mode and business-data provenance are independent. `live` means a real Gemini call; it does not mean a real PayPal transaction. Personal/catalog demonstration data remains conservatively labeled synthetic. Case transaction provenance comes from backend configuration and provider-operation records, not an AI assertion.

## Design

Express owns identity, case access, versions, review decisions, financial consent and provider outcomes. Python verifies the signed context, retrieves only currently authorized source/version/hash/audience/owner scopes, creates cited findings, and commits through Express's compare-and-swap checkpoint endpoint.

The graph persists to private local SQLite, pauses on material conflicts, and resumes only with a current backend decision. Review approval preserves uncertainty. Source revocation purges indexed versions and graph checkpoints; current context checks prevent stale publication.

A case run uses at most two generative calls (shared) or one (private/personal), one retrieval embedding query, twelve retrieved chunks and a 110-second request budget. File indexing is separately bounded. Use the documented single-process setup; multiple replicas require additional coordination and a suitable checkpoint store.

## Tested scope

The previous integration release passed 24 AI tests on Python 3.11.17 and 3.12.14 and 30 disposable-stack integration checks on base `80e8ab2`. Application runtime code is byte-identical in this rebase; new verification is recorded in [the revision report](../../docs/ibnu/REVISION_95cfe69.md). The original disposable stack ran against actual compiled Express/Prisma, FastAPI, Qdrant 1.11.0, PGlite PostgreSQL-wire storage and Moto S3. No live Gemini or PayPal API call was made. Native PostgreSQL/MinIO, Docker execution, Windows runtime and the final browser workflow still require team validation.

This is hackathon/development software. Repository demo authentication and format validation are not production authentication or antivirus scanning. Secrets and runtime evidence/checkpoints are excluded from the package.
