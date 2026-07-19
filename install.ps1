# ---------------------------------------------------------------------------
# V2P - VMware to Proxmox Migration Toolkit - one-command installer (Windows)
#
#   irm https://raw.githubusercontent.com/soyrageagency/vmware-to-proxmox/main/install.ps1 | iex
#
# Clones, installs, builds, then drops you into the friendly menu.
#
# Crafted by SoyRage Agency - https://soyrage.es/
# Support: https://www.paypal.com/paypalme/soyrageagency
# ---------------------------------------------------------------------------
$ErrorActionPreference = "Stop"
$Repo = "https://github.com/soyrageagency/vmware-to-proxmox.git"
$Dir  = if ($env:V2P_DIR) { $env:V2P_DIR } else { Join-Path $HOME "vmware-to-proxmox" }

Write-Host ""
Write-Host "  V2P - VMware to Proxmox Migration Toolkit - by SoyRage Agency" -ForegroundColor Cyan
Write-Host "     https://soyrage.es/" -ForegroundColor DarkGray
Write-Host ""
if (-not (Get-Command git  -ErrorAction SilentlyContinue)) { throw "git is required (https://git-scm.com)." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js >= 18 is required (https://nodejs.org)." }
if ([int](node -p "process.versions.node.split('.')[0]") -lt 18) { throw "Node.js >= 18 required." }

if (Test-Path (Join-Path $Dir ".git")) { Write-Host "-> Updating $Dir"; git -C $Dir pull --ff-only }
else { Write-Host "-> Cloning into $Dir"; git clone --depth 1 $Repo $Dir }

Set-Location $Dir
Write-Host "-> Installing..."; npm install
Write-Host "-> Building...";   npm run build
Write-Host ""
Write-Host "  Ready! Three ways to use it:" -ForegroundColor Green
Write-Host "    node dist/index.js menu        # friendly menu (recommended)"
Write-Host "    node dist/index.js web --demo  # click-through web UI"
Write-Host "    node dist/index.js assess      # full assessment -> PDF"
Write-Host ""
node dist/index.js menu
