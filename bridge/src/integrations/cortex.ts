import type { BridgeConfig } from '../types.js';

/**
 * Calls cortex observe() and ops_append() for memory integration.
 */
export class CortexClient {
  private readonly url: string | undefined;
  private readonly token: string | undefined;

  constructor(config: BridgeConfig) {
    this.url = config.cortex_url;
    this.token = config.cortex_token;
  }

  /** Call cortex observe tool to record a noticed pattern or event. */
  async observe(text: string): Promise<void> {
    await this.callTool('observe', { text });
  }

  /** Call cortex ops_append to log an operational breadcrumb. */
  async opsAppend(text: string, project?: string): Promise<void> {
    const params: Record<string, string> = { text };
    if (project) params['project'] = project;
    await this.callTool('ops_append', params);
  }

  /** Generic cortex tool call. */
  private async callTool(tool: string, params: Record<string, string>): Promise<void> {
    if (!this.url || !this.token) {
      console.log(`[cortex] Skipping ${tool} — not configured`);
      return;
    }

    // TODO: Implement actual cortex API call
    // The cortex REST API accepts POST /tool/:name with JSON body
    const url = `${this.url}/tool/${tool}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cortex-token': this.token,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.error(`[cortex] ${tool} failed: ${response.status} ${response.statusText}`);
    }
  }
}
