import type { GestureResponse, BridgeConfig } from '../types.js';
import type { TimeoutManager } from '../monitors/timeout.js';

export interface GestureContext {
  config: BridgeConfig;
  timeout: TimeoutManager;
}

/**
 * Handles gesture responses from the dashboard UI.
 * Resolves pending approvals and publishes the response back to the agent's response_topic.
 */
export function handleGesture(body: unknown, ctx: GestureContext): void {
  const response = body as GestureResponse;
  if (!response || response.type !== 'gesture_response') {
    return;
  }

  // Resolve the pending approval
  ctx.timeout.resolve(response.original_message_id, response.action);

  // TODO: Publish response to agent's response_topic via SigilClient
  // The original message's response_topic tells us where to send the gesture back
  // const pending = ctx.timeout.getPending().find(p => p.message_id === response.original_message_id);
  // if (pending?.message.response_topic) {
  //   sigilClient.publish(pending.message.response_topic, { ... });
  // }
}
