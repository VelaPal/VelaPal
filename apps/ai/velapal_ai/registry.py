import asyncio
import time
from pathlib import Path
import aiosqlite

class Registry:
    def __init__(self, path, saver):
        self.path, self.saver = str(path), saver
        self.locks = [asyncio.Lock() for _ in range(64)]
    def guard(self, tenant, case):
        import hashlib
        return self.locks[int(hashlib.sha256(f"{tenant}:{case}".encode()).hexdigest(), 16) % 64]
    async def setup(self):
        async with aiosqlite.connect(self.path) as db:
            await db.execute("CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, tenant TEXT, case_id TEXT, expires REAL)")
            await db.commit()
        try: Path(self.path).chmod(0o600)
        except OSError: pass
    async def add(self, thread_id, tenant, case, days):
        async with aiosqlite.connect(self.path) as db:
            await db.execute("INSERT OR REPLACE INTO threads VALUES (?, ?, ?, ?)", (thread_id, tenant, case or "", time.time() + days * 86400));await db.commit()
    async def purge_case(self, tenant, case):
        # Caller holds case guard: a concurrently running graph cannot recreate a purged checkpoint.
        async with aiosqlite.connect(self.path) as db:
            async with db.execute("SELECT id FROM threads WHERE tenant = ? AND case_id = ?", (tenant, case)) as cur: rows = await cur.fetchall()
            for (tid,) in rows: await self.saver.adelete_thread(tid)
            await db.execute("DELETE FROM threads WHERE tenant = ? AND case_id = ?", (tenant, case));await db.commit()
    async def expire(self):
        async with aiosqlite.connect(self.path) as db:
            async with db.execute("SELECT id,tenant,case_id FROM threads WHERE expires <= ?", (time.time(),)) as cur: rows = await cur.fetchall()
        for tid, tenant, case in rows:
            async with self.guard(tenant, case):
                await self.saver.adelete_thread(tid)
                async with aiosqlite.connect(self.path) as db:
                    await db.execute("DELETE FROM threads WHERE id = ? AND expires <= ?", (tid, time.time()));await db.commit()
