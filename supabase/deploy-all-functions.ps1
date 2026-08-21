# Deploy all Edge Functions.
# Run from the DoIt directory:  pwsh -File supabase/deploy-all-functions.ps1
#
# Prerequisites:
#   npx supabase login
#   OR  $env:SUPABASE_ACCESS_TOKEN = "<dashboard access token>"
#   From DoIt: npx supabase link --project-ref <ref>  (once)

$ErrorActionPreference = "Stop"
$DoItRoot = Split-Path -Parent $PSScriptRoot
Set-Location $DoItRoot

Write-Host "Working directory: $DoItRoot" -ForegroundColor Gray

$check = npx --yes supabase@latest projects list 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host $check
  Write-Host "`nSupabase CLI is not logged in. Run: npx supabase login" -ForegroundColor Yellow
  Write-Host "Or set SUPABASE_ACCESS_TOKEN (Dashboard -> Account -> Access Tokens)." -ForegroundColor Yellow
  exit 1
}

$functions = @(
  "schedule-daily-challenge",
  "delete-account",
  "send-admin-email",
  "realtime-token",
  "relay-domain-events",
  "orchestrate-doji",
  "fanout-doji-push",
  "run-data-maintenance",
  "operational-health"
)

foreach ($fn in $functions) {
  Write-Host "Deploying $fn ..." -ForegroundColor Cyan
  npx --yes supabase@latest functions deploy $fn
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "`nDone. Verify in Dashboard -> Edge Functions (all names above)." -ForegroundColor Green
