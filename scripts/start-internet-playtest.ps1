param(
  [switch]$Stop
)

# ---------------------------------------------------------------------------
# Publishes the compose.internet.yaml stack through a localhost.run SSH
# tunnel and prints the public URL. Unlike the named Cloudflare Tunnel in
# docs/INTERNET_PLAYTEST.md this needs no account and no domain, but the
# hostname is random and changes on every start.
#
# Only Caddy is bound to the host (127.0.0.1:8080); the tunnel reaches it
# from this machine, so no router port is opened.
# ---------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
# The progress bar makes Invoke-WebRequest crawl in Windows PowerShell, and
# some 5.1 hosts still default to TLS 1.0, which localhost.run refuses.
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol =
  [Net.SecurityProtocolType]::Tls12 -bor [Net.ServicePointManager]::SecurityProtocol

$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot 'compose.internet.yaml'
$composeBase = @('-f', $composeFile)
$tempRoot = [System.IO.Path]::GetTempPath()
$statePath = Join-Path $tempRoot 'htsr-internet-playtest-ssh.pid'
# Stable names, not GetTempFileName(): ssh holds both handles open for the
# life of the tunnel, so Windows cannot delete them on the way out. Fixed
# names get overwritten by the next run instead of piling up in TEMP.
$stdoutPath = Join-Path $tempRoot 'htsr-internet-playtest-ssh.out'
$stderrPath = Join-Path $tempRoot 'htsr-internet-playtest-ssh.err'

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

  $oldPid = (Get-Content -LiteralPath $statePath -Raw -ErrorAction SilentlyContinue)
  if ($oldPid -and $oldPid.Trim() -match '^\d+$') {
    # The pid file lives in TEMP and outlives reboots, and Windows reuses
    # pids. Only stop it if it is still an ssh process.
    $tracked = Get-Process -Id ([int]$oldPid.Trim()) -ErrorAction SilentlyContinue
    if ($tracked -and $tracked.ProcessName -eq 'ssh') {
      Stop-Process -Id $tracked.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
}

function Get-TunnelOutput {
  return @(
    (Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue),
    (Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue)
  ) -join "`n"
}

function Test-PublicEndpoint {
  param(
    [string]$Uri,
    [int[]]$AcceptStatus = @(200)
  )

  try {
    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 10
    return $AcceptStatus -contains [int]$response.StatusCode
  } catch {
    # A 401 from the lobby is a healthy answer, and Invoke-WebRequest raises
    # it as an error, so read the status off the response before giving up.
    $status = $null
    if ($_.Exception.Response) {
      $status = $_.Exception.Response.StatusCode.value__
    }
    return ($null -ne $status) -and ($AcceptStatus -contains [int]$status)
  }
}

if ($Stop) {
  Stop-TrackedTunnel
  Invoke-PlaytestCompose @('down')
  Remove-Item Env:HTSR_PUBLIC_ORIGIN -ErrorAction SilentlyContinue
  Write-Host 'HTSR internet playtest stopped.'
  exit 0
}

if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
  throw 'OpenSSH (ssh.exe) is required. Install the Windows OpenSSH Client feature and try again.'
}

Stop-TrackedTunnel
Invoke-PlaytestCompose @('up', '--build', '-d')

$publicUrl = $null
try {
  Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  $ssh = Start-Process -FilePath 'ssh.exe' -ArgumentList @(
    # ssh runs hidden with its pipes redirected, so it can never ask a
    # question. Without these two it blocks on the unknown-host prompt (a
    # first run on this machine, or after localhost.run rotates its key) or
    # on a password prompt, and the only symptom is the timeout below.
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'BatchMode=yes',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-R', '80:127.0.0.1:8080',
    'nokey@localhost.run'
  ) -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath $statePath -Value $ssh.Id -NoNewline

  for ($attempt = 0; $attempt -lt 30 -and -not $publicUrl; $attempt++) {
    Start-Sleep -Seconds 1
    $match = [regex]::Match((Get-TunnelOutput), 'https://[A-Za-z0-9.-]+\.lhr\.life')
    if ($match.Success) {
      $publicUrl = $match.Value.TrimEnd('.')
      break
    }
    if ($ssh.HasExited) {
      throw "localhost.run SSH tunnel exited. $((Get-TunnelOutput).Trim())"
    }
  }

  if (-not $publicUrl) {
    throw "Timed out waiting for localhost.run to provide a URL. $((Get-TunnelOutput).Trim())"
  }

  # The game process only allows credentialed sockets from this origin, so it
  # has to be recreated once the hostname is known.
  $env:HTSR_PUBLIC_ORIGIN = $publicUrl
  Invoke-PlaytestCompose @('up', '-d', '--force-recreate', 'game')

  # All three Caddy routes, not just the page: a tunnel that serves the
  # client but drops /socket.io or /api looks fine and plays nothing.
  $checks = @(
    @{ Name = 'client page'; Uri = $publicUrl; Accept = @(200) }
    @{ Name = 'Socket.IO handshake'; Uri = "$publicUrl/socket.io/?EIO=4&transport=polling"; Accept = @(200) }
    @{ Name = 'lobby API'; Uri = "$publicUrl/api/lobby"; Accept = @(200, 401) }
  )

  $failed = $null
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $failed = $null
    foreach ($check in $checks) {
      if (-not (Test-PublicEndpoint -Uri $check.Uri -AcceptStatus $check.Accept)) {
        $failed = $check
        break
      }
    }
    if (-not $failed) {
      break
    }
    Start-Sleep -Seconds 2
  }

  if ($failed) {
    throw "The tunnel is up at $publicUrl but its $($failed.Name) route is not answering yet ($($failed.Uri))."
  }
} catch {
  # Never leave a public tunnel behind after a failure.
  Stop-TrackedTunnel
  throw
}

Write-Host ''
Write-Host "HTSR is ready: $publicUrl" -ForegroundColor Green
Write-Host "Send that URL to your friends. Keep Docker Desktop and this computer running."
Write-Host "The hostname is random and dies with the tunnel; restarting hands out a new one."
Write-Host "To stop later: .\scripts\start-internet-playtest.ps1 -Stop"
