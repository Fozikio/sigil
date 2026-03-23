import { Router } from 'express';
import type { AgentRegistry } from '../registry.js';
import type { RequestHandler } from 'express';
import type { AgentRegistration } from '../types.js';

export function createRegistryRouter(
  registry: AgentRegistry,
  requireAuth: RequestHandler,
  requireDashboardAuth: RequestHandler,
): Router {
  const router = Router();

  // Register an agent
  router.post('/sigil/agents/register', requireAuth, (req, res) => {
    const body = req.body as Partial<AgentRegistration>;
    if (!body.agent_id || !body.name) {
      res.status(400).json({ error: 'agent_id and name are required' });
      return;
    }
    const agent = registry.register(body as AgentRegistration);
    res.status(201).json(agent);
  });

  // Deregister an agent (set offline)
  router.delete('/sigil/agents/:agent_id', requireAuth, (req, res) => {
    const ok = registry.deregister(req.params.agent_id as string);
    if (!ok) {
      res.status(404).json({ error: 'agent not found' });
      return;
    }
    res.json({ ok: true, status: 'offline' });
  });

  // List agents
  router.get('/sigil/agents', requireDashboardAuth, (req, res) => {
    const status = req.query.status as string | undefined;
    const capability = req.query.capability as string | undefined;
    const agents = registry.getAll({ status, capability });
    res.json({ agents, count: agents.length });
  });

  // Get single agent
  router.get('/sigil/agents/:agent_id', requireDashboardAuth, (req, res) => {
    const agent = registry.get(req.params.agent_id as string);
    if (!agent) {
      res.status(404).json({ error: 'agent not found' });
      return;
    }
    res.json(agent);
  });

  // Heartbeat
  router.post('/sigil/agents/:agent_id/heartbeat', requireAuth, (req, res) => {
    const ok = registry.heartbeat(req.params.agent_id as string);
    if (!ok) {
      res.status(404).json({ error: 'agent not found' });
      return;
    }
    const agent = registry.get(req.params.agent_id as string);
    res.json({ ok: true, last_seen: agent!.last_seen });
  });

  return router;
}
