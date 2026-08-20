$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " KLYVERO - INICIALIZAÇÃO SEGURA" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker Desktop não foi encontrado no PATH."
}

try { docker info *> $null } catch { throw "Docker Desktop está instalado, mas não está em execução." }

function New-RandomBase64([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    return [Convert]::ToBase64String($buffer)
}

function New-RandomHex([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    return ([BitConverter]::ToString($buffer)).Replace("-", "").ToLowerInvariant()
}

function Set-EnvValue([string]$Text, [string]$Key, [string]$Value) {
    $escaped = [Regex]::Escape($Key)
    $replacement = "$Key=$Value"
    if ($Text -match "(?m)^$escaped=.*$") {
        return [Regex]::Replace($Text, "(?m)^$escaped=.*$", [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement })
    }
    return $Text.TrimEnd() + [Environment]::NewLine + $replacement + [Environment]::NewLine
}

$FirstRun = -not (Test-Path ".env")
$BootstrapToken = $null

if ($FirstRun) {
    Copy-Item ".env.example" ".env"

    $DbName = "klyvero"
    $DbUser = "klyvero"
    $DbPassword = New-RandomHex 24
    $AccessSecret = New-RandomBase64 48
    $RefreshSecret = New-RandomBase64 48
    $BootstrapToken = New-RandomBase64 36
    $WhatsappToken = New-RandomBase64 36
    $InboundToken = New-RandomBase64 36
    $EncryptionKey = New-RandomBase64 32
    $AuthThrottleSecret = New-RandomBase64 36
    $EmailLinkSecret = New-RandomBase64 36
    $OauthStateSecret = New-RandomBase64 36

    $envText = Get-Content ".env" -Raw
    $values = [ordered]@{
        POSTGRES_DB = $DbName
        POSTGRES_USER = $DbUser
        POSTGRES_PASSWORD = $DbPassword
        DATABASE_URL = "postgresql://${DbUser}:${DbPassword}@postgres:5432/${DbName}?schema=public"
        REDIS_URL = "redis://redis:6379"
        JWT_ACCESS_SECRET = $AccessSecret
        JWT_REFRESH_SECRET = $RefreshSecret
        JWT_ISSUER = "klyvero-api"
        JWT_AUDIENCE = "klyvero-web"
        BOOTSTRAP_TOKEN = $BootstrapToken
        BOOTSTRAP_ENABLED = "true"
        SECRET_ENCRYPTION_KEY = $EncryptionKey
        AUTH_THROTTLE_SECRET = $AuthThrottleSecret
        EMAIL_LINK_SIGNING_SECRET = $EmailLinkSecret
        OAUTH_STATE_SECRET = $OauthStateSecret
        WHATSAPP_SERVICE_URL = "http://whatsapp:8090"
        WHATSAPP_INTERNAL_TOKEN = $WhatsappToken
        WHATSAPP_DATABASE_DIR = "/app/data"
        WHATSAPP_EVENT_URL = "http://api:4000/api/v1/internal/whatsapp/events"
        EMAIL_INBOUND_TOKEN = $InboundToken
        QUEUE_PREFIX = "klyvero"
    }

    foreach ($entry in $values.GetEnumerator()) {
        $envText = Set-EnvValue $envText $entry.Key $entry.Value
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot ".env"), $envText, $utf8NoBom)
    Write-Host "Configuração local criada com segredos aleatórios." -ForegroundColor Green
}

Write-Host "Build e inicialização dos serviços..." -ForegroundColor DarkGray
docker compose up -d --build

Write-Host "Aguardando serviços principais..." -ForegroundColor DarkGray
$healthy = $false
for ($i = 0; $i -lt 120; $i++) {
    try {
        $response = Invoke-RestMethod "http://localhost:4000/api/v1/health/ready" -TimeoutSec 2
        if ($response.status -eq "ready") { $healthy = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    docker compose logs --tail 200 api
    throw "O serviço principal não ficou saudável."
}

$webHealthy = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        $login = Invoke-WebRequest "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 2
        if ($login.StatusCode -eq 200) { $webHealthy = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
}
if (-not $webHealthy) {
    docker compose logs --tail 200 web
    throw "A interface não ficou saudável."
}

if ($FirstRun) {
    try {
        Set-Clipboard -Value $BootstrapToken
        Write-Host "Token inicial copiado para a área de transferência." -ForegroundColor Yellow
    } catch {
        Write-Host "Não foi possível copiar o token automaticamente. Consulte o arquivo .env local." -ForegroundColor Yellow
    }
    Start-Process "http://localhost:3000/setup"
} else {
    Start-Process "http://localhost:3000/login"
}
