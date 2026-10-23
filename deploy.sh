#!/usr/bin/env bash
# Deploy the static site in web/ to formwerk.cz (Websupport hosting) over FTP.
# Credentials live in ../.secrets/ftp.env (gitignored): FTP_HOST, FTP_USER, FTP_PASS, FTP_DIR.
# Usage: web/deploy.sh [--dry-run]
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ../.secrets/ftp.env; set +a

dry=""
[ "${1:-}" = "--dry-run" ] && dry="--dry-run"

# No --delete: files removed locally stay on the server until removed by hand,
# so hosting defaults (.htaccess etc.) are never wiped.
# Only the files the pages load: dev files (README, build/deploy scripts,
# tools/, screenshots/, blog.md) stay local.
lftp -u "$FTP_USER,$FTP_PASS" "$FTP_HOST" -e "
set ftp:ssl-allow yes
set ssl:verify-certificate no
set net:max-retries 2
set net:timeout 20
mirror --reverse --only-newer --verbose $dry \
  --exclude-glob README.md --exclude-glob build.sh --exclude-glob deploy.sh \
  --exclude-glob blog.md --exclude tools/ --exclude screenshots/ \
  . ${FTP_DIR:-/}
bye" 2>&1 | sed "s#$FTP_USER:[^@]*@#***@#g"
