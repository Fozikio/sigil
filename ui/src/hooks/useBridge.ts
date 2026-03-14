import { useEffect, useRef, useState, useCallback } from "react";

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL ?? "";

// --- Types matching bridge schema ---

export type BillingContext = "subscription" | "claude-api" | "vertex-ai" | "free" | "unknown";

export interface AgentSession {
  session_id: string;
  project: string;
  status: "active" | "idle" | "blocked" | "completing" | "stale";
  last_heartbeat: string;
  tool_calls: number;
  billing: BillingContext;
  model: string;
  started_at: string;
}

export interface PendingApproval {
  message_id: string;
  message: BridgeNotification;
  created_at: string;
  timeout_at: string | null;
  fallback_action: string | null;
  resolved: boolean;
}

export interface CommandButton {
  label: string;
  command: string;
  project?: string;
  icon?: string;
  confirm?: boolean;
}

export interface BridgeNotification {
  type: string;
  message: string;
  title?: string;
  project?: string;
  session_id?: string;
  priority?: string;
  actions?: { gesture: string; label: string; action: string }[];
  timeout?: string;
  fallback?: string;
  tags?: string[];
  enriched?: {
    project_label?: string;
    session_duration_seconds?: number;
    session_billing?: string;
    session_model?: string;
    session_tool_calls?: number;
  };
}

export type ServiceStatus = "ok" | "degraded" | "down" | "unknown";

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  response_ms: number;
  last_check: string;
  error?: string;
  detail?: Record<string, unknown>;
}

export interface CronTimerStatus {
  name: "cron";
  status: "active" | "idle" | "disabled" | "unknown";
  next_fire?: string;
  last_fired?: string;
}

export interface BridgeState {
  connected: boolean;
  sessions: AgentSession[];
  services: ServiceHealth[];
  cron: CronTimerStatus;
  notifications: BridgeNotification[];
  pendingApprovals: PendingApproval[];
  commands: CommandButton[];
}

// --- Hook ---

export function useBridge(): BridgeState & {
  sendCommand: (command: string, project?: string) => Promise<void>;
  sendGesture: (messageId: string, action: string) => Promise<void>;
} {
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [cron, setCron] = useState<CronTimerStatus>({ name: "cron", status: "unknown" });
  const [notifications, setNotifications] = useState<BridgeNotification[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [commands, setCommands] = useState<CommandButton[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`${BRIDGE_URL}/events`);
    eventSourceRef.current = es;

    es.addEventListener("init", (e) => {
      const data = JSON.parse(e.data);
      setSessions(data.sessions ?? []);
      setServices(data.services ?? []);
      if (data.cron) setCron(data.cron);
      setPendingApprovals(data.pending_approvals ?? []);
      setCommands(data.commands ?? []);
      setConnected(true);
    });

    es.addEventListener("notification", (e) => {
      const notif = JSON.parse(e.data) as BridgeNotification;
      setNotifications((prev) => [notif, ...prev].slice(0, 100));
    });

    es.addEventListener("sessions", (e) => {
      setSessions(JSON.parse(e.data));
    });

    es.addEventListener("services", (e) => {
      const data = JSON.parse(e.data);
      setServices(data.services ?? []);
      if (data.cron) setCron(data.cron);
    });

    es.addEventListener("command_result", (e) => {
      const result = JSON.parse(e.data);
      // Surface command results as notifications
      setNotifications((prev) =>
        [
          {
            type: result.ok ? "success" : "error",
            message: result.message,
            title: `Command: ${result.command}`,
          },
          ...prev,
        ].slice(0, 100),
      );
    });

    es.onerror = () => {
      setConnected(false);
    };

    es.onopen = () => {
      setConnected(true);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  // Fallback: load initial state via REST if SSE hasn't connected
  useEffect(() => {
    if (!connected) {
      fetch(`${BRIDGE_URL}/status`)
        .then((r) => r.json())
        .then((data) => {
          setSessions(data.sessions ?? []);
          setServices(data.services ?? []);
          if (data.cron) setCron(data.cron);
          setPendingApprovals(data.pending_approvals ?? []);
          setCommands(data.commands ?? []);
        })
        .catch(() => {});
    }
  }, [connected]);

  const sendCommand = useCallback(async (command: string, project?: string) => {
    await fetch(`${BRIDGE_URL}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "command", command, project }),
    });
  }, []);

  const sendGesture = useCallback(
    async (messageId: string, action: string) => {
      await fetch(`${BRIDGE_URL}/gesture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gesture_response",
          action,
          original_message_id: messageId,
          timestamp: new Date().toISOString(),
          responder: "dashboard",
        }),
      });
    },
    [],
  );

  return {
    connected,
    sessions,
    services,
    cron,
    notifications,
    pendingApprovals,
    commands,
    sendCommand,
    sendGesture,
  };
}
