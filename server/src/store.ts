// SQLite message persistence
// Messages persist across restarts. Dashboard loads history on connect.

import Database from 'better-sqlite3';
import type { SigilMessage } from './types.js';

export function createSigilDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

export class MessageStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        time INTEGER NOT NULL,
        expires INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT,
        message TEXT NOT NULL,
        priority TEXT DEFAULT 'default',
        project TEXT,
        session_id TEXT,
        actions TEXT,
        timeout TEXT,
        fallback TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic);
      CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(time DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages(expires);
    `);
  }

  add(msg: SigilMessage): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, topic, time, expires, type, title, message, priority, project, session_id, actions, timeout, fallback)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id, msg.topic, msg.time, msg.expires, msg.type,
      msg.title ?? null, msg.message, msg.priority ?? 'default',
      msg.project ?? null, msg.session_id ?? null,
      msg.actions ? JSON.stringify(msg.actions) : null,
      msg.timeout ?? null, msg.fallback ?? null
    );
  }

  get(id: string): SigilMessage | null {
    const row = this.db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToMessage(row) : null;
  }

  getByTopic(topic: string, limit = 50): SigilMessage[] {
    const rows = this.db.prepare(`
      SELECT * FROM messages WHERE topic = ? AND expires > ? ORDER BY time DESC LIMIT ?
    `).all(topic, Math.floor(Date.now() / 1000), limit) as Record<string, unknown>[];
    return rows.map(this.rowToMessage);
  }

  getRecent(limit = 100): SigilMessage[] {
    const rows = this.db.prepare(`
      SELECT * FROM messages WHERE expires > ? ORDER BY time DESC LIMIT ?
    `).all(Math.floor(Date.now() / 1000), limit) as Record<string, unknown>[];
    return rows.map(this.rowToMessage);
  }

  getPendingApprovals(): SigilMessage[] {
    const rows = this.db.prepare(`
      SELECT * FROM messages WHERE type = 'approval' AND expires > ? ORDER BY time DESC
    `).all(Math.floor(Date.now() / 1000)) as Record<string, unknown>[];
    return rows.map(this.rowToMessage);
  }

  resolve(messageId: string): void {
    this.db.prepare(`UPDATE messages SET expires = ? WHERE id = ?`)
      .run(Math.floor(Date.now() / 1000) - 1, messageId);
  }

  prune(): number {
    const result = this.db.prepare(`DELETE FROM messages WHERE expires < ?`)
      .run(Math.floor(Date.now() / 1000));
    return result.changes;
  }

  pruneAll(): number {
    const result = this.db.prepare(`UPDATE messages SET expires = ? WHERE expires > ?`)
      .run(Math.floor(Date.now() / 1000) - 1, Math.floor(Date.now() / 1000));
    return result.changes;
  }

  close(): void {
    this.db.close();
  }

  private rowToMessage(row: Record<string, unknown>): SigilMessage {
    return {
      id: row.id as string,
      topic: row.topic as string,
      time: row.time as number,
      expires: row.expires as number,
      type: row.type as SigilMessage['type'],
      title: (row.title as string) || undefined,
      message: row.message as string,
      priority: (row.priority as SigilMessage['priority']) || undefined,
      project: (row.project as string) || undefined,
      session_id: (row.session_id as string) || undefined,
      actions: row.actions ? JSON.parse(row.actions as string) : undefined,
      timeout: (row.timeout as string) || undefined,
      fallback: (row.fallback as string) || undefined,
    };
  }
}
