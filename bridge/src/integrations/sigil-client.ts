import type { AgentMessage, BridgeConfig } from '../types.js';

/**
 * Publishes messages to the sigil server via HTTP API.
 */
export class SigilClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(config: BridgeConfig) {
    this.baseUrl = config.sigil_url;
    this.token = config.sigil_token;
  }

  /** Publish a message to a sigil topic. */
  async publish(topic: string, message: AgentMessage): Promise<void> {
    const url = `${this.baseUrl}/${topic}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

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

    // TODO: Map GestureActions to ntfy action format
    // if (message.actions) { ... }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: message.message,
    });

    if (!response.ok) {
      throw new Error(`Sigil publish failed: ${response.status} ${response.statusText}`);
    }
  }

  // TODO: SSE subscription for real-time message streaming
  // async subscribe(topic: string, callback: (message: AgentMessage) => void): Promise<void> { ... }
}
