# VelaPal web frontend

The Next.js frontend connects to Express through a same-origin API proxy.

## Local development

1. Start the Express API from the repository root using the instructions in the root README.
2. Copy `.env.example` to `.env.local` and set `API_UPSTREAM` to the Express origin (default `http://localhost:4000`).
3. Run `npm install` and `npm run dev` from `apps/web`.

Browser API calls use the same-origin `/api/v1` path. Next.js forwards these requests to `API_UPSTREAM`. To call Express directly, set `NEXT_PUBLIC_API_URL` to an API origin; the frontend API client adds `/api/v1` when needed.

## Commands

- `npm run dev` starts Next.js on port 3000.
- `npm run build` builds the frontend.
- `npm run lint` checks frontend source.
- `npm run typecheck` runs TypeScript checks.
- `npm test` runs API client unit tests.
