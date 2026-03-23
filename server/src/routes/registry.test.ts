import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { AgentRegistry } from '../registry.js';
import { createRegistryRouter } from './registry.js';

function createTestApp(): express.Express {
  const db = new Database(':memory:');
  const registry = new AgentRegistry(db);

  const noopAuth: express.RequestHandler = (_req, _res, next) => next();

  const app = express();
  app.use(express.json());
  app.use(createRegistryRouter(registry, noopAuth, noopAuth));
  return app;
}

describe('Registry Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createTestApp();
  });

  it('POST /sigil/agents/register — 201 on new registration', async () => {
    const res = await request(app)
      .post('/sigil/agents/register')
      .send({ agent_id: 'a1', name: 'Agent One', capabilities: ['code'] });

    expect(res.status).toBe(201);
    expect(res.body.agent_id).toBe('a1');
    expect(res.body.name).toBe('Agent One');
    expect(res.body.status).toBe('online');
    expect(res.body.capabilities).toEqual(['code']);
  });

  it('POST /sigil/agents/register — 400 on missing required fields', async () => {
    const res = await request(app)
      .post('/sigil/agents/register')
      .send({ name: 'No ID' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('GET /sigil/agents — returns list', async () => {
    await request(app)
      .post('/sigil/agents/register')
      .send({ agent_id: 'a1', name: 'One' });
    await request(app)
      .post('/sigil/agents/register')
      .send({ agent_id: 'a2', name: 'Two' });

    const res = await request(app).get('/sigil/agents');
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(2);
    expect(res.body.count).toBe(2);
  });

  it('GET /sigil/agents?status=online — filters correctly', async () => {
    await request(app)
      .post('/sigil/agents/register')
      .send({ agent_id: 'a1', name: 'One' });
    await request(app)
      .post('/sigil/agents/register')
      .send({ agent_id: 'a2', name: 'Two' });
    await request(app).delete('/sigil/agents/a2');

    const res = await request(app).get('/sigil/agents?status=online');
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(1);
    expect(res.body.agents[0].agent_id).toBe('a1');
  });

  it('GET /sigil/agents/:agent_id — returns single agent', async () => {
    await request(app)
      .post('/sigil/agents/register')
      .send({ agent_id: 'a1', name: 'One' });

    const res = await request(app).get('/sigil/agents/a1');
    expect(res.status).toBe(200);
    expect(res.body.agent_id).toBe('a1');
    expect(res.body.name).toBe('One');
  });

  it('GET /sigil/agents/:agent_id — 404 for unknown', async () => {
    const res = await request(app).get('/sigil/agents/nonexistent');
    expect(res.status).toBe(404);
  });

  it('DELETE /sigil/agents/:agent_id — deregisters', async () => {
    await request(app)
      .post('/sigil/agents/register')
      .send({ agent_id: 'a1', name: 'One' });

    const res = await request(app).delete('/sigil/agents/a1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('offline');

    const check = await request(app).get('/sigil/agents/a1');
    expect(check.body.status).toBe('offline');
  });

  it('POST /sigil/agents/:agent_id/heartbeat — updates', async () => {
    await request(app)
      .post('/sigil/agents/register')
      .send({ agent_id: 'a1', name: 'One' });

    const res = await request(app).post('/sigil/agents/a1/heartbeat');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.last_seen).toBeGreaterThan(0);
  });
});
