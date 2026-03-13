import type { CommandMessage, BridgeConfig } from '../types.js';

export interface CommandResult {
  ok: boolean;
  command: string;
  message: string;
}

/**
 * Parses and dispatches command button presses from the dashboard.
 */
export async function handleCommand(body: unknown, _config: BridgeConfig): Promise<CommandResult> {
  const cmd = body as CommandMessage;
  if (!cmd || cmd.type !== 'command' || !cmd.command) {
    return { ok: false, command: '', message: 'Invalid command message' };
  }

  switch (cmd.command) {
    case 'start': {
      // TODO: Trigger agent session start via configured runner
      // - Use ntfy to publish a start command to the agent's topic
      // - Or invoke the agent-runner directly via HTTP
      return { ok: true, command: cmd.command, message: `Start requested for ${cmd.project ?? 'default'}` };
    }

    case 'health': {
      // TODO: Run health check against configured endpoints
      // - Check sigil server, cortex API, VPS
      return { ok: true, command: cmd.command, message: 'Health check initiated' };
    }

    case 'pause_all': {
      // TODO: Publish pause signal to all active agent sessions
      return { ok: true, command: cmd.command, message: 'Pause signal sent to all sessions' };
    }

    default: {
      // TODO: Support custom commands via config
      return { ok: false, command: cmd.command, message: `Unknown command: ${cmd.command}` };
    }
  }
}
