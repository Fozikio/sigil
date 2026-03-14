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

### VPS (systemd)

```bash
cd bridge
bash deploy.sh          # builds, syncs to VPS, restarts service
bash install-service.sh # first-time systemd unit setup
```

The deploy script builds both bridge and UI, rsyncs to the remote, and restarts the systemd unit.

### Caddy (reverse proxy)

A Caddy snippet is provided in `bridge/caddy-snippet.txt` for routing under a subdomain (`sigil.example.com`) or path-based under the ntfy domain.

## Project Structure

```
sigil/
├── server/          # Go ntfy fork (pub/sub + push notifications)
├── bridge/          # TypeScript bridge server
│   ├── src/
│   │   ├── server.ts              # Express app, SSE, route handlers
│   │   ├── types.ts               # All TypeScript interfaces
│   │   ├── config.ts              # YAML config loader
│   │   ├── enrichment.ts          # Message enrichment
│   │   ├── handlers/
│   │   │   ├── webhook.ts         # Agent message handler
│   │   │   ├── gesture.ts         # Human response handler
│   │   │   └── command.ts         # Command dispatcher
│   │   ├── monitors/
│   │   │   ├── heartbeat.ts       # Session liveness tracking
│   │   │   ├── cost.ts            # Cost ceiling enforcement
│   │   │   └── timeout.ts         # Approval timeout manager
│   │   └── integrations/
│   │       ├── sigil-client.ts    # ntfy HTTP + SSE client
│   │       ├── cortex.ts          # Cortex API client
│   │       └── firestore.ts       # Firestore integration
│   ├── config.example.yaml
│   ├── deploy.sh
│   └── install-service.sh
└── ui/              # React dashboard (Vite + Tailwind + shadcn/ui)
```

## Status

Early development. Bridge is functional -- heartbeats, commands, ntfy subscription, and cortex integration are wired. Dashboard UI is scaffolded.

Part of the [Fozikio](https://github.com/Fozikio) agent toolkit.

## License

Apache 2.0
