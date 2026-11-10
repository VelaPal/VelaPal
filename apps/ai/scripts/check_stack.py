"""Read-only smoke check. Does not create a run or call a paid model."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import httpx
from velapal_ai.config import Settings
async def main():
    s=Settings.load()
    async with httpx.AsyncClient(timeout=10,trust_env=False) as c:
        for label,url in [('Express',s.api_url+'/health'),('AI liveness','http://localhost:8000/health'),('AI + Qdrant readiness','http://localhost:8000/ready')]:
            try:
                r=await c.get(url);r.raise_for_status();print(label,'OK',r.json())
            except Exception:print(label,'FAILED: check service port/configuration');raise SystemExit(1)
asyncio.run(main())
