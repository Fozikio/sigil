import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { BridgeConfig, HealthCheckConfig, ServiceHealth, CronTimerStatus } from '../types.js';

const execAsync = promisify(exec);

/**
 * Polls service health endpoints and tracks status.
 * Also checks the systemd cron timer for next-fire time.
 */
export class HealthMonitor {
  private readonly checks: HealthCheckConfig[];
  private readonly services = new Map<string, ServiceHealth>();
  private cronTimer: CronTimerStatus = { name: 'cron', status: 'unknown' };
  private intervals: ReturnType<typeof setInterval>[] = [];
  private onChange?: () => void;

  constructor(config: BridgeConfig, onChange?: () => void) {
    this.checks = config.health_checks;
    this.onChange = onChange;
  }

  /** Start all health check loops. Runs an initial check immediately. */
  start(): void {
    // Initial checks
    for (const check of this.checks) {
      this.checkService(check);
    }
    this.checkCronTimer();

    // Periodic checks
    for (const check of this.checks) {
      const handle = setInterval(
        () => this.checkService(check),
        check.interval_seconds * 1000,
      );
      this.intervals.push(handle);
    }

    // Cron timer check every 60s
    const cronHandle = setInterval(() => this.checkCronTimer(), 60_000);
    this.intervals.push(cronHandle);
  }

  stop(): void {
    for (const handle of this.intervals) {
      clearInterval(handle);
    }
    this.intervals = [];
  }

  getServices(): ServiceHealth[] {
    return Array.from(this.services.values());
  }

  getCronTimer(): CronTimerStatus {
    return this.cronTimer;
  }

  private async checkService(check: HealthCheckConfig): Promise<void> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(check.url, { signal: controller.signal });
      clearTimeout(timeout);

      const elapsed = Date.now() - start;
      let detail: Record<string, unknown> | undefined;

      try {
        detail = (await res.json()) as Record<string, unknown>;
      } catch {
        // Not JSON — that's fine for simple health endpoints
      }

      this.services.set(check.name, {
        name: check.name,
        status: res.ok ? 'ok' : 'degraded',
        response_ms: elapsed,
        last_check: new Date(),
        detail,
      });
    } catch (err) {
      this.services.set(check.name, {
        name: check.name,
        status: 'down',
        response_ms: Date.now() - start,
        last_check: new Date(),
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    this.onChange?.();
  }

  private async checkCronTimer(): Promise<void> {
    try {
      const { stdout } = await execAsync(
        'systemctl show idapixl-cron.timer --property=NextElapseUSecRealtime,LastTriggerUSec,ActiveState --no-pager',
        { timeout: 5000 },
      );

      const props = Object.fromEntries(
        stdout.trim().split('\n').map((line) => {
          const eq = line.indexOf('=');
          return [line.slice(0, eq), line.slice(eq + 1)];
        }),
      );

      const activeState = props['ActiveState'] ?? '';
      const nextRaw = props['NextElapseUSecRealtime'] ?? '';
      const lastRaw = props['LastTriggerUSec'] ?? '';

      let status: CronTimerStatus['status'] = 'idle';
      if (activeState === 'active') status = 'active';
      else if (activeState === 'inactive') status = 'disabled';

      this.cronTimer = {
        name: 'cron',
        status,
        next_fire: nextRaw || undefined,
        last_fired: lastRaw || undefined,
      };
    } catch {
      // Not on the VPS or systemd not available — that's fine
      this.cronTimer = { name: 'cron', status: 'unknown' };
    }

    this.onChange?.();
  }
}
