#!/usr/bin/env bash
# One-time server setup for supertonic-tts.zahiralam.com on Ubuntu 24.04.
# Run as root.  Idempotent — safe to re-run.
set -euo pipefail

APP_DIR=/var/www/html/tts/supertonic-tts
DOMAIN=supertonic-tts.zahiralam.com

if [[ $EUID -ne 0 ]]; then echo "Run as root"; exit 1; fi

echo "==> Installing system packages"
apt-get update
apt-get install -y python3 python3-venv python3-pip git curl ca-certificates \
                   build-essential libsndfile1

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 20 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Creating $APP_DIR"
mkdir -p "$APP_DIR/.hf-cache"
chown -R www-data:www-data "$APP_DIR"

# www-data home is /var/www; supertonic caches models at ~/.cache/supertonic3
mkdir -p /var/www/.cache
chown www-data:www-data /var/www/.cache

echo "==> Enabling Apache modules"
a2enmod proxy proxy_http headers rewrite ssl >/dev/null

echo "==> Installing vhost"
install -m 644 "$(dirname "$0")/apache-vhost.conf" /etc/apache2/sites-available/supertonic-tts.conf
a2ensite supertonic-tts >/dev/null
apachectl configtest
systemctl reload apache2

echo "==> Installing systemd unit"
install -m 644 "$(dirname "$0")/supertonic-tts.service" /etc/systemd/system/supertonic-tts.service
systemctl daemon-reload

cat <<EOF

------------------------------------------------------------
Server bootstrap complete. Next steps:

  1) Copy the project to $APP_DIR (rsync from your Mac):
       rsync -avz --exclude='.supertonic-venv' --exclude='node_modules' \\
                  --exclude='frontend/dist' --exclude='*.wav' \\
                  ./ root@<server>:$APP_DIR/

  2) Build/install on the server:
       sudo $APP_DIR/deploy/deploy.sh

  3) Run certbot (only after DNS for $DOMAIN points here):
       certbot --apache -d $DOMAIN

  4) Start the API:
       systemctl enable --now supertonic-tts
       journalctl -u supertonic-tts -f      # watch logs

------------------------------------------------------------
EOF
