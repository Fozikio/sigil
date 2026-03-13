import express from 'express';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';
import type { AgentMessage, BridgeConfig } from './types.js';
import { handleWebhook } from './handlers/webhook.js';
import { handleGesture } from './handlers/gesture.js';
import { handleCommand } from './handlers/command.js';
import { HeartbeatMonitor } from './monitors/heartbeat.js';
import { CostMonitor } from './monitors/cost.js';
import { TimeoutManager } from './monitors/timeout.js';
import { SigilClient } from './integrations/sigil-client.js';
import { CortexClient } from './integrations/cortex.js';
import { enrichMessage } from './enrichment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** SSE client connection. */
interface SSEClient {
  id: string;
  res: Response;
}

export function createBridgeServer(config: BridgeConfig): express.Express {
  const app = express();
  app.use(express.json());

  // CORS for dashboard UI
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
  });

  // Initialize monitors
  const heartbeat = new HeartbeatMonitor(config);
  const cost = new CostMonitor(config);
  const timeout = new TimeoutManager(config);

  // Initialize integrations
  const sigil = new SigilClient(config);
  const cortex = new CortexClient(config);

  // SSE clients for live dashboard updates
  const sseClients: SSEClient[] = [];

  function broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (let i = sseClients.length - 1; i >= 0; i--) {
      try {
        sseClients[i].res.write(payload);
      } catch {
        sseClients.splice(i, 1);
      }
    }
  }

  // --- SSE endpoint for live dashboard updates ---
  app.get('/events', (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const client: SSEClient = { id: `sse-${Date.now()}`, res };
    sseClients.push(client);

    // Send current state on connect
    res.write(`event: init\ndata: ${JSON.stringify({
      sessions: heartbeat.getSessions(),
      pending_approvals: timeout.getPending(),
      commands: config.commands,
    })}\n\n`);

    req.on('close', () => {
      const idx = sseClients.indexOf(client);
      if (idx >= 0) sseClients.splice(idx, 1);
    });
  });

  // --- Webhook from sigil server (on every publish) ---
  app.post('/webhook', (req: Request, res: Response) => {
    const message = req.body as AgentMessage;
    handleWebhook(req.body, { config, heartbeat, cost, timeout });

    // Enrich and broadcast to dashboard
    if (message?.type && message.type !== 'heartbeat') {
      const enriched = enrichMessage(message, new Map(
        heartbeat.getSessions().map((s) => [s.session_id, s]),
      ));
      broadcast('notification', enriched);
    }

    // Broadcast session updates on heartbeat
    if (message?.type === 'heartbeat') {
      broadcast('sessions', heartbeat.getSessions());
    }

    res.sendStatus(200);
  });

  // --- Gesture response from dashboard UI or ntfy action button ---
  app.post('/gesture', (req: Request, res: Response) => {
    handleGesture(req.body, { config, timeout });
    broadcast('gesture', req.body);

    // Log to cortex
    const action = (req.body as { action?: string })?.action;
    if (action) {
      cortex.opsAppend(`Gesture received: ${action}`, 'sigil').catch(() => {});
    }

    res.sendStatus(200);
  });

  // --- Command from dashboard UI ---
  app.post('/command', async (req: Request, res: Response) => {
    const result = await handleCommand(req.body, config);
    broadcast('command_result', result);

    // Log to cortex
    cortex.opsAppend(`Command: ${result.command} → ${result.ok ? 'ok' : 'fail'}`, 'sigil').catch(() => {});

    res.json(result);
  });

  // --- Publish (agent SDK sends messages through the bridge) ---
  app.post('/publish', async (req: Request, res: Response) => {
    const message = req.body as AgentMessage;
    if (!message?.type || !message?.message) {
      res.status(400).json({ error: 'Missing type or message' });
      return;
    }

    try {
      const messageId = await sigil.publish(config.sigil_topic, message);
      res.json({ ok: true, id: messageId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ ok: false, error: msg });
    }
  });

  // --- Status snapshot for dashboard ---
  app.get('/status', (_req: Request, res: Response) => {
    res.json({
      sessions: heartbeat.getSessions(),
      pending_approvals: timeout.getPending(),
      commands: config.commands,
    });
  });

  // --- Health check ---
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      sse_clients: sseClients.length,
      active_sessions: heartbeat.getSessions().length,
      pending_approvals: timeout.getPending().length,
    });
  });

  // Serve UI static files (production: ../ui/dist, dev: ../../ui/dist)
  const uiPaths = [
    resolve(__dirname, '..', '..', 'ui', 'dist'),     // dev: bridge/src -> bridge -> sigil/ui/dist
    resolve(__dirname, '..', 'ui', 'dist'),            // prod: bridge/dist -> bridge -> ui/dist (deployed flat)
    resolve(process.cwd(), 'ui'),                       // cwd-relative fallback
  ];
  const uiDir = uiPaths.find(p => existsSync(resolve(p, 'index.html')));
  if (uiDir) {
    app.use(express.static(uiDir));
    // SPA fallback — serve index.html for any unmatched GET
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(resolve(uiDir, 'index.html'));
    });
  }

  // Start monitors
  heartbeat.start();
  timeout.start();

  return app;
}
