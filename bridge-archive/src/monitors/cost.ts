import type { BridgeConfig } from '../types.js';

export interface CostCheckResult {
  ok: boolean;
  warning: boolean;
  exceeded: boolean;
  current_usd: number;
  ceiling_usd: number;
}

/**
 * Tracks per-session spend and enforces cost ceilings.
 */
export class CostMonitor {
  private readonly costs = new Map<string, number>();
  private readonly ceilingUsd: number;
  private readonly warningThreshold: number;

  constructor(config: BridgeConfig) {
    this.ceilingUsd = config.cost_ceilings.default_per_session_usd;
    this.warningThreshold = config.cost_ceilings.warning_threshold;
  }

  /** Update the cost for a session. */
  update(sessionId: string, costUsd: number): void {
    this.costs.set(sessionId, costUsd);
  }

  /** Check whether a session is within budget. */
  check(sessionId: string): CostCheckResult {
    const current = this.costs.get(sessionId) ?? 0;
    const ratio = current / this.ceilingUsd;

    return {
      ok: ratio < this.warningThreshold,
      warning: ratio >= this.warningThreshold && ratio < 1.0,
      exceeded: ratio >= 1.0,
      current_usd: current,
      ceiling_usd: this.ceilingUsd,
    };
  }
}
