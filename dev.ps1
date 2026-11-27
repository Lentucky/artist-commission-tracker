# Starts the whole local stack: database + backend (Docker) and the dashboard dev server.
#   .\dev.ps1          start everything
#   .\dev.ps1 -Stop    stop everything (your data is kept)
param([switch]$Stop)
Set-Location $PSScriptRoot

if ($Stop) {
    docker compose stop
    if (Test-Path .dev-frontend.pid) {
        taskkill /PID (Get-Content .dev-frontend.pid) /T /F 2>$null | Out-Null
        Remove-Item .dev-frontend.pid
    }
    Write-Host 'Stopped. Your data is kept.'
    exit
}

docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host 'docker compose failed - is Docker Desktop running?'; exit 1 }

Write-Host 'Waiting for the API to come up (the first start can take a minute)...'
$up = $false
for ($i = 0; $i -lt 60 -and -not $up; $i++) {
    try {
        Invoke-WebRequest http://localhost:8080/api/commissions -UseBasicParsing | Out-Null
        $up = $true
    } catch {
        if ($_.Exception.Response) { $up = $true } else { Start-Sleep 2 } # a 401 still means "up"
    }
}
if (-not $up) { Write-Host 'The API did not answer. Check: docker compose logs backend --tail 30' }

if (-not (Test-Path frontend\node_modules)) { Push-Location frontend; npm install; Pop-Location }
$p = Start-Process powershell -ArgumentList '-NoExit', '-Command', 'Set-Location frontend; npm run dev' -PassThru
$p.Id | Set-Content .dev-frontend.pid

Write-Host ''
Write-Host 'Dashboard: http://localhost:5173'
Write-Host 'API:       http://localhost:8080/api'
Write-Host 'Backend logs: docker compose logs -f backend'