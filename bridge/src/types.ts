// --- Agent -> Sigil ---

export interface AgentMessage {
  type: 'info' | 'success' | 'warning' | 'error' | 'approval' | 'command_result' | 'heartbeat';
  message: string;
  title?: string;
  project?: string;
  session_id?: string;
  priority?: 'min' | 'low' | 'default' | 'high' | 'urgent';
  actions?: GestureAction[];
  timeout?: string;          // e.g., "30m", "1h"
  fallback?: string;         // action on timeout: "approve" | "reject" | "skip"
  response_topic?: string;
  tags?: string[];
  click?: string;
  metadata?: Record<string, unknown>;
}

export interface GestureAction {
  gesture: string;      // emoji: thumbs up, thumbs down, etc.
  label: string;        // display text
  action: string;       // signal value: "approve", "reject", "retry"
  style?: 'default' | 'danger' | 'success';
}

// --- Human -> Agent ---

export interface GestureResponse {
  type: 'gesture_response';
  action: string;
  original_message_id: string;
  timestamp: string;
  responder?: string;
}

// --- Heartbeat ---

export type BillingContext = 'subscription' | 'claude-api' | 'vertex-ai' | 'free' | 'unknown';

export interface HeartbeatMessage {
  type: 'heartbeat';
  session_id: string;
  project: string;
  status: 'active' | 'idle' | 'blocked' | 'completing';
  current_task?: string;
  tool_calls?: number;
  billing?: BillingContext;
  model?: string;
  uptime_seconds?: number;
}

// --- Commands ---

export interface CommandMessage {
  type: 'command';
  command: string;       // "start", "health", "pause_all", "custom"
  project?: string;
  args?: Record<string, unknown>;
}

// --- Bridge Config ---

export interface BridgeConfig {
  sigil_url: string;         // sigil server URL
  bridge_port: number;       // bridge HTTP port (default: 3848)
  sigil_topic: string;       // main agent topic
  sigil_token?: string;      // auth token
  cortex_url?: string;       // cortex API URL for integrations
  cortex_token?: string;     // cortex auth token

  heartbeat: {
    stale_threshold_seconds: number;  // default: 300 (5min)
    check_interval_seconds: number;   // default: 60
  };

  cost_ceilings: {
    default_per_session_usd: number;  // default: 3.0
    warning_threshold: number;         // default: 0.9 (90%)
  };

  health_checks: HealthCheckConfig[];

  commands: CommandButton[];
}

export interface CommandButton {
  label: string;
  command: string;
  project?: string;
  icon?: string;       // emoji
  confirm?: boolean;   // require confirmation before executing
}

// --- Service Health ---

export interface HealthCheckConfig {
  name: string;
  url: string;
  interval_seconds: number;
}

export type ServiceStatus = 'ok' | 'degraded' | 'down' | 'unknown';

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  response_ms: number;
  last_check: Date;
  error?: string;
  detail?: Record<string, unknown>;
}

export interface CronTimerStatus {
  name: 'cron';
  status: 'active' | 'idle' | 'disabled' | 'unknown';
  next_fire?: string;
  last_fired?: string;
}

// --- Internal State ---

export interface AgentSession {
  session_id: string;
  project: string;
  status: 'active' | 'idle' | 'blocked' | 'completing' | 'stale';
  last_heartbeat: Date;
  tool_calls: number;
  billing: BillingContext;
  model: string;
  started_at: Date;
}

export interface PendingApproval {
  message_id: string;
  message: AgentMessage;
  created_at: Date;
  timeout_at: Date | null;
  fallback_action: string | null;
  resolved: boolean;
}
