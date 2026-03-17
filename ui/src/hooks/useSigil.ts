import { useEffect, useRef, useState, useCallback } from "react";

const BASE_URL = import.meta.env.VITE_SIGIL_URL ?? "";

// --- Types matching sigil server schema ---

export interface SigilMessage {
  id: string;
  topic: string;
  time: number;
  expires: number;
  type: "info" | "success" | "warning" | "error" | "approval" | "heartbeat" | "command_result";
  title?: string;
  message: string;
  priority?: "min" | "low" | "default" | "high" | "urgent";
  project?: string;
  session_id?: string;
  actions?: SigilAction[];
  timeout?: string;
  fallback?: string;
}

export interface SigilAction {
  gesture: string;
  label: string;
  action: string;
}

export interface AgentSession {
  session_id: string;
  project: string;
  status: "active" | "idle" | "blocked" | "completing" | "stale";
  last_heartbeat: number;
  tool_calls: number;
  model?: string;
  started_at: number;
}

export interface CommandButton {
  label: string;
  command: string;
  project?: string;
  icon?: string;
  confirm?: boolean;
}

export interface SigilState {
  connected: boolean;
  sessions: AgentSession[];
  notifications: SigilMessage[];
  pendingApprovals: SigilMessage[];
  commands: CommandButton[];
}

export function useSigil(): SigilState & {
  sendCommand: (command: string, project?: string) => Promise<void>;
  sendGesture: (messageId: string, action: string) => Promise<void>;
} {
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [notifications, setNotifications] = useState<SigilMessage[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<SigilMessage[]>([]);
  const [commands, setCommands] = useState<CommandButton[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const initializedRef = useRef(false);

  // Load initial state via REST
  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch(`${BASE_URL}/sigil/status`);
      const data = await r.json();
      setSessions(data.sessions ?? []);
      setNotifications(data.notifications ?? []);
      setPendingApprovals(data.pending_approvals ?? []);
      setCommands(data.commands ?? []);
      initializedRef.current = true;
    } catch {
      // Server not reachable
    }
  }, []);

  // SSE subscription for real-time updates
  useEffect(() => {
    loadStatus();

    const es = new EventSource(`${BASE_URL}/events`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as SigilMessage;
        // Filter out heartbeats from notification feed
        if (msg.type === "heartbeat") return;

        setNotifications((prev) => {
          // Deduplicate by ID
          if (prev.some((n) => n.id === msg.id)) return prev;
          return [msg, ...prev].slice(0, 200);
        });

        // Track pending approvals
        if (msg.type === "approval") {
          setPendingApprovals((prev) => [msg, ...prev]);
        }
      } catch {
        // Non-JSON SSE message (keepalive, connected event)
      }
    };

    es.addEventListener("connected", () => {
      setConnected(true);
    });

    es.onerror = () => {
      setConnected(false);
    };

    es.onopen = () => {
      setConnected(true);
      // Refresh status on reconnect
      if (initializedRef.current) loadStatus();
    };

    // Poll status every 15s for session updates
    const poll = setInterval(() => {
      loadStatus();
    }, 15_000);

    return () => {
      es.close();
      eventSourceRef.current = null;
      clearInterval(poll);
    };
  }, [loadStatus]);

  const sendCommand = useCallback(async (command: string, project?: string) => {
    await fetch(`${BASE_URL}/sigil/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, project }),
    });
  }, []);

  const sendGesture = useCallback(async (messageId: string, action: string) => {
    await fetch(`${BASE_URL}/sigil/gesture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        message_id: messageId,
        responder: "dashboard",
      }),
    });
    // Remove from pending approvals locally
    setPendingApprovals((prev) => prev.filter((p) => p.id !== messageId));
  }, []);

  return {
    connected,
    sessions,
    notifications,
    pendingApprovals,
    commands,
    sendCommand,
    sendGesture,
  };
}
