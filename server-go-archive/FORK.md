---
date: 2026-03-17
type: system
status: active
---

# ntfy Fork — Sigil Server

**Upstream:** https://github.com/binwiederhier/ntfy
**Forked at commit:** `d9efe50` (2026-03-17, shallow clone)
**License:** Apache 2.0 (dual-licensed Apache 2.0 / GPLv2 upstream)

## What We Changed

- **Removed:** React web UI (`web/src/`, `web/public/`, `web/package.json`, `web/vite.config.js`)
  - Replaced by Sigil dashboard (separate React app in `../ui/`)
- **Removed:** `docker-compose.yml`, `docs/`, `examples/` (we have our own)
- **Kept:** Entire Go pub/sub engine, FCM/APNS push, auth, rate limiting, SQLite/Postgres storage

## Planned Additions

- Webhook-on-publish: server-side hook that POSTs to the bridge when an agent publishes
- Structured message types for agent signals
- Agent namespace routing

## Syncing with Upstream

To pull upstream changes:
```bash
cd /tmp && git clone https://github.com/binwiederhier/ntfy.git ntfy-upstream
# Compare and cherry-pick relevant changes
# Do NOT overwrite web/ — we intentionally stripped it
```
