# Sigil

**Signals and gestures for autonomous agents.**

A framework-agnostic agent control surface. Not a chat app, not an observability platform. A place where agents show you what they're doing and you respond with gestures.

The 90% of agent-human interactions that don't need a chat window: glanceable status, structured notifications with emoji/button responses, and command buttons.

## Architecture

| Component | Stack | Purpose |
|-----------|-------|---------|
| **Server** | Go (ntfy fork) | Pub/sub message delivery, SSE, push notifications |
| **Bridge** | TypeScript | Command dispatch, gesture routing, heartbeat monitoring, cost enforcement, cortex integration |
| **Dashboard** | React | Glanceable UI embedded in the Go binary |

## Quick Start

```bash
cd bridge
npm install
npm run dev
```

## Status

Early development.

## License

Apache 2.0
