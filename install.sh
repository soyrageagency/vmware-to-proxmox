#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# V2P — VMware to Proxmox Migration Toolkit — one-command installer (mac/Linux)
#
#   curl -fsSL https://raw.githubusercontent.com/soyrageagency/vmware-to-proxmox/main/install.sh | bash
#
# Clones, installs, builds, then drops you into the friendly menu.
#
# Crafted by SoyRage Agency — https://soyrage.es/
# Support: https://www.paypal.com/paypalme/soyrageagency
# ---------------------------------------------------------------------------
set -euo pipefail
REPO="https://github.com/soyrageagency/vmware-to-proxmox.git"
DIR="${V2P_DIR:-$HOME/vmware-to-proxmox}"

echo ""
echo "  V2P — VMware to Proxmox Migration Toolkit — by SoyRage Agency"
echo "     https://soyrage.es/"
echo ""
command -v git  >/dev/null 2>&1 || { echo "git is required."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js >= 18 is required (https://nodejs.org)."; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || { echo "Node.js >= 18 required."; exit 1; }

if [ -d "$DIR/.git" ]; then echo "-> Updating $DIR"; git -C "$DIR" pull --ff-only || true
else echo "-> Cloning into $DIR"; git clone --depth 1 "$REPO" "$DIR"; fi

cd "$DIR"
echo "-> Installing…"; npm install --silent
echo "-> Building…";   npm run build --silent
echo ""
echo "  Ready! Three ways to use it:"
echo "    node dist/index.js menu        # friendly menu (recommended)"
echo "    node dist/index.js web --demo  # click-through web UI"
echo "    node dist/index.js assess      # full assessment → PDF"
echo ""
# Launch the menu (attach the terminal so it works even via curl | bash).
if [ -e /dev/tty ]; then node dist/index.js menu < /dev/tty; else echo "Run: node dist/index.js menu"; fi
