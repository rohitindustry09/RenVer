# RenVer setup for Windows (development / testing mode only).
# Usage: powershell -ExecutionPolicy Bypass -File scripts\install.ps1 [-Check] [-Yes]
param([switch]$Check, [switch]$Yes)

$ErrorActionPreference = "Stop"
$failures = 0
$missing = @()

function Pass($name, $msg) { "{0,-7} {1,-16} {2}" -f "[ OK ]", $name, $msg }
function Warn($name, $msg) { "{0,-7} {1,-16} {2}" -f "[WARN]", $name, $msg }
function Miss($name, $msg, $id) { "{0,-7} {1,-16} {2}" -f "[MISS]", $name, $msg; $script:missing += $id }
function Fail($name, $msg) { "{0,-7} {1,-16} {2}" -f "[FAIL]", $name, $msg; $script:failures++ }

""
"RenVer preflight (Windows)"
""

$os = Get-CimInstance Win32_OperatingSystem
if ([Environment]::OSVersion.Version.Build -ge 19041) { Pass "OS" "$($os.Caption) (development mode only)" }
else { Fail "OS" "Windows 10 build 19041+ required for WSL2" }

$memMb = [int]($os.TotalVisibleMemorySize / 1024)
if ($memMb -lt 4096) { Warn "Memory" "$memMb MB (Docker Desktop works best with 4096+)" } else { Pass "Memory" "$memMb MB" }

$freeGb = [int]((Get-PSDrive -Name (Get-Location).Drive.Name).Free / 1GB)
if ($freeGb -lt 5) { Fail "Disk" "$freeGb GB free (need 5+)" } else { Pass "Disk" "$freeGb GB free" }

if (Get-Command docker -ErrorAction SilentlyContinue) {
  cmd /c "docker info >nul 2>nul"
  if ($LASTEXITCODE -eq 0) { Pass "Docker" "running" } else { Warn "Docker" "installed but not running - start Docker Desktop" }
} else { Miss "Docker" "Docker Desktop not installed" "Docker.DockerDesktop" }

if (Get-Command caddy -ErrorAction SilentlyContinue) { Pass "Caddy" "installed" } else { Miss "Caddy" "not installed" "CaddyServer.Caddy" }

if (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
  if ($nodeMajor -ge 22) { Pass "Node.js" "$(node -v)" } else { Miss "Node.js" "22+ required" "OpenJS.NodeJS" }
} else { Miss "Node.js" "not installed" "OpenJS.NodeJS" }

if (Get-Command git -ErrorAction SilentlyContinue) { Pass "Git" "installed" } else { Miss "Git" "not installed" "Git.Git" }

foreach ($port in 80, 443) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    Warn "Port $port" "in use (another web server may be running)"
  }
}

""
if ($failures -gt 0) { "Result: blocked by $failures failed check(s). Nothing was changed."; exit 1 }
if ($missing.Count -gt 0) { "Will install via winget: $($missing -join ', ')" }
if ($Check) { "Check only: nothing changed."; exit 0 }

if ($missing.Count -gt 0 -and -not $Yes) {
  $answer = Read-Host "Install the missing tools with winget? [y/N]"
  if ($answer -notmatch '^[Yy]$') { "Aborted."; exit 1 }
}

foreach ($id in $missing) {
  winget install --id $id -e --accept-package-agreements --accept-source-agreements
}

Set-Location (Join-Path $PSScriptRoot "..")
npm ci
""
"Done. Start Docker Desktop, then run:  npm run dev"
"Apps get addresses like  myapp.localhost  (no DNS setup needed)."
"Note: Shopify needs a public HTTPS URL, so use a VPS or a tunnel for live Shopify apps."
