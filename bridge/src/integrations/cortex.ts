import type { BridgeConfig } from '../types.js';

/**
 * Calls cortex REST API for memory integration.
 */
export class CortexClient {
  private readonly url: string | undefined;
  private readonly token: string | undefined;

  constructor(config: BridgeConfig) {
    this.url = config.cortex_url;
    this.token = config.cortex_token;
  }

  /** Check cortex health. Returns true if healthy. */
  async healthCheck(): Promise<boolean> {
    if (!this.url) return false;
    try {
      const headers: Record<string, string> = {};
      if (this.token) headers['x-cortex-token'] = this.token;
      const res = await fetch(`${this.url}/health`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Log an operational breadcrumb via cortex ops API. */
  async opsAppend(content: string, project?: string): Promise<void> {
    const body: Record<string, string> = { content, type: 'log' };
    if (project) body['project'] = project;
    await this.post('/api/v2/ops', body);
  }

  /** Record an observation via cortex observe API. */
  async observe(text: string): Promise<void> {
    await this.post('/api/v2/observe', { text });
  }

  /** Generic POST to cortex REST API. */
  private async post(path: string, body: Record<string, string>): Promise<void> {
    if (!this.url || !this.token) {
      return;
    }

    try {
      const response = await fetch(`${this.url}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cortex-token': this.token,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.error(`[cortex] POST ${path} failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error(`[cortex] POST ${path} error:`, err instanceof Error ? err.message : err);
    }
  }
}
