#!/usr/bin/env bash
# Deploy sigil-bridge to VPS
# Usage: bash deploy.sh

set -euo pipefail

VPS="idapixl@5.161.98.106"
REMOTE_DIR="/home/idapixl/sigil-bridge"
UI_DIR="/home/idapixl/sigil-bridge/ui"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UI_DIST="$SCRIPT_DIR/../ui/dist"

echo "=== Sigil Bridge Deploy ==="

# 1. Build bridge
echo "[1/5] Building bridge..."
cd "$SCRIPT_DIR"
npm run build

# 2. Build UI
echo "[2/5] Building UI..."
cd "$SCRIPT_DIR/../ui"
npm run build

# 3. Sync bridge to VPS
echo "[3/5] Syncing bridge..."
ssh "$VPS" "mkdir -p $REMOTE_DIR/dist $UI_DIR"
rsync -avz --delete "$SCRIPT_DIR/dist/" "$VPS:$REMOTE_DIR/dist/"
rsync -avz "$SCRIPT_DIR/package.json" "$SCRIPT_DIR/package-lock.json" "$VPS:$REMOTE_DIR/"
rsync -avz "$SCRIPT_DIR/config.example.yaml" "$VPS:$REMOTE_DIR/" 2>/dev/null || true

# 4. Sync UI build to VPS
echo "[4/5] Syncing UI..."
rsync -avz --delete "$UI_DIST/" "$VPS:$UI_DIR/"

# 5. Install deps + restart on VPS
echo "[5/5] Installing deps and restarting..."
ssh "$VPS" "cd $REMOTE_DIR && npm install --omit=dev && sudo systemctl restart sigil-bridge 2>/dev/null || echo 'systemd unit not yet installed — run install-service.sh first'"

echo "=== Deploy complete ==="
echo "Bridge: http://5.161.98.106:3848"
echo "Dashboard: http://5.161.98.106:3848 (serves UI)"
