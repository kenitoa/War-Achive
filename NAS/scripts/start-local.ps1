$ErrorActionPreference = 'Stop'
$taskBackend = (Resolve-Path (Join-Path $PSScriptRoot '..\back')).ProviderPath
Write-Output 'Starting the NAS API. NAS/.env is canonical; secrets are never printed.'
Write-Output 'Build NAS/admin first. Local PGlite runs API and worker in this single process; do not open the same database from another worker.'
Push-Location $taskBackend
try { npm.cmd run dev; if ($LASTEXITCODE -ne 0) { throw 'The API did not start successfully.' } } finally { Pop-Location }
