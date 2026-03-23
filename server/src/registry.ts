import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { RegisteredAgent, AgentRegistration } from './types.js';

export class AgentRegistry {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        cortex_url TEXT,
        namespace TEXT,
        capabilities TEXT DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'unknown',
        version TEXT,
        metadata TEXT DEFAULT '{}',
        registered_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agents_agent_id ON agents(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    `);
  }

  register(reg: AgentRegistration): RegisteredAgent {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.get(reg.agent_id);

    if (existing) {
      this.db.prepare(`
        UPDATE agents
        SET name = ?, cortex_url = ?, namespace = ?, capabilities = ?,
            version = ?, metadata = ?, status = 'online', last_seen = ?
        WHERE agent_id = ?
      `).run(
        reg.name,
        reg.cortex_url ?? null,
        reg.namespace ?? null,
        JSON.stringify(reg.capabilities ?? []),
        reg.version ?? null,
        JSON.stringify(reg.metadata ?? {}),
        now,
        reg.agent_id,
      );
      return this.get(reg.agent_id)!;
    }

    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO agents (id, agent_id, name, cortex_url, namespace, capabilities, status, version, metadata, registered_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, 'online', ?, ?, ?, ?)
    `).run(
      id,
      reg.agent_id,
      reg.name,
      reg.cortex_url ?? null,
      reg.namespace ?? null,
      JSON.stringify(reg.capabilities ?? []),
      reg.version ?? null,
      JSON.stringify(reg.metadata ?? {}),
      now,
      now,
    );
    return this.get(reg.agent_id)!;
  }

  deregister(agentId: string): boolean {
    const result = this.db.prepare(
      `UPDATE agents SET status = 'offline' WHERE agent_id = ?`,
    ).run(agentId);
    return result.changes > 0;
  }

  remove(agentId: string): boolean {
    const result = this.db.prepare(
      `DELETE FROM agents WHERE agent_id = ?`,
    ).run(agentId);
    return result.changes > 0;
  }

  get(agentId: string): RegisteredAgent | null {
    const row = this.db.prepare(
      `SELECT * FROM agents WHERE agent_id = ?`,
    ).get(agentId) as Record<string, unknown> | undefined;
    return row ? this.rowToAgent(row) : null;
  }

  getAll(opts?: { status?: string; capability?: string }): RegisteredAgent[] {
    let sql = 'SELECT * FROM agents';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts?.status) {
      conditions.push('status = ?');
      params.push(opts.status);
    }
    if (opts?.capability) {
      conditions.push('capabilities LIKE ?');
      params.push(`%"${opts.capability}"%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY last_seen DESC';

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToAgent(row));
  }

  heartbeat(agentId: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db.prepare(
      `UPDATE agents SET last_seen = ?, status = 'online' WHERE agent_id = ?`,
    ).run(now, agentId);
    return result.changes > 0;
  }

  reap(staleSeconds = 300, deadSeconds = 3600): { staled: number; removed: number } {
    const now = Math.floor(Date.now() / 1000);

    const staled = this.db.prepare(
      `UPDATE agents SET status = 'degraded' WHERE last_seen < ? AND status = 'online'`,
    ).run(now - staleSeconds);

    const removed = this.db.prepare(
      `UPDATE agents SET status = 'offline' WHERE last_seen < ? AND status IN ('online', 'degraded')`,
    ).run(now - deadSeconds);

    return { staled: staled.changes, removed: removed.changes };
  }

  private rowToAgent(row: Record<string, unknown>): RegisteredAgent {
    return {
      id: row.id as string,
      agent_id: row.agent_id as string,
      name: row.name as string,
      cortex_url: (row.cortex_url as string) ?? null,
      namespace: (row.namespace as string) ?? null,
      capabilities: row.capabilities ? JSON.parse(row.capabilities as string) : [],
      status: row.status as RegisteredAgent['status'],
      version: (row.version as string) ?? null,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
      registered_at: row.registered_at as number,
      last_seen: row.last_seen as number,
    };
  }
}
