// Sigil — Agent Control Surface
// One binary. One port. Pub/sub + dashboard + gestures + commands.
// No bridge. No middleware layer. Agents POST, humans tap, signals flow.

import express from 'express';
import cookieParser from 'cookie-parser';
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
app.use(cookieParser());
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

// ─── Dashboard auth (protects UI, SSE, status, gestures) ───────────────────
const DASHBOARD_PASSWORD = process.env.SIGIL_DASHBOARD_PASSWORD ?? '';

function requireDashboardAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!DASHBOARD_PASSWORD) return next(); // No password = open access

  // Check cookie
  if (req.cookies?.sigil_auth === DASHBOARD_PASSWORD) return next();

  // Check query param (for SSE, which can't send custom headers)
  if (req.query.token === DASHBOARD_PASSWORD) return next();

  // Check header
  const token = req.headers['x-sigil-token'] as string;
  if (token === DASHBOARD_PASSWORD) return next();

  res.status(401).json({ error: 'unauthorized' });
}

// Login endpoint — sets auth cookie
app.post('/sigil/login', express.urlencoded({ extended: false }), (req, res) => {
  const password = (req.body as { password?: string }).password ?? '';
  if (!DASHBOARD_PASSWORD || password === DASHBOARD_PASSWORD) {
    res.cookie('sigil_auth', DASHBOARD_PASSWORD, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'wrong password' });
  }
});

// ─── SSE stream (dashboard subscribes here) ─────────────────────────────────
app.get('/events', requireDashboardAuth, (_req, res) => {
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
  const msgType = body.type ?? 'info';

  // Auto-add actions for warnings/errors if agent didn't provide any
  let actions = body.actions;
  if (!actions && (msgType === 'warning' || msgType === 'error')) {
    actions = autoActions(body.message, msgType);
  }

  const msg: SigilMessage = {
    id: PubSub.messageId(),
    topic: body.topic ?? 'default',
    time: now,
    expires: now + DEFAULT_TTL,
    type: msgType,
    title: body.title,
    message: typeof body.message === 'string' ? body.message.replace(/^"|"$/g, '') : body.message,
    priority: body.priority ?? 'default',
    project: body.project,
    session_id: body.session_id,
    actions,
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
app.get('/sigil/status', requireDashboardAuth, (_req, res) => {
  const activeSessions = sessions.getAll();
  const pendingApprovals = store.getPendingApprovals();

  // Build context-aware commands
  const contextCommands = buildContextCommands(activeSessions, pendingApprovals);

  const resp: StatusResponse = {
    sessions: activeSessions,
    notifications: store.getRecent(50),
    pending_approvals: pendingApprovals,
    commands: contextCommands,
  };
  res.json(resp);
});

// ─── Gesture (human responds to approval) ───────────────────────────────────
app.post('/sigil/gesture', requireDashboardAuth, (req, res) => {
  const body = req.body as GestureRequest;
  if (!body.action || !body.message_id) {
    res.status(400).json({ error: 'action and message_id required' });
    return;
  }

  // Resolve the pending approval
  store.resolve(body.message_id);

  // Actionable gestures trigger real work via webhook
  if (WEBHOOK_URL && (body.action === 'restart' || body.action === 'retry' || body.action === 'approve')) {
    const actionPrompts: Record<string, string> = {
      restart: 'A service was flagged as stale. Check docker compose status, identify the stale service, and restart it. Report results to sigil.',
      retry: 'A previous task failed. Retry the operation and report results to sigil.',
      approve: 'An action was approved via Sigil dashboard. Proceed with the approved operation.',
    };
    webhookPost(WEBHOOK_URL, {
      prompt: actionPrompts[body.action] ?? `Gesture action: ${body.action}`,
      source: `sigil-gesture-${body.action}`,
      model: 'sonnet',
      max_turns: 50,
    }).catch(() => {});
  }

  // Publish human-readable feedback
  const actionLabels: Record<string, string> = {
    approve: 'Approved',
    reject: 'Rejected',
    retry: 'Retry requested',
    detail: 'Details requested',
    dismiss: 'Dismissed',
  };
  const label = actionLabels[body.action] ?? body.action;
  const feedbackMsg: SigilMessage = {
    id: PubSub.messageId(),
    topic: 'sigil-gestures',
    time: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + 300, // 5 min TTL — ephemeral feedback
    type: 'success',
    message: label,
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
    if (body.command === 'pause_all') {
      // Pause doesn't need webhook — just publish a stop signal
      resultMsg = 'Pause signal sent to all agents';
      resultType = 'warning';
    } else if (WEBHOOK_URL) {
      // Build prompt for the webhook listener's session spawner
      const prompts: Record<string, string> = {
        start: `You are starting a ${body.project ?? 'general'} session. Check session-state.md for your current assignment and begin working.`,
        health: 'Run an ops-health check: verify cortex API responds, check sigil health, check webhook listener, report status to sigil.',
        restart: `Restart the ${body.project ?? 'stale'} service. Check docker compose status and fix any issues.`,
      };
      const prompt = prompts[body.command] ?? `Execute: ${body.command}`;
      const model = body.command === 'health' ? 'sonnet' : 'opus';

      const resp = await webhookPost(WEBHOOK_URL, {
        prompt,
        source: `sigil-${body.command}`,
        model,
        max_turns: body.command === 'health' ? 30 : 200,
      });

      if (resp && resp.ok) {
        resultMsg = `${body.command === 'start' ? 'Session' : 'Task'} dispatched${body.project ? ` for ${body.project}` : ''} (${model})`;
        resultType = 'success';
      } else {
        resultMsg = `Webhook returned ${resp?.status ?? 'no response'} — check webhook listener`;
        resultType = 'error';
      }
    } else {
      resultMsg = `No webhook configured — set SIGIL_WEBHOOK_URL`;
      resultType = 'warning';
    }
  } catch (err) {
    resultMsg = `Failed: ${err instanceof Error ? err.message : 'unknown error'}`;
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

    case 'notification': {
      // Agent sends a notification to be displayed
      const notifType = body.type === 'warning' || body.priority === 'urgent' ? 'warning'
        : body.type === 'error' ? 'error'
        : body.type === 'success' ? 'success'
        : body.type === 'approval' ? 'approval'
        : 'info';

      // Auto-add contextual actions for warnings/errors if none provided
      let actions = body.actions;
      if (!actions && (notifType === 'warning' || notifType === 'error')) {
        const msg_lower = (body.message ?? '').toLowerCase();
        if (msg_lower.includes('stale') || msg_lower.includes('heartbeat') || msg_lower.includes('down')) {
          actions = [
            { gesture: '🔄', label: 'Restart', action: 'restart' },
            { gesture: '👀', label: 'Investigate', action: 'detail' },
          ];
        } else if (msg_lower.includes('deploy') || msg_lower.includes('update')) {
          actions = [
            { gesture: '👍', label: 'Approve', action: 'approve' },
            { gesture: '👎', label: 'Skip', action: 'reject' },
          ];
        } else {
          actions = [
            { gesture: '👀', label: 'Investigate', action: 'detail' },
          ];
        }
      }

      const notifMsg: SigilMessage = {
        id: PubSub.messageId(),
        topic: body.project ? `sigil-${body.project}` : 'sigil-notifications',
        time: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + DEFAULT_TTL,
        type: notifType,
        title: body.title,
        message: body.message ?? '',
        project: body.project,
        session_id: body.session_id,
        actions,
        timeout: body.timeout,
        fallback: body.fallback,
      };
      pubsub.publish(notifMsg);
      break;
    }
  }

  res.json({ ok: true });
});

// ─── Notification management ────────────────────────────────────────────────

// Dismiss/archive a notification
app.delete('/sigil/notifications/:id', requireDashboardAuth, (req, res) => {
  store.resolve(req.params.id as string);
  res.json({ ok: true });
});

// Clear all notifications
app.delete('/sigil/notifications', requireAuth, (_req, res) => {
  const pruned = store.pruneAll();
  res.json({ ok: true, cleared: pruned });
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

// ─── Smart Actions ──────────────────────────────────────────────────────────
function autoActions(message: string, type: string): SigilMessage['actions'] {
  const lower = message.toLowerCase();

  if (type === 'approval' || lower.includes('deploy') || lower.includes('approve')) {
    return [
      { gesture: '👍', label: 'Approve', action: 'approve' },
      { gesture: '👎', label: 'Reject', action: 'reject' },
      { gesture: '👀', label: 'Details', action: 'detail' },
    ];
  }
  if (lower.includes('stale') || lower.includes('heartbeat') || lower.includes('down') || lower.includes('restart')) {
    return [
      { gesture: '🔄', label: 'Restart', action: 'restart' },
      { gesture: '✋', label: 'Ignore', action: 'dismiss' },
    ];
  }
  if (lower.includes('fail') || lower.includes('error') || lower.includes('crash')) {
    return [
      { gesture: '🔄', label: 'Retry', action: 'retry' },
      { gesture: '👀', label: 'Investigate', action: 'detail' },
    ];
  }
  if (lower.includes('cost') || lower.includes('budget') || lower.includes('limit')) {
    return [
      { gesture: '✋', label: 'Stop', action: 'pause_all' },
      { gesture: '👀', label: 'Details', action: 'detail' },
    ];
  }
  // Generic warning/error — at least give investigate
  return [
    { gesture: '👀', label: 'Investigate', action: 'detail' },
  ];
}

// ─── Context-Aware Commands ─────────────────────────────────────────────────
function buildContextCommands(
  activeSessions: import('./types.js').AgentSession[],
  _pendingApprovals: SigilMessage[],
): CommandButton[] {
  const cmds: CommandButton[] = [];

  // Stale sessions get restart/kill buttons
  const staleSessions = activeSessions.filter(s => s.status === 'stale');
  for (const s of staleSessions) {
    cmds.push({
      label: `Restart ${s.project || 'session'}`,
      command: 'restart',
      project: s.project,
      icon: '🔄',
    });
  }

  // Active sessions get a stop button
  if (activeSessions.some(s => s.status === 'active')) {
    cmds.push({
      label: 'Stop All',
      command: 'pause_all',
      icon: '✋',
      confirm: true,
    });
  }

  // If NO sessions are running, show launchers from config
  if (activeSessions.length === 0) {
    // Add configured launch commands
    for (const cmd of commands) {
      if (cmd.command === 'start') {
        cmds.push(cmd);
      }
    }
  }

  // Always show health check
  cmds.push({ label: 'Health', command: 'health', icon: '💊' });

  // Add any non-start, non-health commands from config (custom ones)
  for (const cmd of commands) {
    if (cmd.command !== 'start' && cmd.command !== 'health' && cmd.command !== 'pause_all') {
      cmds.push(cmd);
    }
  }

  return cmds;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
async function webhookPost(url: string, body: unknown): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (WEBHOOK_SECRET) {
      headers['Authorization'] = `Bearer ${WEBHOOK_SECRET}`;
      headers['x-webhook-secret'] = WEBHOOK_SECRET; // webhook-listener uses this header
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return resp;
  } catch {
    return null;
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
