#!/usr/bin/env bash
# Build + install on the server.  Run after every code update.
set -euo pipefail

APP_DIR=/var/www/html/tts/supertonic-tts
VENV="$APP_DIR/.supertonic-venv"

if [[ $EUID -ne 0 ]]; then echo "Run as root"; exit 1; fi
if [[ ! -d "$APP_DIR/backend" ]]; then echo "$APP_DIR/backend not found — copy the project first"; exit 1; fi

echo "==> Python venv"
if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install -r "$APP_DIR/backend/requirements.txt"

echo "==> Frontend build"
cd "$APP_DIR/frontend"
npm ci
npm run build

echo "==> Permissions"
chown -R www-data:www-data "$APP_DIR"

echo "==> Restart API"
systemctl restart supertonic-tts || systemctl start supertonic-tts
sleep 2
systemctl --no-pager --full status supertonic-tts | head -15

echo
echo "==> Health check"
curl -s --max-time 60 http://127.0.0.1:8000/api/health || \
  echo "(API still loading the model — first start downloads ~400 MB; tail logs with: journalctl -u supertonic-tts -f)"
