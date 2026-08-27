[CmdletBinding()]
param(
  [string]$ProjectRef = 'tvixsmqxotuvyjqzmjla',
  [string]$WorkerDirectory = 'infra/doji-orchestrator'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$workerPath = Join-Path $repoRoot $WorkerDirectory
$tempSql = New-TemporaryFile

function Invoke-Checked {
  param([scriptblock]$Command, [string]$FailureMessage)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

try {
  $bytes = [byte[]]::new(48)
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $secret = [Convert]::ToBase64String($bytes)

  Push-Location $workerPath
  try {
    $secret | & '.\node_modules\.bin\wrangler.cmd' secret put ORCHESTRATOR_SECRET
    if ($LASTEXITCODE -ne 0) { throw 'Cloudflare secret update failed.' }
  } finally {
    Pop-Location
  }

  Invoke-Checked {
    npx.cmd supabase secrets set "DOJI_ORCHESTRATOR_SECRET=$secret" --project-ref $ProjectRef
  } 'Supabase Edge secret update failed.'

  $escaped = $secret.Replace("'", "''")
  Set-Content -LiteralPath $tempSql -Encoding utf8 -Value @"
select vault.update_secret(id, '$escaped')
from vault.secrets
where name = 'doji_orchestrator_secret';
"@
  Invoke-Checked {
    npx.cmd supabase db query --linked --file $tempSql
  } 'Postgres Vault secret update failed.'

  $direct = Invoke-RestMethod -Method Post `
    -Uri 'https://doji-orchestrator.faheygs.workers.dev/outbox/wake' `
    -Headers @{ Authorization = "Bearer $secret" } `
    -ContentType 'application/json' `
    -Body '{}'
  if ($null -eq $direct) { throw 'Direct Worker verification returned no response.' }

  Set-Content -LiteralPath $tempSql -Encoding utf8 -Value @"
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'doji_orchestrator_url') || '/outbox/wake',
  headers := jsonb_build_object(
    'content-type', 'application/json',
    'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'doji_orchestrator_secret')
  ),
  body := '{}'::jsonb
) as request_id;
"@
  $requestOutput = npx.cmd supabase db query --linked --output-format json --file $tempSql
  if ($LASTEXITCODE -ne 0) { throw 'Vault-backed wake request failed to enqueue.' }
  $requestResult = ($requestOutput -join "`n") | ConvertFrom-Json
  $requestId = [string]$requestResult.rows[0].request_id
  if (-not $requestId) { throw 'Could not read the Vault-backed wake request id.' }

  Start-Sleep -Seconds 2
  $responseOutput = npx.cmd supabase db query --linked --output-format json `
    "select status_code from net._http_response where id = $requestId;"
  $responseResult = ($responseOutput -join "`n") | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or [int]$responseResult.rows[0].status_code -ne 200) {
    throw "Vault-backed wake verification failed for request $requestId."
  }

  Write-Host 'Production orchestrator secret synchronized and both wake paths returned HTTP 200.'
} finally {
  $secret = $null
  $escaped = $null
  Remove-Item -LiteralPath $tempSql -Force -ErrorAction SilentlyContinue
}
