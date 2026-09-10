# sigil

## Workflow tier: Prototype

Agent control surface — pub/sub, gestures, commands, and dashboard. Monorepo with server + UI.

## Commands

### Server (`server/`)
```bash
cd server
npm run build        # tsc → dist/
npm run dev          # tsx watch src/index.ts
npm run start        # node dist/index.js
npm run test         # vitest run (src/registry.test.ts, src/routes/registry.test.ts)
npm run test:watch   # vitest
npm run build:ui     # Build UI and copy to server/site/
```

### Container
```bash
docker compose up -d # docker-compose.yml → builds server/Dockerfile (port 8090) + ../../Services/webhook-listener (port 3847)
```

### UI (`ui/`)
```bash
cd ui
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build
npm run lint         # ESLint
```

## Architecture

```
server/
├── src/
│   ├── index.ts     # Express server + WebSocket + SSE
│   ├── pubsub.ts    # Pub/sub message delivery
│   ├── registry.ts  # Agent registry
│   ├── routes/      # Express route modules (registry.ts)
│   ├── sessions.ts  # Agent session tracking
│   ├── store.ts     # SQLite store (better-sqlite3)
│   └── types.ts     # Type definitions
├── Dockerfile       # Server image used by docker-compose.yml
├── site/            # Built UI assets (served statically)
└── data/            # SQLite database (sigil.db)
ui/
├── src/
│   ├── App.tsx      # Root component
│   ├── components/  # React components (shadcn/ui)
│   └── hooks/       # Custom hooks (useSigil for data subscriptions)
```

## Key Patterns

- Server: Express + WebSocket + SSE for real-time agent control
- UI: React 19, Vite, Tailwind CSS 4, shadcn/ui
- Database: SQLite via better-sqlite3
- UI is built and copied into `server/site/` for single-process deployment
- Container path: `docker-compose.yml` + `server/Dockerfile` run the same single process with SQLite on a `sigil-data` volume (`SIGIL_DB=/app/data/sigil.db`)
- Env config via `.env` (see `.env.example`)
