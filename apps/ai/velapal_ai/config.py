import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv

@dataclass
class Settings:
    mode: str = "live"
    api_url: str = "http://localhost:4000"
    worker_token: str = "velapal-worker-to-ai-secret-v61"
    callback_token: str = "velapal-ai-to-express-secret-v61"
    hmac_secret: str = "velapal-manifest-hmac-secret-v61"
    qdrant_url: str = "http://localhost:6333"
    qdrant_key: str = ""
    data_dir: str = "./data"
    gemini_key: str = ""
    gemini_model: str = ""
    embedding_model: str = "gemini-embedding-001"
    retention_days: int = 14

    @classmethod
    def load(cls):
        load_dotenv()
        s = cls(mode=os.getenv("AI_MODEL_MODE", "live"), api_url=os.getenv("API_INTERNAL_BASE_URL", "http://localhost:4000").rstrip("/"),
            worker_token=os.getenv("WORKER_TO_AI_SECRET", cls.worker_token), callback_token=os.getenv("AI_TO_EXPRESS_SECRET", cls.callback_token),
            hmac_secret=os.getenv("MANIFEST_HMAC_SECRET", cls.hmac_secret), qdrant_url=os.getenv("QDRANT_URL", cls.qdrant_url).rstrip("/"),
            qdrant_key=os.getenv("QDRANT_API_KEY", ""), data_dir=os.getenv("AI_DATA_DIR", "./data"), gemini_key=os.getenv("GEMINI_API_KEY", ""),
            gemini_model=os.getenv("GEMINI_MODEL", "").removeprefix("models/"),
            embedding_model=os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001").removeprefix("models/"),
            retention_days=int(os.getenv("AI_RETENTION_DAYS", "14")))
        if s.mode not in {"fixture", "live"}: raise ValueError("AI_MODEL_MODE must be fixture or live")
        if s.mode == "live" and (not s.gemini_key or not s.gemini_model): raise ValueError("Live mode requires GEMINI_API_KEY and GEMINI_MODEL")
        if not all([s.worker_token, s.callback_token, s.hmac_secret]): raise ValueError("Service secrets cannot be empty")
        for url in [s.api_url, s.qdrant_url]:
            u = urlparse(url)
            if u.scheme not in {"http", "https"} or not u.netloc or u.username or u.password: raise ValueError("Invalid service URL")
        if not 1 <= s.retention_days <= 30: raise ValueError("Retention must be 1–30 days")
        Path(s.data_dir).mkdir(parents=True, exist_ok=True, mode=0o700)
        return s
