// Sigil — Agent Control Surface Types
// Framework-agnostic. Works with any agent that can POST JSON.

export interface SigilMessage {
  id: string;
  topic: string;
  time: number;       // unix seconds
  expires: number;    // unix seconds
  type: 'info' | 'success' | 'warning' | 'error' | 'approval' | 'heartbeat' | 'command_result';
  title?: string;
  message: string;
  priority?: 'min' | 'low' | 'default' | 'high' | 'urgent';
  project?: string;
  session_id?: string;
  actions?: SigilAction[];
  timeout?: string;    // "30m" — auto-resolve after this
  fallback?: string;   // "approve" | "reject" | "skip"
}

export interface SigilAction {
  gesture: string;     // emoji: 👍, 👎, 🔄, etc.
  label: string;       // "Approve", "Reject", etc.
  action: string;      // machine-readable: "approve", "reject"
}

export interface AgentSession {
  session_id: string;
  project: string;
  status: 'active' | 'idle' | 'blocked' | 'completing' | 'stale';
  last_heartbeat: number;
  tool_calls: number;
  model?: string;
  started_at: number;
}

export interface GestureRequest {
  action: string;
  message_id: string;
  responder?: string;
}

export interface CommandRequest {
  command: string;
  project?: string;
  prompt?: string;  // Custom prompt for agent sessions
  model?: string;   // Model override (opus, sonnet, etc.)
  target?: string;  // Where to run: 'vps', 'local', 'cloud'
}

export interface CommandButton {
  label: string;
  command: string;
  project?: string;
  icon?: string;
  confirm?: boolean;
}

export interface StatusResponse {
  sessions: AgentSession[];
  notifications: SigilMessage[];
  pending_approvals: SigilMessage[];
  commands: CommandButton[];
  registered_agents?: RegisteredAgent[];
}

// ─── Agent Registry ──────────────────────────────────────────────────────────

export interface RegisteredAgent {
  id: string;
  agent_id: string;
  name: string;
  cortex_url: string | null;
  namespace: string | null;
  capabilities: string[];
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  version: string | null;
  metadata: Record<string, unknown>;
  registered_at: number;
  last_seen: number;
}

export interface AgentRegistration {
  agent_id: string;
  name: string;
  cortex_url?: string;
  namespace?: string;
  capabilities?: string[];
  version?: string;
  metadata?: Record<string, unknown>;
}

export type SSEClient = {
  id: string;
  res: import('express').Response;
  topics: string[];
};
