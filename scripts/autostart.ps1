<#
  Starts RenVer by itself whenever you sign in to Windows (so it comes back after a reboot).

    powershell -ExecutionPolicy Bypass -File scripts\autostart.ps1            # turn on
    powershell -ExecutionPolicy Bypass -File scripts\autostart.ps1 -Remove    # turn off

  It runs the production build, so run `npm run build` once first (and again after you change code).
  Docker Desktop must also start at sign-in (Docker Desktop > Settings > General > "Start Docker Desktop when you sign in").
#>
param([switch]$Remove)

$TaskName = "RenVer"
$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "RenVer will no longer start by itself."
  } else {
    Write-Host "Nothing to remove: the task was not set up."
  }
  exit 0
}

if (-not (Test-Path (Join-Path $AppDir ".next\BUILD_ID"))) {
  Write-Error "There is no production build yet. Run 'npm run build' in $AppDir first."
  exit 1
}

$npx = (Get-Command npx.cmd -ErrorAction Stop).Source
$command = "Set-Location -LiteralPath '$AppDir'; & '$npx' next start -H 127.0.0.1 -p 3000"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Starts the RenVer panel at sign-in" -Force | Out-Null
Write-Host "Done. RenVer starts at your next sign-in, from $AppDir."
Write-Host "Start it now without signing out:  Start-ScheduledTask -TaskName $TaskName"
