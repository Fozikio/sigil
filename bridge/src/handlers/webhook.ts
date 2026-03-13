import type { AgentMessage, BridgeConfig, HeartbeatMessage } from '../types.js';
import type { HeartbeatMonitor } from '../monitors/heartbeat.js';
import type { CostMonitor } from '../monitors/cost.js';
import type { TimeoutManager } from '../monitors/timeout.js';

export interface WebhookContext {
  config: BridgeConfig;
  heartbeat: HeartbeatMonitor;
  cost: CostMonitor;
  timeout: TimeoutManager;
}

/**
 * Handles webhook-on-publish from the sigil server.
 * Routes messages by type to the appropriate monitor/handler.
 */
export function handleWebhook(body: unknown, ctx: WebhookContext): void {
  const message = body as AgentMessage;
  if (!message || !message.type) {
    return;
  }

  switch (message.type) {
    case 'heartbeat': {
      const hb = message as unknown as HeartbeatMessage;
      ctx.heartbeat.update(hb);
      if (hb.cost_usd !== undefined && hb.session_id) {
        ctx.cost.update(hb.session_id, hb.cost_usd);
      }
      break;
    }

    case 'approval': {
      // TODO: Generate a unique message_id for tracking
      const messageId = `approval-${Date.now()}`;
      ctx.timeout.track(messageId, message);
      break;
    }

    default: {
      // TODO: Enrich and forward to dashboard via SSE or websocket
      break;
    }
  }
}
