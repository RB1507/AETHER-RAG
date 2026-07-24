@echo off
title AETHER RAG - Stopping Desktop App
REM Stops the AETHER RAG desktop stack by freeing its ports.
REM (Ollama is left running, since it's a shared local service.)

echo Stopping backend (port 8000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr LISTENING ^| findstr :8000') do taskkill /PID %%a /F /T >nul 2>&1

echo Stopping frontend (port 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr LISTENING ^| findstr :3000') do taskkill /PID %%a /F /T >nul 2>&1

echo Closing Electron window...
taskkill /IM electron.exe /F /T >nul 2>&1

echo Done.
timeout /t 2 >nul
