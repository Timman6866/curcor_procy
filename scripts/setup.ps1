param(
  [switch]$Docker
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example — set CURSOR_API_KEY before starting."
}

if ($Docker) {
  if (-not (Select-String -Path ".env" -Pattern '^\s*CURSOR_API_KEY=\S+' -Quiet)) {
    Write-Error "Set CURSOR_API_KEY in .env before running Docker setup."
  }

  docker compose build
  docker compose up -d
  $port = "8787"
  if (Test-Path ".env") {
    $match = Select-String -Path ".env" -Pattern '^\s*PORT=(.+)$' | Select-Object -Last 1
    if ($match) { $port = $match.Matches[0].Groups[1].Value.Trim() }
  }
  Write-Host ""
  Write-Host "Proxy running at http://127.0.0.1:$port"
  Write-Host "Health: curl http://127.0.0.1:$port/health"
  Write-Host "Logs:   docker compose logs -f"
  exit 0
}

npm install
Write-Host ""
Write-Host "Local dev ready:"
Write-Host "  npm run dev"
Write-Host "  npm start"
