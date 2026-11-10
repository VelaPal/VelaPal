"""Copy local examples once. Never overwrite an existing .env or .env.local."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[3]
for example,destination in [(root/'apps/ai/.env.example',root/'apps/ai/.env'),(root/'apps/api/.env.example',root/'apps/api/.env'),(root/'apps/web/.env.integration.example',root/'apps/web/.env.local')]:
    if destination.exists():print('Kept existing',destination.relative_to(root))
    else:shutil.copyfile(example,destination);print('Created',destination.relative_to(root))
print('Check: matching service secrets; web API mode; API_UPSTREAM=http://localhost:4000. Never paste API keys into chat or commit .env files.')
