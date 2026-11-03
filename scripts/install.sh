#!/usr/bin/env bash
# RenVer installer for Ubuntu 22.04+/Debian 12+.
# Usage: sudo bash scripts/install.sh [--check] [--yes] [--domain example.com]
#   --check   only run the preflight report, change nothing
#   --yes     install missing tools without asking
set -euo pipefail

CHECK_ONLY=0
ASSUME_YES=0
BASE_DOMAIN=""
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="/var/log/renver-install.log"
MIN_MEM_MB=1024
WARN_MEM_MB=2048
MIN_DISK_GB=5
FAILURES=0
MISSING=()

while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    --yes) ASSUME_YES=1 ;;
    --domain) BASE_DOMAIN="${2:-}"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

pass() { printf '[ OK ] %-16s %s\n' "$1" "$2"; }
warn() { printf '[WARN] %-16s %s\n' "$1" "$2"; }
miss() { printf '[MISS] %-16s %s\n' "$1" "$2"; MISSING+=("$3"); }
fail() { printf '[FAIL] %-16s %s\n' "$1" "$2"; FAILURES=$((FAILURES + 1)); }

echo
echo "RenVer preflight"
echo

# --- 1. detect + check (no changes made here) ---
if [ "$(uname -s)" != "Linux" ]; then
  fail "OS" "This script is for Linux. On Windows use scripts/install.ps1."
else
  . /etc/os-release
  major="${VERSION_ID%%.*}"
  if { [ "$ID" = "ubuntu" ] && [ "$major" -ge 22 ]; } || { [ "$ID" = "debian" ] && [ "$major" -ge 12 ]; }; then
    pass "OS" "$PRETTY_NAME"
  else
    fail "OS" "$PRETTY_NAME is unsupported (need Ubuntu 22.04+ or Debian 12+)"
  fi
fi

case "$(uname -m)" in
  x86_64|aarch64) pass "Architecture" "$(uname -m)" ;;
  *) fail "Architecture" "$(uname -m) is unsupported" ;;
esac

mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt "$MIN_MEM_MB" ]; then fail "Memory" "${mem_mb} MB (need ${MIN_MEM_MB}+)"
elif [ "$mem_mb" -lt "$WARN_MEM_MB" ]; then warn "Memory" "${mem_mb} MB (builds may fail; ${WARN_MEM_MB}+ recommended)"
else pass "Memory" "${mem_mb} MB"; fi

disk_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
if [ "$disk_gb" -lt "$MIN_DISK_GB" ]; then fail "Disk" "${disk_gb} GB free (need ${MIN_DISK_GB}+)"
else pass "Disk" "${disk_gb} GB free"; fi

if [ "$(id -u)" -eq 0 ]; then pass "Privileges" "root"
else fail "Privileges" "run with sudo"; fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  pass "Docker" "$(docker --version)"
else miss "Docker" "not installed" docker; fi

if command -v caddy >/dev/null 2>&1; then pass "Caddy" "$(caddy version | head -1)"
else miss "Caddy" "not installed" caddy; fi

if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; then
  pass "Node.js" "$(node -v)"
else miss "Node.js" "22+ not installed" node; fi

if command -v git >/dev/null 2>&1; then pass "Git" "$(git --version)"
else miss "Git" "not installed" git; fi

for port in 80 443; do
  if ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}$"; then
    warn "Port ${port}" "already in use (Caddy may fail to bind)"
  fi
done

echo
if [ "$FAILURES" -gt 0 ]; then echo "Result: blocked by $FAILURES failed check(s). Nothing was changed."; exit 1; fi
[ "${#MISSING[@]}" -gt 0 ] && echo "Will install: ${MISSING[*]}"
[ "$CHECK_ONLY" -eq 1 ] && { echo "Check only: nothing changed."; exit 0; }

# --- 2. confirm ---
if [ "${#MISSING[@]}" -gt 0 ] && [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Install the missing tools now? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

exec > >(tee -a "$LOG_FILE") 2>&1
export DEBIAN_FRONTEND=noninteractive

# --- 3. install (official sources only) ---
for tool in "${MISSING[@]:-}"; do
  case "$tool" in
    git) apt-get update -y && apt-get install -y git ;;
    docker) curl -fsSL https://get.docker.com | sh ;;
    caddy)
      apt-get update -y && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
      apt-get update -y && apt-get install -y caddy
      systemctl disable --now caddy || true # RenVer drives Caddy through its admin API
      ;;
    node)
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt-get install -y nodejs
      ;;
  esac
done

# --- 4. verify ---
docker run --rm hello-world >/dev/null && echo "Docker works."

# --- 5. configure ---
if [ -z "$BASE_DOMAIN" ]; then read -r -p "Base domain (e.g. example.com): " BASE_DOMAIN; fi
# One settings file for everything: .env in the project folder (the same one `npm run setup` writes).
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  ADMIN_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
  cat > "$ENV_FILE" <<EOF
RENVER_MODE=production
RENVER_BASE_DOMAIN=${BASE_DOMAIN}
RENVER_ADMIN_PASSWORD=${ADMIN_PASSWORD}
RENVER_DATA_DIR=/var/lib/renver
EOF
  chmod 600 "$ENV_FILE"
  echo "Generated admin password (also in $ENV_FILE): ${ADMIN_PASSWORD}"
fi
mkdir -p /var/lib/renver

cd "$APP_DIR"
npm ci
npm run build

cat > /etc/systemd/system/renver-caddy.service <<EOF
[Unit]
Description=RenVer Caddy proxy
After=network.target

[Service]
ExecStart=/usr/bin/caddy run --config /etc/renver-caddy.json --resume
Restart=always

[Install]
WantedBy=multi-user.target
EOF
echo '{"admin":{"listen":"127.0.0.1:2019"}}' > /etc/renver-caddy.json

cat > /etc/systemd/system/renver.service <<EOF
[Unit]
Description=RenVer panel
After=network.target docker.service renver-caddy.service
Wants=docker.service
StartLimitIntervalSec=0

[Service]
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v npm) start
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now renver-caddy renver

echo
echo "RenVer is running at http://$(hostname -I | awk '{print $1}'):3000"
echo "Next: add a DNS record  *.${BASE_DOMAIN}  ->  this server's IP, then open the panel."
