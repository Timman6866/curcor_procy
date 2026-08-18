param(
  [string]$BaseUrl = "http://127.0.0.1:8787"
)

$ErrorActionPreference = "Stop"

if (-not $env:CURSOR_API_KEY) {
  if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
      if ($_ -match '^\s*CURSOR_API_KEY=(.+)$') {
        $env:CURSOR_API_KEY = $matches[1].Trim()
      }
    }
  }
}

Write-Host "GET $BaseUrl/health"
$health = Invoke-RestMethod -Uri "$BaseUrl/health"
if (-not $health.ok) { throw "Health check failed" }

Write-Host "POST $BaseUrl/v1/chat/completions"
$body = @{
  model = "composer-2.5"
  messages = @(@{ role = "user"; content = "Reply with exactly: proxy-ok" })
} | ConvertTo-Json -Depth 5

$headers = @{
  Authorization = "Bearer $($env:CURSOR_API_KEY)"
  "Content-Type" = "application/json"
}

$response = Invoke-RestMethod -Uri "$BaseUrl/v1/chat/completions" -Method Post -Headers $headers -Body $body
Write-Host "Assistant:" $response.choices[0].message.content
Write-Host "Smoke test passed."
