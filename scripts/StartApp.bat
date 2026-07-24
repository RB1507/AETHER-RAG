@echo off
title AETHER RAG - Desktop App
REM Launches AETHER RAG as a native desktop application (Electron).
REM Electron's main process boots Ollama, the FastAPI backend, and the
REM Next.js server, then opens the app in its own window.
cd /d "%~dp0..\frontend"
call npm run app
