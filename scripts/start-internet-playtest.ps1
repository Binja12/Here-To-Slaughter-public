param(
  [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot 'compose.internet.yaml'
$composeBase = @('-f', $composeFile)
$statePath = Join-Path ([System.IO.Path]::GetTempPath()) 'htsr-internet-playtest-ssh.pid'

function Invoke-PlaytestCompose {
  param([string[]]$CommandArgs)

  & docker compose @composeBase @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed with exit code $LASTEXITCODE."
  }
}

function Stop-TrackedTunnel {
  if (-not (Test-Path -LiteralPath $statePath)) {
    return
  }

  $oldPid = Get-Content -LiteralPath $statePath -Raw
  if ($oldPid -match '^\d+$') {
    Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
}

if ($Stop) {
  Stop-TrackedTunnel
  Invoke-PlaytestCompose @('down')
  Write-Host 'HTSR internet playtest stopped.'
  exit 0
}

if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
  throw 'OpenSSH (ssh.exe) is required. Install the Windows OpenSSH Client feature and try again.'
}

Stop-TrackedTunnel
Invoke-PlaytestCompose @('up', '--build', '-d')

$stdoutPath = [System.IO.Path]::GetTempFileName()
$stderrPath = [System.IO.Path]::GetTempFileName()
$ssh = Start-Process -FilePath 'ssh.exe' -ArgumentList @(
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-R', '80:127.0.0.1:8080',
  'nokey@localhost.run'
) -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $statePath -Value $ssh.Id -NoNewline

$publicUrl = $null
for ($attempt = 0; $attempt -lt 30 -and -not $publicUrl; $attempt++) {
  Start-Sleep -Seconds 1
  $tunnelOutput = @(
    (Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue),
    (Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue)
  ) -join "`n"
  $match = [regex]::Match($tunnelOutput, 'https://[A-Za-z0-9.-]+\.lhr\.life')
  if ($match.Success) {
    $publicUrl = $match.Value.TrimEnd('.')
  }
  if (-not $ssh.HasExited -and $publicUrl) {
    break
  }
  if ($ssh.HasExited) {
    throw "localhost.run SSH tunnel exited. $((Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue).Trim())"
  }
}

if (-not $publicUrl) {
  throw "Timed out waiting for localhost.run to provide a URL. Check $stderrPath for details."
}

$env:HTSR_PUBLIC_ORIGIN = $publicUrl
Invoke-PlaytestCompose @('up', '-d', '--force-recreate', 'game')

$ready = $false
for ($attempt = 0; $attempt -lt 15 -and -not $ready; $attempt++) {
  try {
    $response = Invoke-WebRequest -Uri $publicUrl -UseBasicParsing -TimeoutSec 5
    $ready = $response.StatusCode -eq 200
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $ready) {
  throw "The tunnel URL was created, but HTSR did not return HTTP 200 yet: $publicUrl"
}

Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
Write-Host ''
Write-Host "HTSR is ready: $publicUrl" -ForegroundColor Green
Write-Host "Send that URL to your friends. Keep Docker Desktop and this computer running."
Write-Host "To stop later: .\scripts\start-internet-playtest.ps1 -Stop"
