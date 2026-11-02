#!/usr/bin/env bash
# Runs the site locally against the production API over an SSH tunnel.
# Needs the `cabecao` SSH host. The web secret is fetched into memory, never written to disk.
set -euo pipefail
cd "$(dirname "$0")"
ssh -fN -o ExitOnForwardFailure=yes -L 8001:172.16.1.17:8000 cabecao
trap 'pkill -f "ssh -fN.*8001:172.16.1.17:8000" || true' EXIT
IGNIS_WEB_SECRET="$(ssh cabecao cat /opt/ignis/api/secrets/web-secret)" node dev-server.mjs
