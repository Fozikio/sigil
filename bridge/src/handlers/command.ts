import type { CommandMessage, BridgeConfig } from '../types.js';
import type { SigilClient } from '../integrations/sigil-client.js';
import type { CortexClient } from '../integrations/cortex.js';

/** Remote control ntfy topic — the PC listener subscribes to this. */
const RC_TOPIC = 'idapixl-rc-0836d616';

export interface CommandResult {
  ok: boolean;
  command: string;
  message: string;
}

export interface CommandContext {
  config: BridgeConfig;
  sigil: SigilClient;
  cortex: CortexClient;
}

/**
 * Parses and dispatches command button presses from the dashboard.
 */
export async function handleCommand(body: unknown, ctx: CommandContext): Promise<CommandResult> {
  const { config, sigil } = ctx;
  const cmd = body as CommandMessage;
  if (!cmd || cmd.type !== 'command' || !cmd.command) {
    return { ok: false, command: '', message: 'Invalid command message' };
  }

  switch (cmd.command) {
    case 'start': {
      const project = cmd.project ?? 'paco';

      try {
        // Publish to the remote control ntfy topic — the PC listener picks this up
        // and spawns a Claude Code session on the home machine
        await sigil.publish(RC_TOPIC, {
          type: 'info',
          message: `start ${project}`,
        });

        return { ok: true, command: cmd.command, message: `Start command sent for ${project}` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return { ok: false, command: cmd.command, message: `Start failed: ${msg}` };
      }
    }

    case 'health': {
      const results: string[] = ['Bridge: ok'];

      // Check cortex
      if (config.cortex_url && config.cortex_token) {
        try {
          const res = await fetch(`${config.cortex_url}/health`, {
            headers: { 'x-cortex-token': config.cortex_token },
            signal: AbortSignal.timeout(10000),
          });
          results.push(`Cortex: ${res.ok ? 'ok' : `${res.status}`}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'error';
          results.push(`Cortex: ${msg} (cold start?)`);
        }
      } else {
        results.push('Cortex: not configured');
      }

      // Check ntfy
      try {
        const res = await fetch(`${config.sigil_url}/v1/health`, {
          signal: AbortSignal.timeout(5000),
        });
        results.push(`ntfy: ${res.ok ? 'ok' : `${res.status}`}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        results.push(`ntfy: ${msg}`);
      }

      const summary = results.join(' | ');
      return { ok: true, command: cmd.command, message: summary };
    }

    case 'pause_all': {
      try {
        await sigil.publish(config.sigil_topic, {
          type: 'command_result',
          message: 'pause',
          title: 'Pause all sessions',
          tags: ['pause_button'],
          priority: 'high',
        });
        return { ok: true, command: cmd.command, message: 'Pause signal sent to all sessions' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return { ok: false, command: cmd.command, message: `Pause failed: ${msg}` };
      }
    }

    default: {
      return { ok: false, command: cmd.command, message: `Unknown command: ${cmd.command}` };
    }
  }
}
