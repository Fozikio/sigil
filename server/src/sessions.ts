// Session tracker — monitors agent heartbeats, detects stale/dead sessions

import type { AgentSession } from './types.js';

const STALE_THRESHOLD_S = 300;  // 5 minutes without heartbeat = stale
const DEAD_THRESHOLD_S = 3600;  // 1 hour = dead, remove

export class SessionTracker {
  private sessions: Map<string, AgentSession> = new Map();
  private reaper: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.reaper = setInterval(() => this.reap(), 30_000);
  }

  stop(): void {
    if (this.reaper) clearInterval(this.reaper);
  }

  heartbeat(sessionId: string, data: Partial<AgentSession>): AgentSession {
    const now = Math.floor(Date.now() / 1000);
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        session_id: sessionId,
        project: data.project ?? '',
        status: 'active',
        last_heartbeat: now,
        tool_calls: 0,
        started_at: now,
      };
      this.sessions.set(sessionId, session);
    }

    session.last_heartbeat = now;
    session.status = data.status ?? 'active';
    if (data.tool_calls !== undefined) session.tool_calls = data.tool_calls;
    if (data.model) session.model = data.model;
    if (data.project) session.project = data.project;

    return session;
  }

  end(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getAll(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  private reap(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [id, session] of this.sessions) {
      const age = now - session.last_heartbeat;
      if (age > DEAD_THRESHOLD_S) {
        this.sessions.delete(id);
      } else if (age > STALE_THRESHOLD_S) {
        session.status = 'stale';
      }
    }
  }
}
