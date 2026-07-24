"""Frozen-backend entry point.

PyInstaller cannot use ``python -m uvicorn app.main:app`` (there is no module
launcher in a frozen exe), so we boot uvicorn programmatically here. The
desktop launcher spawns the resulting ``aetherrag-backend.exe`` instead of the
dev-mode ``python -m uvicorn``.

Writable paths (DB, vector store, uploads, model cache, logs) and secrets are
provided by the launcher via environment variables, which pydantic-settings
reads with higher precedence than the .env file.
"""

import os
import sys

import uvicorn


def main() -> None:
    # Multiprocessing-safe entry for frozen builds (onnxruntime/chromadb may
    # spawn workers). No-op in the parent process.
    import multiprocessing

    multiprocessing.freeze_support()

    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("BACKEND_PORT", os.environ.get("APP_PORT", "8000")))

    # Import the app lazily so freeze_support() runs before any heavy imports.
    from app.main import app

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
