param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).ProviderPath
node (Join-Path $PSScriptRoot 'sync-contracts.mjs') --check
if ($LASTEXITCODE -ne 0) { throw 'Public contract verification failed.' }
foreach ($taskApp in @('NAS\back', 'NAS\admin', 'Vercel')) {
  Push-Location (Join-Path $taskRoot $taskApp)
  try {
    if (-not $SkipInstall) { npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed: $taskApp" } }
    foreach ($taskCheck in @('lint', 'typecheck', 'test', 'build')) {
      npm.cmd run $taskCheck
      if ($LASTEXITCODE -ne 0) { throw "Verification failed: $taskApp / $taskCheck" }
    }
  } finally { Pop-Location }
}
