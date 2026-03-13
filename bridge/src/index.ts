import { loadConfig } from './config.js';
import { createBridgeServer } from './server.js';

async function main(): Promise<void> {
  const config = await loadConfig();
  const server = createBridgeServer(config);

  const port = config.bridge_port;
  server.listen(port, () => {
    console.log(`[sigil-bridge] listening on port ${port}`);
  });
}

main().catch((err: unknown) => {
  console.error('[sigil-bridge] Fatal error:', err);
  process.exit(1);
});
