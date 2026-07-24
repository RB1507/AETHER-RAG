# ============================================================
#  AETHER RAG - One-Click Launcher (PowerShell)
#  Double-click StartRAG.bat to launch the full application.
# ============================================================

$ErrorActionPreference = "Stop"
# Script lives in scripts/; project root is its parent.
$ROOT       = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$BACKEND    = Join-Path $ROOT "backend"
$FRONTEND   = Join-Path $ROOT "frontend"
$VENV_PY    = Join-Path $BACKEND "venv\Scripts\python.exe"
$PID_FILE   = Join-Path $ROOT ".rag_pids"

# -- Colors --
function Write-Step  ($msg) { Write-Host "  > $msg" -ForegroundColor Cyan }
function Write-OK    ($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn  ($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err   ($msg) { Write-Host "  [ERR] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "  =============================================" -ForegroundColor Magenta
Write-Host "        AETHER RAG  -  Application Launcher     " -ForegroundColor Magenta
Write-Host "  =============================================" -ForegroundColor Magenta
Write-Host ""

# -- 1. Check prerequisites --
Write-Step "Checking prerequisites..."

if (!(Test-Path $VENV_PY)) {
    Write-Err "Python venv not found at: $VENV_PY"
    Write-Err "Run:  cd backend && python -m venv venv && venv\Scripts\pip install -r requirements.txt"
    Read-Host "Press Enter to exit"
    exit 1
}

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (!$npmCmd) {
    Write-Err "npm not found. Please install Node.js from https://nodejs.org"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-OK "Prerequisites OK"

# -- 2. Start Ollama (if not already running) --
Write-Step "Checking Ollama LLM server..."

$ollamaRunning = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $connectTask = $tcp.ConnectAsync("127.0.0.1", 11434)
    if ($connectTask.Wait(2000)) {
        $ollamaRunning = $tcp.Connected
    }
    $tcp.Close()
} catch { }

$ollamaProc = $null
if ($ollamaRunning) {
    Write-OK "Ollama already running on :11434"
} else {
    $ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
    if ($ollamaCmd) {
        Write-Step "Starting Ollama..."
        $ollamaProc = Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -PassThru
        Start-Sleep -Seconds 3
        Write-OK "Ollama started (PID: $($ollamaProc.Id))"
    } else {
        Write-Warn "Ollama not found. LLM features will not work."
        Write-Warn "Install from https://ollama.com and run: ollama pull mistral"
    }
}

# -- 3. Start Backend (FastAPI) --
Write-Step "Starting Backend (FastAPI) on port 8000..."

$backendProc = Start-Process -FilePath $VENV_PY `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" `
    -WorkingDirectory $BACKEND `
    -WindowStyle Hidden `
    -PassThru

Write-OK "Backend started (PID: $($backendProc.Id))"

# -- 4. Start Frontend (Next.js) --
Write-Step "Starting Frontend (Next.js) on port 3000..."

$frontendProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "cd /d `"$FRONTEND`" && npm run dev" `
    -WindowStyle Hidden `
    -PassThru

Write-OK "Frontend started (PID: $($frontendProc.Id))"

# -- 5. Save PIDs for StopRAG --
$pids = @($backendProc.Id, $frontendProc.Id)
if ($ollamaProc) { $pids += $ollamaProc.Id }
$pids -join "`n" | Out-File -FilePath $PID_FILE -Encoding UTF8

# -- 6. Wait for servers to be ready --
Write-Step "Waiting for servers to start..."

$backendReady  = $false
$frontendReady = $false
$maxWait = 60
$waited  = 0

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2

    if (!$backendReady) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $task = $tcp.ConnectAsync("127.0.0.1", 8000)
            if ($task.Wait(1500) -and $tcp.Connected) {
                $backendReady = $true
                Write-OK "Backend is ready"
            }
            $tcp.Close()
        } catch { }
    }

    if (!$frontendReady) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $task = $tcp.ConnectAsync("127.0.0.1", 3000)
            if ($task.Wait(1500) -and $tcp.Connected) {
                $frontendReady = $true
                Write-OK "Frontend is ready"
            }
            $tcp.Close()
        } catch { }
    }

    if ($backendReady -and $frontendReady) { break }

    $pct = [math]::Round(($waited / $maxWait) * 100)
    Write-Host "`r  Loading... $pct%  " -NoNewline -ForegroundColor DarkGray
}

Write-Host ""

if (!$backendReady)  { Write-Warn "Backend may still be loading - check http://localhost:8000/docs" }
if (!$frontendReady) { Write-Warn "Frontend may still be loading - check http://localhost:3000" }

# -- 7. Open Browser --
Write-Host ""
Write-Host "  =============================================" -ForegroundColor Green
Write-Host "        AETHER RAG is running!                  " -ForegroundColor Green
Write-Host "                                               " -ForegroundColor Green
Write-Host "    App:      http://localhost:3000             " -ForegroundColor Green
Write-Host "    API Docs: http://localhost:8000/docs        " -ForegroundColor Green
Write-Host "                                               " -ForegroundColor Green
Write-Host "    To stop:  double-click StopRAG.bat          " -ForegroundColor Green
Write-Host "  =============================================" -ForegroundColor Green
Write-Host ""

Start-Process "http://localhost:3000"

Write-Host "  Press Enter to hide this window (app keeps running)..." -ForegroundColor DarkGray
Read-Host
