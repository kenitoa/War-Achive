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
Push-Location (Join-Path $taskRoot 'NAS\gateway')
try {
  foreach ($taskCheck in @('lint', 'test')) {
    npm.cmd run $taskCheck
    if ($LASTEXITCODE -ne 0) { throw "Verification failed: NAS\gateway / $taskCheck" }
  }
} finally { Pop-Location }
$taskDeploymentTests = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'NAS\deployment\test') -Filter '*.test.mjs' -File | ForEach-Object { $_.FullName })
if ($taskDeploymentTests.Count -eq 0) { throw 'Deployment controller tests were not found.' }
node --test @taskDeploymentTests
if ($LASTEXITCODE -ne 0) { throw 'Deployment controller verification failed.' }
python -m unittest discover -s (Join-Path $taskRoot 'NAS\scripts\tests') -p 'test_configure*.py' -v
if ($LASTEXITCODE -ne 0) { throw 'Tailscale configuration verification failed.' }
python -m unittest discover -s (Join-Path $taskRoot 'NAS\deployment\test') -p 'test_*.py' -v
if ($LASTEXITCODE -ne 0) { throw 'Backup and restore verification failed.' }
