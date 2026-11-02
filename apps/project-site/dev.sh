#!/usr/bin/env bash
# Runs the site locally against the production API over an SSH tunnel.
# Needs the `cabecao` SSH host. The web secret is fetched into memory, never written to disk.
# Safe to re-run: it replaces any earlier server/tunnel from this script.
set -euo pipefail
cd "$(dirname "$0")"
pkill -f "node dev-server.mjs" 2>/dev/null || true
pkill -f "ssh -fN.*8001:172.16.1.17:8000" 2>/dev/null || true
sleep 1
ssh -fN -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 8001:172.16.1.17:8000 cabecao
trap 'pkill -f "ssh -fN.*8001:172.16.1.17:8000" || true' EXIT
IGNIS_WEB_SECRET="$(ssh cabecao cat /opt/ignis/api/secrets/web-secret)" node dev-server.mjs
