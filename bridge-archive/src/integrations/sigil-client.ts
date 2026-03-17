import type { AgentMessage, BridgeConfig, GestureAction } from '../types.js';

/**
 * Publishes messages to the sigil (ntfy) server via HTTP API
 * and subscribes to topics via SSE for real-time streaming.
 */
export class SigilClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private abortControllers = new Map<string, AbortController>();

  constructor(config: BridgeConfig) {
    this.baseUrl = config.sigil_url;
    this.token = config.sigil_token;
  }

  /** Publish a message to a sigil topic. */
  async publish(topic: string, message: AgentMessage): Promise<string | null> {
    const url = `${this.baseUrl}/${topic}`;
    const headers: Record<string, string> = {};

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (message.title) {
      headers['Title'] = message.title;
    }

    if (message.priority) {
      headers['Priority'] = message.priority;
    }

    if (message.tags && message.tags.length > 0) {
      headers['Tags'] = message.tags.join(',');
    }

    if (message.click) {
      headers['Click'] = message.click;
    }

    // Map gesture actions to ntfy's action button format
    // Format: "action=ACTION_TYPE, LABEL, URL/INTENT, KEY=VALUE..."
    if (message.actions && message.actions.length > 0) {
      headers['Actions'] = message.actions
        .map((a) => formatNtfyAction(a, message.response_topic ?? topic))
        .join('; ');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: message.message,
    });

    if (!response.ok) {
      throw new Error(`Sigil publish failed: ${response.status} ${response.statusText}`);
    }

    // ntfy returns the message ID in the response
    const result = await response.json() as { id?: string };
    return result.id ?? null;
  }

  /**
   * Subscribe to a topic via SSE. Calls handler for each new message.
   * Returns a cleanup function to stop the subscription.
   */
  subscribe(
    topic: string,
    handler: (event: NtfyEvent) => void,
  ): () => void {
    const controller = new AbortController();
    this.abortControllers.set(topic, controller);

    const url = `${this.baseUrl}/${topic}/sse`;

    // Launch SSE connection (fire and forget, reconnects internally)
    this.connectSSE(url, handler, controller.signal).catch((err) => {
      console.error(`[sigil-client] SSE error for ${topic}:`, err);
    });

    return () => {
      controller.abort();
      this.abortControllers.delete(topic);
    };
  }

  /** Internal SSE connection with auto-reconnect. */
  private async connectSSE(
    url: string,
    handler: (event: NtfyEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    while (!signal.aborted) {
      try {
        const headers: Record<string, string> = {};
        if (this.token) {
          headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(url, { headers, signal });
        if (!response.ok || !response.body) {
          throw new Error(`SSE connect failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as NtfyEvent;
              if (event.event === 'message') {
                handler(event);
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err) {
        if (signal.aborted) return;
        console.error('[sigil-client] SSE disconnected, reconnecting in 5s...', err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  /** Disconnect all SSE subscriptions. */
  disconnectAll(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
  }
}

/** ntfy SSE event shape. */
export interface NtfyEvent {
  id: string;
  time: number;
  event: 'message' | 'open' | 'keepalive';
  topic: string;
  title?: string;
  message: string;
  priority?: number;
  tags?: string[];
  click?: string;
  actions?: NtfyAction[];
}

interface NtfyAction {
  action: string;
  label: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Convert a GestureAction to ntfy's action header format.
 * Uses HTTP action type — tapping the button POSTs to the bridge's /gesture endpoint.
 */
function formatNtfyAction(action: GestureAction, responseTopic: string): string {
  // ntfy HTTP action format: "http, LABEL, URL, method=POST, body=JSON"
  // The bridge receives the gesture response at its /gesture endpoint
  const body = JSON.stringify({
    type: 'gesture_response',
    action: action.action,
    timestamp: new Date().toISOString(),
  });

  return `http, ${action.gesture} ${action.label}, ${responseTopic}, method=POST, body=${body}`;
}
