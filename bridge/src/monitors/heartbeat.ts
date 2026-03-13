import type { AgentSession, BridgeConfig, HeartbeatMessage } from '../types.js';

/**
 * Tracks agent heartbeats and detects stale/stuck sessions.
 */
export class HeartbeatMonitor {
  private readonly sessions = new Map<string, AgentSession>();
  private readonly staleThresholdMs: number;
  private readonly checkIntervalMs: number;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(config: BridgeConfig) {
    this.staleThresholdMs = config.heartbeat.stale_threshold_seconds * 1000;
    this.checkIntervalMs = config.heartbeat.check_interval_seconds * 1000;
  }

  /** Update session state from a heartbeat message. */
  update(heartbeat: HeartbeatMessage): void {
    const existing = this.sessions.get(heartbeat.session_id);

    const session: AgentSession = {
      session_id: heartbeat.session_id,
      project: heartbeat.project,
      status: heartbeat.status,
      last_heartbeat: new Date(),
      tool_calls: heartbeat.tool_calls ?? existing?.tool_calls ?? 0,
      cost_usd: heartbeat.cost_usd ?? existing?.cost_usd ?? 0,
      started_at: existing?.started_at ?? new Date(),
    };

    this.sessions.set(heartbeat.session_id, session);
  }

  /** Returns all tracked sessions as an array. */
  getSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  /** Start periodic stale-session checking. */
  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      this.checkStale();
    }, this.checkIntervalMs);
  }

  /** Stop the periodic check. */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Flag sessions that haven't sent a heartbeat within the threshold. */
  private checkStale(): void {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      const elapsed = now - session.last_heartbeat.getTime();
      if (elapsed > this.staleThresholdMs && session.status !== 'stale') {
        session.status = 'stale';
        // TODO: Publish stale alert via SigilClient
        console.log(`[heartbeat] Session ${session.session_id} marked stale (${Math.floor(elapsed / 1000)}s since last heartbeat)`);
      }
    }
  }
}
