param(
  [Parameter(Mandatory=$true)][string]$Destination,
  [Parameter(Mandatory=$true)][string]$HostName,
  [Parameter(Mandatory=$true)][string]$SshUser,
  [Parameter(Mandatory=$true)][string]$IdentityFile,
  [Parameter(Mandatory=$true)][string]$KnownHostsFile,
  [Parameter(Mandatory=$true)][string]$RemoteRoot
)
$ErrorActionPreference = 'Stop'
$taskDirectory = Join-Path $env:LOCALAPPDATA 'WarArchiveBackup'
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskClient = Join-Path $PSScriptRoot 'external-backup-client.mjs'
$taskConfig = Join-Path $taskDirectory 'config.json'
if (Test-Path -LiteralPath $taskConfig) { throw 'Existing backup configuration requires review; it will not be overwritten.' }
New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
$taskSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $taskDirectory '/inheritance:r' '/grant:r' "*${taskSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the backup key directory.' }
$taskInstalledClient = Join-Path $taskDirectory 'external-backup-client.mjs'
Copy-Item -LiteralPath $taskClient -Destination $taskInstalledClient
$taskDraft = Join-Path $taskDirectory 'draft.json'
@{
  version = 1
  host = $HostName
  user = $SshUser
  remoteRoot = $RemoteRoot
  destination = [System.IO.Path]::GetFullPath($Destination)
  identityFile = (Resolve-Path -LiteralPath $IdentityFile).Path
  knownHostsFile = (Resolve-Path -LiteralPath $KnownHostsFile).Path
  keyFile = Join-Path $taskDirectory 'encryption-key.dpapi'
} | ConvertTo-Json | Set-Content -LiteralPath $taskDraft -Encoding UTF8
# Windows PowerShell writes a BOM; Node receives a BOM-free draft.
[System.IO.File]::WriteAllText($taskDraft, [System.IO.File]::ReadAllText($taskDraft), (New-Object System.Text.UTF8Encoding($false)))
& $taskNode $taskInstalledClient 'init' $taskConfig $taskDraft
if ($LASTEXITCODE -ne 0) { throw 'Could not initialize external backup.' }
Remove-Item -LiteralPath $taskDraft
$taskAction = New-ScheduledTaskAction -Execute $taskNode -Argument ('"{0}" backup-if-due "{1}"' -f $taskInstalledClient, $taskConfig)
$taskTriggers = @((New-ScheduledTaskTrigger -Daily -At '02:20'), (New-ScheduledTaskTrigger -AtLogOn -User $taskSid))
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskSid -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'War Archive encrypted external backup' -Action $taskAction -Trigger $taskTriggers -Principal $taskPrincipal -Settings $taskSettings -Description 'Copies an authenticated AES-256-GCM application backup from the dedicated NAS project to this PC; requires this user to be logged in.' | Out-Null
Write-Output 'Daily external backup installed. The PC must be on, signed in, and able to reach the NAS. Encryption key is protected separately with Windows DPAPI.'
