// Sigil — Agent Control Surface
// One binary. One port. Pub/sub + dashboard + gestures + commands.
// No bridge. No middleware layer. Agents POST, humans tap, signals flow.

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { MessageStore } from './store.js';
import { PubSub } from './pubsub.js';
import { SessionTracker } from './sessions.js';
import type { SigilMessage, GestureRequest, CommandRequest, CommandButton, StatusResponse } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '8090', 10);
const DB_PATH = process.env.SIGIL_DB ?? join(__dirname, '..', 'data', 'sigil.db');
const AUTH_TOKEN = process.env.SIGIL_TOKEN ?? '';
const WEBHOOK_URL = process.env.SIGIL_WEBHOOK_URL ?? '';    // Optional: POST events here
const WEBHOOK_SECRET = process.env.SIGIL_WEBHOOK_SECRET ?? '';
const DEFAULT_TTL = 24 * 60 * 60; // 24 hours

// Default commands — override via POST /sigil/commands or config
// Default commands — override via SIGIL_COMMANDS env (JSON array) or POST /sigil/commands
const DEFAULT_COMMANDS: CommandButton[] = JSON.parse(
  process.env.SIGIL_COMMANDS ?? '[{"label":"Health Check","command":"health","icon":"💊"},{"label":"Pause All","command":"pause_all","icon":"✋","confirm":true}]'
);

// ─── Init ───────────────────────────────────────────────────────────────────
// Ensure data directory exists
const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) {
  const { mkdirSync } = await import('fs');
  mkdirSync(dataDir, { recursive: true });
}

const store = new MessageStore(DB_PATH);
const pubsub = new PubSub(store);
const sessions = new SessionTracker();
let commands = [...DEFAULT_COMMANDS];

const app = express();
app.use(express.json({ limit: '16kb' }));
app.set('trust proxy', true);

// ─── Auth middleware (optional) ─────────────────────────────────────────────
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!AUTH_TOKEN) return next(); // No token = open access
  const token = req.headers.authorization?.replace('Bearer ', '') ??
                req.headers['x-sigil-token'] as string;
  if (token === AUTH_TOKEN) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// ─── CORS ───────────────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sigil-Token');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ─── SSE stream (dashboard subscribes here) ─────────────────────────────────
app.get('/events', (_req, res) => {
  pubsub.subscribeSSE(res);
});

// ─── Publish (agents POST messages here) ────────────────────────────────────
app.post('/publish', requireAuth, (req, res) => {
  const body = req.body as Partial<SigilMessage>;
  if (!body.message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const msg: SigilMessage = {
    id: PubSub.messageId(),
    topic: body.topic ?? 'default',
    time: now,
    expires: now + DEFAULT_TTL,
    type: body.type ?? 'info',
    title: body.title,
    message: body.message,
    priority: body.priority ?? 'default',
    project: body.project,
    session_id: body.session_id,
    actions: body.actions,
    timeout: body.timeout,
    fallback: body.fallback,
  };

  pubsub.publish(msg);

  // Webhook forwarding (optional)
  if (WEBHOOK_URL) {
    webhookPost(WEBHOOK_URL, msg).catch(() => {});
  }

  res.json({ id: msg.id });
});

// ─── Status (dashboard polls or SSE inits from here) ────────────────────────
app.get('/sigil/status', (_req, res) => {
  const resp: StatusResponse = {
    sessions: sessions.getAll(),
    notifications: store.getRecent(50),
    pending_approvals: store.getPendingApprovals(),
    commands,
  };
  res.json(resp);
});

// ─── Gesture (human responds to approval) ───────────────────────────────────
app.post('/sigil/gesture', (req, res) => {
  const body = req.body as GestureRequest;
  if (!body.action || !body.message_id) {
    res.status(400).json({ error: 'action and message_id required' });
    return;
  }

  // Resolve the pending approval
  store.resolve(body.message_id);

  // Webhook forwarding — gestures can trigger actions
  if (WEBHOOK_URL) {
    webhookPost(WEBHOOK_URL, {
      type: 'gesture',
      action: body.action,
      message_id: body.message_id,
      responder: body.responder ?? 'dashboard',
      // Pass the original message context so the webhook handler knows what was approved/rejected
      prompt: body.action === 'approve' ? 'Approved via Sigil dashboard'
            : body.action === 'reject' ? 'Rejected via Sigil dashboard'
            : body.action === 'retry' ? 'Retry requested via Sigil dashboard'
            : `Gesture: ${body.action}`,
    }).catch(() => {});
  }

  // Publish feedback so dashboard shows the action was taken
  const feedbackMsg: SigilMessage = {
    id: PubSub.messageId(),
    topic: 'sigil-gestures',
    time: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + DEFAULT_TTL,
    type: 'success',
    message: `${body.action} → ${body.message_id.slice(0, 8)}`,
    title: `Gesture: ${body.action}`,
  };
  pubsub.publish(feedbackMsg);

  res.json({ ok: true, action: body.action });
});

// ─── Command (dashboard dispatches action) ──────────────────────────────────
app.post('/sigil/command', requireAuth, async (req, res) => {
  const body = req.body as CommandRequest;
  if (!body.command) {
    res.status(400).json({ error: 'command required' });
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // Execute the command and publish result
  let resultMsg: string;
  let resultType: SigilMessage['type'] = 'info';

  try {
    if (WEBHOOK_URL) {
      // Forward to webhook listener for execution
      await webhookPost(WEBHOOK_URL, {
        type: 'command',
        command: body.command,
        project: body.project,
        prompt: body.command === 'start'
          ? `Start a ${body.project ?? 'general'} session`
          : body.command === 'health'
            ? 'Run a health check on all services'
            : `Execute command: ${body.command}`,
      });
      resultMsg = `Command "${body.command}" dispatched${body.project ? ` for ${body.project}` : ''}`;
      resultType = 'success';
    } else {
      resultMsg = `Command "${body.command}" received but no webhook configured — set SIGIL_WEBHOOK_URL`;
      resultType = 'warning';
    }
  } catch {
    resultMsg = `Failed to dispatch command "${body.command}"`;
    resultType = 'error';
  }

  // Publish result as notification so dashboard shows feedback
  const cmdResult: SigilMessage = {
    id: PubSub.messageId(),
    topic: 'sigil-commands',
    time: now,
    expires: now + DEFAULT_TTL,
    type: resultType,
    title: `Command: ${body.command}`,
    message: resultMsg,
    project: body.project,
  };
  pubsub.publish(cmdResult);

  res.json({ ok: true, command: body.command });
});

// ─── Webhook (agents send heartbeats here) ──────────────────────────────────
app.post('/sigil/webhook', requireAuth, (req, res) => {
  const body = req.body;
  const type = body.type as string;

  switch (type) {
    case 'heartbeat':
      if (body.session_id) {
        sessions.heartbeat(body.session_id, {
          project: body.project,
          status: body.status,
          tool_calls: body.tool_calls,
          model: body.model,
        });
      }
      break;

    case 'end':
      if (body.session_id) {
        sessions.end(body.session_id);
      }
      break;

    case 'notification':
      // Agent sends a notification to be displayed
      const msg: SigilMessage = {
        id: PubSub.messageId(),
        topic: body.project ? `sigil-${body.project}` : 'sigil-notifications',
        time: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + DEFAULT_TTL,
        type: body.priority === 'urgent' ? 'warning' : 'info',
        title: body.title,
        message: body.message ?? '',
        project: body.project,
        session_id: body.session_id,
        actions: body.actions,
        timeout: body.timeout,
        fallback: body.fallback,
      };
      pubsub.publish(msg);
      break;
  }

  res.json({ ok: true });
});

// ─── Health ─────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    healthy: true,
    clients: pubsub.clientCount,
    sessions: sessions.getAll().length,
    uptime: process.uptime(),
  });
});

// ─── Serve dashboard UI (static files from site/) ───────────────────────────
const sitePath = join(__dirname, '..', 'site');
if (existsSync(sitePath)) {
  app.use(express.static(sitePath));
  // SPA fallback — serve index.html for any unmatched GET
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/sigil/') || req.path.startsWith('/events') || req.path.startsWith('/publish') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(join(sitePath, 'index.html'));
  });
}

// ─── Start ──────────────────────────────────────────────────────────────────
const server = createServer(app);

// WebSocket upgrade
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  pubsub.subscribeWS(ws);
});

sessions.start();

// Prune expired messages every hour
setInterval(() => store.prune(), 60 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Sigil listening on :${PORT}`);
  if (existsSync(sitePath)) console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`SSE: http://localhost:${PORT}/events`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  if (AUTH_TOKEN) console.log('Auth: enabled (SIGIL_TOKEN)');
  if (WEBHOOK_URL) console.log(`Webhook: ${WEBHOOK_URL}`);
});

// ─── Helpers ────────────────────────────────────────────────────────────────
async function webhookPost(url: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (WEBHOOK_SECRET) headers['Authorization'] = `Bearer ${WEBHOOK_SECRET}`;
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  sessions.stop();
  store.close();
  server.close();
});
