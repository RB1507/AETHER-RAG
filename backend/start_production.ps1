Write-Host "==============================================" -ForegroundColor Green
Write-Host "       Starting AETHER RAG Production Stack     " -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green

# Ensure docker-compose is installed
if (!(Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Error "docker-compose command not found. Please install Docker Desktop."
    exit 1
}

# Run docker-compose build and up
docker-compose up --build -d

Write-Host "`nStack is booting up. Check health status via:" -ForegroundColor Cyan
Write-Host " - Backend Health: http://localhost:8000/health" -ForegroundColor Yellow
Write-Host " - Telemetry Dashboard: http://localhost:8000/api/metrics" -ForegroundColor Yellow
Write-Host " - API Docs: http://localhost:8000/docs" -ForegroundColor Yellow
