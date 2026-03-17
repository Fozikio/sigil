#!/usr/bin/env bash
# Install sigil-bridge systemd service on VPS
# Run once: ssh root@5.161.98.106 'bash -s' < install-service.sh

set -euo pipefail

cat > /etc/systemd/system/sigil-bridge.service << 'UNIT'
[Unit]
Description=Sigil Bridge — Agent Control Surface
After=network-online.target ntfy.service
Wants=network-online.target

[Service]
Type=simple
User=idapixl
Group=idapixl
WorkingDirectory=/home/idapixl/sigil-bridge
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/etc/idapixl/env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/idapixl/sigil-bridge

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable sigil-bridge
systemctl start sigil-bridge

echo "sigil-bridge.service installed and started"
systemctl status sigil-bridge --no-pager
