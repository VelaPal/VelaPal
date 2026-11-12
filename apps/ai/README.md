# VelaPal AI service

FastAPI service for evidence indexing, retrieval, case preparation, and voluntary mediation assistance. LangGraph coordinates the bounded workflow. Gemini provides structured generation, image extraction in live mode, and 768-dimensional text embeddings. Qdrant stores and retrieves authorized evidence vectors. The service does not call PayPal or execute payments, refunds, or binding dispute decisions.

Express remains authoritative for user identity, access to evidence, review decisions, party consent, and financial execution. The AI service retrieves data through authenticated internal API routes and returns cited findings with uncertainty preserved. Source revocation removes corresponding indexed vectors and graph state.

## Local setup

Requirements: Python 3.11+, the repository's PostgreSQL/Qdrant/MinIO infrastructure, and the Express API. The local Compose setup is documented in the [root README](../../README.md). Use a single AI worker because graph checkpoints are stored in local SQLite.

From this directory:

```bash
cp .env.example .env
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
```

Set `GEMINI_API_KEY` in `.env` for live mode. Keep `API_INTERNAL_BASE_URL`, the directional service tokens, and `MANIFEST_HMAC_SECRET` aligned with `apps/api/.env`. Then start the service:

```bash
python -m uvicorn velapal_ai.main:app --host 127.0.0.1 --port 8000 --workers 1
```

`GET /health` checks liveness. `GET /ready` checks Qdrant availability; it does not make a Gemini request.

### Model modes

- **Live mode** sends generation, embedding, and supported image extraction requests to Gemini. Set `GEMINI_API_KEY` and `GEMINI_MODEL` in `.env`. The model name can be checked with `python scripts/provider_smoke.py --list-models`. The smoke script's `--allow-live` option sends real requests to Gemini.
- **Fixture mode** is deterministic and makes no Gemini requests. It supports text PDF extraction and test embeddings in a separate vector collection; it does not OCR images. Configure `AI_MODEL_MODE=fixture` in `.env` for this mode.

Live model mode describes the AI provider only; it does not imply PayPal-backed business data or payment execution. Transaction provenance comes from Express records.

## Tests

Install test dependencies and run the suite:

```bash
python -m pip install -r requirements-dev.in
python -m pytest -q
```

The test suite covers workflow behavior, grounding, vector access, and the internal API gateway. No live Gemini request is needed for the tests.
