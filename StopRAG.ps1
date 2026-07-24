# ============================================================
#  AETHER RAG - Stop All Services
# ============================================================

$ROOT     = Split-Path -Parent $MyInvocation.MyCommand.Definition
$PID_FILE = Join-Path $ROOT ".rag_pids"

Write-Host ""
Write-Host "  Stopping AETHER RAG..." -ForegroundColor Yellow

# Kill saved PIDs
if (Test-Path $PID_FILE) {
    $pids = Get-Content $PID_FILE | Where-Object { $_.Trim() -ne "" }
    foreach ($pid in $pids) {
        try {
            $proc = Get-Process -Id $pid -ErrorAction Stop
            Stop-Process -Id $pid -Force -ErrorAction Stop
            Write-Host "  [OK] Stopped PID $pid ($($proc.ProcessName))" -ForegroundColor Green
        } catch {
            Write-Host "  [--] PID $pid already stopped" -ForegroundColor DarkGray
        }
    }
    Remove-Item $PID_FILE -Force
}

# Also kill any remaining processes on our ports
$portProcesses = @()
try {
    $portProcesses += Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq "Listen" } |
        Select-Object -ExpandProperty OwningProcess
} catch { }
try {
    $portProcesses += Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq "Listen" } |
        Select-Object -ExpandProperty OwningProcess
} catch { }

foreach ($pid in ($portProcesses | Sort-Object -Unique)) {
    try {
        $proc = Get-Process -Id $pid -ErrorAction Stop
        Stop-Process -Id $pid -Force -ErrorAction Stop
        Write-Host "  [OK] Stopped port listener PID $pid ($($proc.ProcessName))" -ForegroundColor Green
    } catch { }
}

Write-Host ""
Write-Host "  [OK] AETHER RAG stopped." -ForegroundColor Green
Write-Host ""
Read-Host "  Press Enter to close"
