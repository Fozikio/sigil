import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { BridgeConfig } from './types.js';

const DEFAULT_CONFIG: BridgeConfig = {
  sigil_url: 'https://ntfy.idapixl.com',
  bridge_port: 3848,
  sigil_topic: 'paco',
  heartbeat: {
    stale_threshold_seconds: 300,
    check_interval_seconds: 60,
  },
  cost_ceilings: {
    default_per_session_usd: 3.0,
    warning_threshold: 0.9,
  },
  health_checks: [
    { name: 'cortex', url: 'https://idapixl-cortex-215390428499.us-central1.run.app/health', interval_seconds: 60 },
    { name: 'webhook', url: 'http://localhost:3847/health', interval_seconds: 60 },
    { name: 'ntfy', url: 'https://ntfy.idapixl.com/v1/health', interval_seconds: 60 },
    { name: 'site', url: 'https://idapixl.com/api/health', interval_seconds: 120 },
  ],
  commands: [
    { label: 'Start PACO', command: 'start', project: 'paco', icon: '\u{1F680}' },
    { label: 'Start Cortex', command: 'start', project: 'cortex', icon: '\u{1F9E0}' },
    { label: 'Start Site', command: 'start', project: 'site', icon: '\u{1F310}' },
    { label: 'Health Check', command: 'health', icon: '\u{1F48A}' },
    { label: 'Pause All', command: 'pause_all', icon: '\u270B', confirm: true },
  ],
};

export async function loadConfig(): Promise<BridgeConfig> {
  const configPath = resolve(process.cwd(), 'config.yaml');

  let config = { ...DEFAULT_CONFIG };

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = parseYaml(raw) as Partial<BridgeConfig>;
    config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      heartbeat: { ...DEFAULT_CONFIG.heartbeat, ...parsed.heartbeat },
      cost_ceilings: { ...DEFAULT_CONFIG.cost_ceilings, ...parsed.cost_ceilings },
      health_checks: parsed.health_checks ?? DEFAULT_CONFIG.health_checks,
      commands: parsed.commands ?? DEFAULT_CONFIG.commands,
    };
  }

  // Override secrets from env
  if (process.env['SIGIL_TOKEN']) config.sigil_token = process.env['SIGIL_TOKEN'];
  if (process.env['CORTEX_API_URL']) config.cortex_url = process.env['CORTEX_API_URL'];
  if (process.env['CORTEX_API_TOKEN']) config.cortex_token = process.env['CORTEX_API_TOKEN'];

  return config;
}
