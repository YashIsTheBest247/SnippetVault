$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$venvPy = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "Creating backend virtual environment..." -ForegroundColor Cyan
    python -m venv (Join-Path $root "backend\.venv")
    & $venvPy -m pip install --upgrade pip
    & $venvPy -m pip install -r (Join-Path $root "backend\requirements.txt")
}

if (-not (Test-Path (Join-Path $root "frontend\node_modules"))) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location (Join-Path $root "frontend"); npm install; Pop-Location
}

Write-Host "Starting backend on :8000 and frontend on :5173..." -ForegroundColor Green
Start-Process -FilePath $venvPy -ArgumentList "-m", "uvicorn", "main:app", "--port", "8000" `
    -WorkingDirectory (Join-Path $root "backend")
Start-Process -FilePath "npm" -ArgumentList "run", "dev" `
    -WorkingDirectory (Join-Path $root "frontend")

Write-Host "Open http://localhost:5173" -ForegroundColor Yellow
