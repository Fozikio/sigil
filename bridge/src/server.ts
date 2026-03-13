import express from 'express';
import type { BridgeConfig } from './types.js';
import { handleWebhook } from './handlers/webhook.js';
import { handleGesture } from './handlers/gesture.js';
import { handleCommand } from './handlers/command.js';
import { HeartbeatMonitor } from './monitors/heartbeat.js';
import { CostMonitor } from './monitors/cost.js';
import { TimeoutManager } from './monitors/timeout.js';

export function createBridgeServer(config: BridgeConfig): express.Express {
  const app = express();
  app.use(express.json());

  // Initialize monitors
  const heartbeat = new HeartbeatMonitor(config);
  const cost = new CostMonitor(config);
  const timeout = new TimeoutManager(config);

  // Webhook from sigil server (called on every publish)
  app.post('/webhook', (req, res) => {
    handleWebhook(req.body, { config, heartbeat, cost, timeout });
    res.sendStatus(200);
  });

  // Gesture response from dashboard UI
  app.post('/gesture', (req, res) => {
    handleGesture(req.body, { config, timeout });
    res.sendStatus(200);
  });

  // Command from dashboard UI
  app.post('/command', async (req, res) => {
    const result = await handleCommand(req.body, config);
    res.json(result);
  });

  // Status endpoint for dashboard
  app.get('/status', (_req, res) => {
    res.json({
      sessions: heartbeat.getSessions(),
      pending_approvals: timeout.getPending(),
      config: {
        commands: config.commands,
      },
    });
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Start monitors
  heartbeat.start();
  timeout.start();

  return app;
}
