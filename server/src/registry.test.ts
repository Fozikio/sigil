import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AgentRegistry } from './registry.js';

function freshRegistry(): AgentRegistry {
  const db = new Database(':memory:');
  return new AgentRegistry(db);
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = freshRegistry();
  });

  it('register() creates new agent with correct fields', () => {
    const agent = registry.register({
      agent_id: 'agent-1',
      name: 'Test Agent',
      cortex_url: 'http://localhost:3000',
      namespace: 'test',
      capabilities: ['code', 'chat'],
      version: '1.0.0',
      metadata: { env: 'dev' },
    });

    expect(agent.agent_id).toBe('agent-1');
    expect(agent.name).toBe('Test Agent');
    expect(agent.cortex_url).toBe('http://localhost:3000');
    expect(agent.namespace).toBe('test');
    expect(agent.capabilities).toEqual(['code', 'chat']);
    expect(agent.status).toBe('online');
    expect(agent.version).toBe('1.0.0');
    expect(agent.metadata).toEqual({ env: 'dev' });
    expect(agent.id).toBeTruthy();
    expect(agent.registered_at).toBeGreaterThan(0);
    expect(agent.last_seen).toBeGreaterThan(0);
  });

  it('register() upserts on same agent_id', () => {
    registry.register({ agent_id: 'agent-1', name: 'V1' });
    const updated = registry.register({ agent_id: 'agent-1', name: 'V2' });

    expect(updated.name).toBe('V2');
    expect(updated.status).toBe('online');

    const all = registry.getAll();
    expect(all).toHaveLength(1);
  });

  it('deregister() sets status to offline', () => {
    registry.register({ agent_id: 'agent-1', name: 'Test' });
    const ok = registry.deregister('agent-1');
    expect(ok).toBe(true);

    const agent = registry.get('agent-1');
    expect(agent?.status).toBe('offline');
  });

  it('remove() hard deletes', () => {
    registry.register({ agent_id: 'agent-1', name: 'Test' });
    const ok = registry.remove('agent-1');
    expect(ok).toBe(true);
    expect(registry.get('agent-1')).toBeNull();
  });

  it('get() returns null for unknown agent_id', () => {
    expect(registry.get('nonexistent')).toBeNull();
  });

  it('getAll() with status filter', () => {
    registry.register({ agent_id: 'a1', name: 'One' });
    registry.register({ agent_id: 'a2', name: 'Two' });
    registry.deregister('a2');

    const online = registry.getAll({ status: 'online' });
    expect(online).toHaveLength(1);
    expect(online[0].agent_id).toBe('a1');

    const offline = registry.getAll({ status: 'offline' });
    expect(offline).toHaveLength(1);
    expect(offline[0].agent_id).toBe('a2');
  });

  it('getAll() with capability filter', () => {
    registry.register({ agent_id: 'a1', name: 'One', capabilities: ['code', 'chat'] });
    registry.register({ agent_id: 'a2', name: 'Two', capabilities: ['deploy'] });

    const coders = registry.getAll({ capability: 'code' });
    expect(coders).toHaveLength(1);
    expect(coders[0].agent_id).toBe('a1');
  });

  it('heartbeat() updates last_seen', () => {
    registry.register({ agent_id: 'agent-1', name: 'Test' });
    const before = registry.get('agent-1')!.last_seen;

    // Heartbeat should succeed
    const ok = registry.heartbeat('agent-1');
    expect(ok).toBe(true);

    const after = registry.get('agent-1')!.last_seen;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('heartbeat() flips offline to online', () => {
    registry.register({ agent_id: 'agent-1', name: 'Test' });
    registry.deregister('agent-1');
    expect(registry.get('agent-1')!.status).toBe('offline');

    registry.heartbeat('agent-1');
    expect(registry.get('agent-1')!.status).toBe('online');
  });

  it('reap() marks stale agents as degraded', () => {
    const db = new Database(':memory:');
    const reg = new AgentRegistry(db);
    reg.register({ agent_id: 'agent-1', name: 'Stale' });

    // Manually set last_seen to 10 minutes ago
    const tenMinAgo = Math.floor(Date.now() / 1000) - 600;
    db.prepare('UPDATE agents SET last_seen = ? WHERE agent_id = ?').run(tenMinAgo, 'agent-1');

    const result = reg.reap(300, 3600);
    expect(result.staled).toBe(1);
    expect(reg.get('agent-1')!.status).toBe('degraded');
  });

  it('reap() marks dead agents as offline', () => {
    const db = new Database(':memory:');
    const reg = new AgentRegistry(db);
    reg.register({ agent_id: 'agent-1', name: 'Dead' });

    // Manually set last_seen to 2 hours ago
    const twoHoursAgo = Math.floor(Date.now() / 1000) - 7200;
    db.prepare('UPDATE agents SET last_seen = ? WHERE agent_id = ?').run(twoHoursAgo, 'agent-1');

    const result = reg.reap(300, 3600);
    expect(result.removed).toBe(1);
    expect(reg.get('agent-1')!.status).toBe('offline');
  });
});
