# sigil

Agent control surface — pub/sub, gestures, commands, and dashboard. Monorepo with server + UI.

## Commands

### Server (`server/`)
```bash
cd server
npm run build        # tsc → dist/
npm run dev          # tsx watch src/index.ts
npm run start        # node dist/index.js
npm run build:ui     # Build UI and copy to server/site/
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
│   ├── sessions.ts  # Agent session tracking
│   ├── store.ts     # SQLite store (better-sqlite3)
│   └── types.ts     # Type definitions
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
- Env config via `.env` (see `.env.example`)
