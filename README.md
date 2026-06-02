# Sigil

**Signals and gestures for autonomous agents.**

A framework-agnostic agent control surface. Not a chat app, not an observability platform. A place where agents show you what they're doing and you respond with gestures.

The 90% of agent-human interactions that don't need a chat window: glanceable status, structured notifications with emoji/button responses, and command buttons.

## Architecture

```
+-----------+       +-----------+       +-----------+
|  Agents   | ----> |  Server   | <---> |  Bridge   | ----> Dashboard
| (cron,    |  pub  | (ntfy     |  SSE  | (TS/Node) |       (React)
|  Claude,  |       |  fork)    |       |           |
|  scripts) |       +-----------+       +-----------+
|           |                           |    |    |
+-----------+       +-------------------+    |    |
                    |                        |    |
            Heartbeat Monitor    Cost Monitor    Cortex
```

| Component | Stack | Purpose |
|-----------|-------|---------|
| **Server** | Go (ntfy fork) | Pub/sub message delivery, SSE, push notifications |
| **Bridge** | TypeScript / Express | Command dispatch, gesture routing, heartbeat monitoring, cost enforcement, cortex integration |
| **Dashboard** | React / Vite / Tailwind | Glanceable UI -- active sessions, notifications, command buttons |

## Quick Start

### Bridge (core component)

```bash
cd bridge
cp config.example.yaml config.yaml   # edit with your values
npm install
npm run dev                           # starts on port 3848
```

### Dashboard UI

```bash
cd ui
npm install
npm run dev                           # Vite dev server
```

In production, the bridge serves the built UI as static files.

## Bridge API

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/webhook` | Receive agent messages (heartbeats, notifications, approvals) |
| `POST` | `/publish` | Agents publish messages through the bridge to the sigil server |
| `POST` | `/gesture` | Human gesture responses (approve/reject from UI or ntfy buttons) |
| `POST` | `/command` | Execute commands from the dashboard (start session, health check, pause) |
| `GET` | `/events` | SSE stream for live dashboard updates |
| `GET` | `/status` | Current state snapshot (sessions, pending approvals, commands) |
| `GET` | `/health` | Bridge health check |

### Agent Messages

Agents communicate with Sigil by posting structured messages:

```typescript
interface AgentMessage {
  type: 'info' | 'success' | 'warning' | 'error' | 'approval' | 'command_result' | 'heartbeat';
  message: string;
  title?: string;
  project?: string;
  session_id?: string;
  priority?: 'min' | 'low' | 'default' | 'high' | 'urgent';
  actions?: GestureAction[];    // buttons for human response
  timeout?: string;             // e.g., "30m" -- auto-resolves after timeout
  fallback?: string;            // "approve" | "reject" | "skip" on timeout
  tags?: string[];
  metadata?: Record<string, unknown>;
}
```

### Gesture Actions (response buttons)

```typescript
interface GestureAction {
  gesture: string;    // emoji
  label: string;      // display text
  action: string;     // signal: "approve", "reject", "retry"
  style?: 'default' | 'danger' | 'success';
}
```

### Heartbeat

Agents send periodic heartbeats so the dashboard shows live session status:

```typescript
interface HeartbeatMessage {
  type: 'heartbeat';
  session_id: string;
  project: string;
  status: 'active' | 'idle' | 'blocked' | 'completing';
  current_task?: string;
  tool_calls?: number;
  cost_usd?: number;
  uptime_seconds?: number;
}
```

### Commands

Dashboard buttons dispatch commands to agents:

```typescript
interface CommandMessage {
  type: 'command';
  command: string;       // "start", "health", "pause_all"
  project?: string;
  args?: Record<string, unknown>;
}
```

## Configuration

`config.yaml`:

```yaml
sigil_url: https://ntfy.example.com
bridge_port: 3848
sigil_topic: paco

heartbeat:
  stale_threshold_seconds: 300
  check_interval_seconds: 60

cost_ceilings:
  default_per_session_usd: 3.0
  warning_threshold: 0.9

commands:
  - label: Start PACO
    command: start
    project: paco
    icon: "\U0001F680"
  - label: Health Check
    command: health
    icon: "\U0001F48A"
  - label: Pause All
    command: pause_all
    icon: "\u270B"
    confirm: true
```

## Monitors

The bridge runs three background monitors:

| Monitor | Purpose |
|---------|---------|
| **HeartbeatMonitor** | Tracks active agent sessions, detects stale sessions (no heartbeat within threshold) |
| **CostMonitor** | Enforces per-session cost ceilings, warns at configurable threshold (default 90%) |
| **TimeoutManager** | Handles approval message timeouts with fallback actions (auto-approve/reject/skip) |

## Integrations

- **Sigil Server (ntfy)** -- Subscribes to topics via SSE, publishes messages via HTTP API
- **Cortex** -- Logs commands and gestures to the cortex operational log

## Deployment

Sigil ships as a container. Build and run with Docker Compose:

```bash
docker compose up -d --build   # builds server/ (+ bundled UI) and starts the service
```

The server image is defined in `server/Dockerfile`; `docker-compose.yml` wires
up the service, persistent SQLite volume, and ports. Put it behind your reverse
proxy of choice (Caddy/nginx) for TLS and subdomain routing.

## Project Structure

```
sigil/
├── server/              # TypeScript sigil server (Express + SQLite + WS pub/sub)
│   ├── src/             # routes, SSE, command/gesture handlers, monitors
│   ├── data/            # SQLite store
│   ├── site/            # built dashboard UI (served by the server)
│   ├── Dockerfile
│   └── package.json
├── ui/                  # React dashboard source (Vite + Tailwind + shadcn/ui)
└── docker-compose.yml
```

> The earlier Go ntfy fork and standalone TypeScript bridge were replaced by the
> unified TypeScript server and removed from the tree (recoverable from git history).

## Status

Active. The TypeScript server (pub/sub, gestures, commands, cortex logging) and
the React dashboard are wired together and deployed via Docker.

Part of the [Fozikio](https://github.com/Fozikio) agent toolkit.

## Contributing

See the [Contributing Guide](https://github.com/Fozikio/.github/blob/main/CONTRIBUTING.md). Report security issues via [SECURITY.md](https://github.com/Fozikio/.github/blob/main/SECURITY.md).

## Related Projects

- [cortex-engine](https://github.com/Fozikio/cortex-engine) — Cognitive memory layer that Sigil can monitor
- [@fozikio/reflex](https://github.com/Fozikio/reflex) — Portable safety guardrails for agents
- [fozikio.com](https://www.fozikio.com) — Documentation and guides
- [r/fozikio](https://www.reddit.com/r/Fozikio/) — Community

## License

Apache 2.0
