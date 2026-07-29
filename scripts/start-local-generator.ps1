param(
  [switch]$UpdateCloudflare
)
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot ".local-ai"
$comfyRoot = "C:\Users\johns\Documents\AI\ComfyUI"
$pythonPath = Join-Path $comfyRoot ".venv\Scripts\python.exe"
$cloudflaredPath = Join-Path $runtimeDir "cloudflared.exe"
$tokenPath = Join-Path $runtimeDir "gateway-token.txt"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "ComfyUI Python was not found at $pythonPath"
}
if (-not (Test-Path -LiteralPath $cloudflaredPath)) {
  $cloudflaredDownload = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  $cloudflaredTemp = "$cloudflaredPath.download"
  Invoke-WebRequest -UseBasicParsing -Uri $cloudflaredDownload -OutFile $cloudflaredTemp
  Move-Item -Force -LiteralPath $cloudflaredTemp -Destination $cloudflaredPath
}
if (-not (Test-Path -LiteralPath $tokenPath)) {
  $bytes = New-Object byte[] 32
  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $random.GetBytes($bytes)
  } finally {
    $random.Dispose()
  }
  [Convert]::ToBase64String($bytes) | Set-Content -NoNewline -LiteralPath $tokenPath
}
$gatewayToken = Get-Content -Raw -LiteralPath $tokenPath

function Test-LocalHealth([string]$url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-LocalHealth "http://127.0.0.1:8188/system_stats")) {
  Start-Process -FilePath $pythonPath `
    -ArgumentList @("main.py", "--listen", "127.0.0.1", "--port", "8188") `
    -WorkingDirectory $comfyRoot `
    -RedirectStandardOutput (Join-Path $runtimeDir "comfy.log") `
    -RedirectStandardError (Join-Path $runtimeDir "comfy-error.log") `
    -UseNewEnvironment `
    -WindowStyle Hidden

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-LocalHealth "http://127.0.0.1:8188/system_stats") {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw "ComfyUI did not become ready within 30 seconds. Check .local-ai/comfy-error.log."
  }
}

if (-not (Test-LocalHealth "http://127.0.0.1:8789/health")) {
  Start-Process -FilePath "node.exe" `
    -ArgumentList @(
      (Join-Path $PSScriptRoot "local-image-gateway.mjs"),
      "--comfy-url", "http://127.0.0.1:8188",
      "--output-dir", (Join-Path $comfyRoot "output"),
      "--token-file", $tokenPath,
      "--port", "8789"
    ) `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput (Join-Path $runtimeDir "gateway.log") `
    -RedirectStandardError (Join-Path $runtimeDir "gateway-error.log") `
    -UseNewEnvironment `
    -WindowStyle Hidden

  $ready = $false
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-LocalHealth "http://127.0.0.1:8789/health") {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw "The local gateway did not become ready. Check .local-ai/gateway-error.log."
  }
}

$tunnelLog = Join-Path $runtimeDir "tunnel.log"
$tunnelErrorLog = Join-Path $runtimeDir "tunnel-error.log"
$tunnelUrlPath = Join-Path $runtimeDir "tunnel-url.txt"
$tunnelUrl = $null
if ((Test-Path -LiteralPath $tunnelUrlPath) -and
    (Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue)) {
  $tunnelUrl = (Get-Content -Raw -LiteralPath $tunnelUrlPath).Trim()
}

if (-not $tunnelUrl) {
  Remove-Item -LiteralPath $tunnelLog,$tunnelErrorLog -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath $cloudflaredPath `
    -ArgumentList @("tunnel", "--url", "http://127.0.0.1:8789", "--no-autoupdate") `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $tunnelLog `
    -RedirectStandardError $tunnelErrorLog `
    -WindowStyle Hidden

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Seconds 1
    $logText = @(
      Get-Content -Raw $tunnelLog -ErrorAction SilentlyContinue
      Get-Content -Raw $tunnelErrorLog -ErrorAction SilentlyContinue
    ) -join "`n"
    if ($logText -match "https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com") {
      $candidateUrl = $matches[0]
      if (Test-LocalHealth "$candidateUrl/health") {
        $tunnelUrl = $candidateUrl
        break
      }
    }
  }
}
if (-not $tunnelUrl) {
  throw "Cloudflare Tunnel did not return a public URL. Check .local-ai/tunnel-error.log."
}
$tunnelUrl | Set-Content -NoNewline -LiteralPath $tunnelUrlPath

if ($UpdateCloudflare) {
  @($tunnelUrl) | npx.cmd wrangler secret put LOCAL_IMAGE_GATEWAY_URL --name johnsweber-playground | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "The tunnel started, but the production gateway URL could not be updated."
  }
  @($gatewayToken) | npx.cmd wrangler secret put LOCAL_IMAGE_GATEWAY_TOKEN --name johnsweber-playground | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "The tunnel started, but the production gateway token could not be updated."
  }
}

[pscustomobject]@{
  GatewayUrl = $tunnelUrl
  TokenPath = $tokenPath
  ComfyReady = $true
  CloudflareUpdated = [bool]$UpdateCloudflare
} | ConvertTo-Json
