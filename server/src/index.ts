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
import { spawn } from 'child_process';

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

  // Look up the original message to check context before executing commands
  const originalMsg = store.get(body.message_id);

  // Resolve the pending approval
  store.resolve(body.message_id);

  // Only execute session commands for non-daemon approvals
  // Social daemon handles its own posting via SSE — don't spawn agent sessions for it
  const isDaemonApproval = originalMsg?.project === 'social-outreach';
  if (!isDaemonApproval) {
    if (body.action === 'restart') {
      executeCommand('restart');
    } else if (body.action === 'retry' || body.action === 'approve') {
      executeCommand('start');
    }
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
app.post('/sigil/command', requireDashboardAuth, async (req, res) => {
  const body = req.body as CommandRequest;
  if (!body.command) {
    res.status(400).json({ error: 'command required' });
    return;
  }

  // Execute the command — results publish async to the feed
  executeCommand(body.command, body.project);
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

// ─── Live service health (auto-polls, dashboard footer shows result) ────────
let cachedServiceHealth: { name: string; ok: boolean }[] = [];

async function pollServiceHealth(): Promise<void> {
  const results: { name: string; ok: boolean }[] = [];

  // Cortex
  const cortexUrl = process.env.CORTEX_API_URL ?? process.env.SIGIL_CORTEX_URL ?? '';
  if (cortexUrl) {
    try {
      const r = await fetch(`${cortexUrl}/health`, { signal: AbortSignal.timeout(5000) });
      results.push({ name: 'cortex', ok: r.ok });
    } catch {
      results.push({ name: 'cortex', ok: false });
    }
  }

  // Webhook listener
  if (WEBHOOK_URL) {
    try {
      const url = WEBHOOK_URL.replace('/hooks/trigger', '/health');
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      results.push({ name: 'webhook', ok: r.ok });
    } catch {
      results.push({ name: 'webhook', ok: false });
    }
  }

  cachedServiceHealth = results;

  // If something went down, auto-publish a warning
  for (const svc of results) {
    if (!svc.ok) {
      // Check if we already published a warning for this recently
      const recent = store.getRecent(10);
      const hasRecent = recent.some(n =>
        n.type === 'warning' && n.message.includes(svc.name) && (Math.floor(Date.now() / 1000) - n.time) < 300
      );
      if (!hasRecent) {
        pubsub.publish({
          id: PubSub.messageId(),
          topic: 'sigil-health',
          time: Math.floor(Date.now() / 1000),
          expires: Math.floor(Date.now() / 1000) + 3600,
          type: 'warning',
          title: `${svc.name} is down`,
          message: `${svc.name} health check failed`,
        });
      }
    }
  }
}

// Poll every 30s
setInterval(pollServiceHealth, 30_000);
pollServiceHealth(); // initial

app.get('/sigil/health-services', requireDashboardAuth, (_req, res) => {
  res.json(cachedServiceHealth);
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

// ─── Command Executor ───────────────────────────────────────────────────────
const AGENT_RUNNER = process.env.SIGIL_AGENT_RUNNER ?? ''; // e.g. "node /path/to/agent-runner/dist/index.js"
const PROJECT_ROOT = process.env.SIGIL_PROJECT_ROOT ?? process.cwd();

function executeCommand(command: string, project?: string): void {
  const now = Math.floor(Date.now() / 1000);

  if (command === 'pause_all') {
    // Kill any running agent-runner sessions
    const kill = spawn('pkill', ['-f', 'agent-runner'], { stdio: 'ignore' });
    kill.on('close', (code) => {
      pubsub.publish({
        id: PubSub.messageId(),
        topic: 'sigil-commands',
        time: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + DEFAULT_TTL,
        type: code === 0 ? 'warning' : 'info',
        title: 'All sessions stopped',
        message: code === 0 ? 'Active agent sessions killed' : 'No active sessions to stop',
      });
    });
    // Clear all tracked sessions
    for (const s of sessions.getAll()) {
      sessions.end(s.session_id);
    }
    return;
  }

  if (command === 'health') {
    // Health check — hit our own endpoints + cortex
    healthCheck().then(result => {
      pubsub.publish({
        id: PubSub.messageId(),
        topic: 'sigil-commands',
        time: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + DEFAULT_TTL,
        type: result.healthy ? 'success' : 'warning',
        title: 'Health check',
        message: result.summary,
      });
    });
    return;
  }

  if (command === 'start' && AGENT_RUNNER) {
    // Spawn agent session via agent-runner
    const parts = AGENT_RUNNER.split(' ');
    const cmd = parts[0];
    const baseArgs = parts.slice(1);
    const prompt = `You are starting a ${project ?? 'general'} session. Check session-state.md for your current assignment and begin working.`;
    const allArgs = [...baseArgs, '--prompt', prompt, '--max-turns', '40', '--cwd', PROJECT_ROOT];

    const sessionId = `sigil-${PubSub.messageId()}`;
    const child = spawn(cmd, allArgs, {
      env: { ...process.env },
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Track the session — it shows up in the dashboard immediately
    sessions.heartbeat(sessionId, {
      project: project ?? 'agent',
      status: 'active',
      model: 'gemini-2.5-pro',
    });

    pubsub.publish({
      id: PubSub.messageId(),
      topic: 'sigil-commands',
      time: now,
      expires: now + DEFAULT_TTL,
      type: 'success',
      title: `Session started: ${project ?? 'agent'}`,
      message: `Running on gemini-2.5-pro (max 40 turns)`,
      project,
    });

    // Capture output for when it finishes
    let output = '';
    child.stdout?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) output = line; // Keep last line as summary
    });
    child.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line) output = line;
    });

    // When session ends, report result
    child.on('close', (code) => {
      sessions.end(sessionId);
      const success = code === 0;
      pubsub.publish({
        id: PubSub.messageId(),
        topic: 'sigil-commands',
        time: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + DEFAULT_TTL,
        type: success ? 'success' : 'error',
        title: `Session ${success ? 'complete' : 'failed'}: ${project ?? 'agent'}`,
        message: output || (success ? 'Finished successfully' : `Exited with code ${code}`),
        project,
      });
    });

    child.on('error', (err) => {
      sessions.end(sessionId);
      pubsub.publish({
        id: PubSub.messageId(),
        topic: 'sigil-commands',
        time: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + DEFAULT_TTL,
        type: 'error',
        title: 'Session spawn failed',
        message: err.message,
        project,
      });
    });

    child.unref();
    return;
  }

  if (command === 'start' && WEBHOOK_URL) {
    // Fallback: use webhook listener
    webhookPost(WEBHOOK_URL, {
      prompt: `Start a ${project ?? 'general'} session. Check session-state.md for assignment.`,
      source: `sigil-start-${project ?? 'agent'}`,
      model: 'gemini-2.5-pro',
      max_turns: 40,
    }).then(resp => {
      pubsub.publish({
        id: PubSub.messageId(),
        topic: 'sigil-commands',
        time: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + DEFAULT_TTL,
        type: resp?.ok ? 'success' : 'error',
        title: `Session ${resp?.ok ? 'started' : 'failed'}`,
        message: resp?.ok
          ? `${project ?? 'Agent'} session dispatched to webhook listener`
          : `Webhook returned ${resp?.status ?? 'no response'}`,
        project,
      });
    });
    return;
  }

  if (command === 'restart') {
    // Docker restart
    const service = project ?? 'sigil';
    const child = spawn('docker', ['compose', 'restart', service], {
      cwd: dirname(DB_PATH).replace('/data', ''),
      stdio: 'pipe',
    });
    let output = '';
    child.stdout?.on('data', (d: Buffer) => output += d.toString());
    child.stderr?.on('data', (d: Buffer) => output += d.toString());
    child.on('close', (code) => {
      pubsub.publish({
        id: PubSub.messageId(),
        topic: 'sigil-commands',
        time: Math.floor(Date.now() / 1000),
        expires: Math.floor(Date.now() / 1000) + DEFAULT_TTL,
        type: code === 0 ? 'success' : 'error',
        title: code === 0 ? `Restarted ${service}` : `Restart failed`,
        message: output.trim() || (code === 0 ? 'Service restarted' : `Exit code ${code}`),
        project,
      });
    });
    return;
  }

  // Unknown command
  pubsub.publish({
    id: PubSub.messageId(),
    topic: 'sigil-commands',
    time: now,
    expires: now + DEFAULT_TTL,
    type: 'warning',
    title: `Unknown command: ${command}`,
    message: 'Configure SIGIL_AGENT_RUNNER or SIGIL_WEBHOOK_URL for session spawning',
  });
}

async function healthCheck(): Promise<{ healthy: boolean; summary: string }> {
  const checks: string[] = [];
  let allHealthy = true;

  // Check self
  checks.push('sigil: ok');

  // Check cortex
  const cortexUrl = process.env.CORTEX_API_URL ?? process.env.SIGIL_CORTEX_URL ?? '';
  if (cortexUrl) {
    try {
      const r = await fetch(`${cortexUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        checks.push('cortex: ok');
      } else {
        checks.push(`cortex: ${r.status}`);
        allHealthy = false;
      }
    } catch {
      checks.push('cortex: unreachable');
      allHealthy = false;
    }
  }

  // Check webhook listener
  if (WEBHOOK_URL) {
    try {
      const url = WEBHOOK_URL.replace('/hooks/trigger', '/health');
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        checks.push('webhook: ok');
      } else {
        checks.push(`webhook: ${r.status}`);
        allHealthy = false;
      }
    } catch {
      checks.push('webhook: unreachable');
      allHealthy = false;
    }
  }

  return {
    healthy: allHealthy,
    summary: checks.join(' · '),
  };
}

// ─── Smart Actions ──────────────────────────────────────────────────────────
function autoActions(message: string, type: string): SigilMessage['actions'] {
  const lower = message.toLowerCase();

  if (type === 'approval' || lower.includes('deploy') || lower.includes('approve')) {
    return [
      { gesture: '👍', label: 'Approve', action: 'approve' },
      { gesture: '👎', label: 'Reject', action: 'reject' },
      { gesture: '⏭', label: 'Skip', action: 'skip' },
      { gesture: '👀', label: 'Details', action: 'detail' },
    ];
  }
  if (lower.includes('stale') || lower.includes('heartbeat') || lower.includes('down') || lower.includes('restart')) {
    return [
      { gesture: '🔄', label: 'Restart', action: 'restart' },
      { gesture: '⏸', label: 'Defer', action: 'defer' },
    ];
  }
  if (lower.includes('fail') || lower.includes('error') || lower.includes('crash')) {
    return [
      { gesture: '🔄', label: 'Retry', action: 'retry' },
      { gesture: '⏭', label: 'Move on', action: 'skip' },
      { gesture: '👀', label: 'Details', action: 'detail' },
    ];
  }
  if (lower.includes('cost') || lower.includes('budget') || lower.includes('limit')) {
    return [
      { gesture: '✋', label: 'Pause', action: 'pause_all' },
      { gesture: '⏭', label: 'Continue', action: 'approve' },
    ];
  }
  if (lower.includes('stuck') || lower.includes('blocked') || lower.includes('waiting')) {
    return [
      { gesture: '👍', label: 'Go ahead', action: 'approve' },
      { gesture: '⏭', label: 'Move on', action: 'skip' },
      { gesture: '⏸', label: 'Pause', action: 'pause_all' },
    ];
  }
  // Generic warning/error
  return [
    { gesture: '👀', label: 'Details', action: 'detail' },
    { gesture: '⏭', label: 'Move on', action: 'skip' },
  ];
}

// ─── Context-Aware Commands ─────────────────────────────────────────────────
function buildContextCommands(
  activeSessions: import('./types.js').AgentSession[],
  _pendingApprovals: SigilMessage[],
): CommandButton[] {
  const cmds: CommandButton[] = [];

  const hasActive = activeSessions.some(s => s.status === 'active');
  const stale = activeSessions.filter(s => s.status === 'stale');

  if (hasActive) {
    // Session running — show stop, no launchers
    cmds.push({ label: 'Stop All', command: 'pause_all', icon: '■', confirm: true });
  } else if (stale.length > 0) {
    // Stale sessions — show restart
    for (const s of stale) {
      cmds.push({ label: `Restart ${s.project || 'session'}`, command: 'restart', project: s.project, icon: '🔄' });
    }
  } else {
    // Nothing running — show launchers
    for (const cmd of commands) {
      if (cmd.command === 'start') cmds.push(cmd);
    }
  }

  // Always include custom commands (not start/health/pause)
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
