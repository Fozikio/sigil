import type { AgentMessage, BridgeConfig, PendingApproval } from '../types.js';

/**
 * Manages pending approval timeouts and fallback actions.
 */
export class TimeoutManager {
  private readonly pending = new Map<string, PendingApproval>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  constructor(_config: BridgeConfig) {
    // Config reserved for future extensions (e.g., default timeout override)
  }

  /** Start tracking a pending approval. */
  track(messageId: string, message: AgentMessage): void {
    const timeoutAt = message.timeout ? this.parseTimeout(message.timeout) : null;

    this.pending.set(messageId, {
      message_id: messageId,
      message,
      created_at: new Date(),
      timeout_at: timeoutAt,
      fallback_action: message.fallback ?? null,
      resolved: false,
    });
  }

  /** Resolve a pending approval with the given action. */
  resolve(messageId: string, _action: string): void {
    const approval = this.pending.get(messageId);
    if (approval) {
      approval.resolved = true;
      // TODO: Dispatch the resolved action back to the agent
    }
  }

  /** Returns all unresolved pending approvals. */
  getPending(): PendingApproval[] {
    return Array.from(this.pending.values()).filter((p) => !p.resolved);
  }

  /** Start periodic timeout checking. */
  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      this.checkTimeouts();
    }, 10_000); // Check every 10 seconds
  }

  /** Stop the periodic check. */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Check for timed-out approvals and apply fallback actions. */
  private checkTimeouts(): void {
    const now = Date.now();
    for (const approval of this.pending.values()) {
      if (approval.resolved) continue;
      if (!approval.timeout_at) continue;

      if (now >= approval.timeout_at.getTime()) {
        approval.resolved = true;
        if (approval.fallback_action) {
          // TODO: Dispatch fallback action via SigilClient
          console.log(`[timeout] Approval ${approval.message_id} timed out, applying fallback: ${approval.fallback_action}`);
        }
      }
    }
  }

  /** Parse a timeout string like "30m" or "1h" into a future Date. */
  private parseTimeout(timeout: string): Date {
    const match = timeout.match(/^(\d+)(s|m|h)$/);
    if (!match) {
      // Default to 30 minutes if unparseable
      return new Date(Date.now() + 30 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };
    return new Date(Date.now() + value * (multipliers[unit] ?? 60_000));
  }
}
