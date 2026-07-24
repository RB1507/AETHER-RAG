#!/bin/bash
echo "=============================================="
echo "       Starting AETHER RAG Production Stack     "
echo "=============================================="

if ! [ -x "$(command -v docker-compose)" ]; then
  echo 'Error: docker-compose is not installed. Please install Docker.' >&2
  exit 1
fi

docker-compose up --build -d

echo ""
echo "Stack is booting up. Check health status via:"
echo " - Backend Health: http://localhost:8000/health"
echo " - Telemetry Dashboard: http://localhost:8000/api/metrics"
echo " - API Docs: http://localhost:8000/docs"
