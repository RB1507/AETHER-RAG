# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the light AETHER RAG FastAPI backend.

IMPORTANT: run from THIS packaging/ dir, NOT backend/. Running from backend/
makes `pathex=[".."]`/`collect_submodules("app")` point at the project root (no
`app` package there), so the app code is silently dropped — the build "succeeds"
but the frozen exe comes out ~31 MB instead of ~35 MB and dies at runtime with
`ModuleNotFoundError: No module named 'app.main'`. distpath is also cwd-relative,
so output would land in backend/dist instead of packaging/dist (where
electron-builder reads it).

    cd backend/packaging
    ..\\venv_pkg\\Scripts\\pyinstaller.exe aetherrag-backend.spec --noconfirm --clean

Produces dist/aetherrag-backend/aetherrag-backend.exe (one-folder build, faster
startup and easier to bundle as an electron-builder extraResource than one-file).
Sanity check: the exe should be ~35 MB before packaging.
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = []
binaries = []
hiddenimports = []

# Packages that load data files and/or submodules dynamically — collect
# everything so the frozen exe has what it needs at runtime.
for pkg in (
    "lancedb",
    "pyarrow",
    "fastembed",
    "onnxruntime",
    "tokenizers",
    "huggingface_hub",
    "structlog",
    "passlib",
    "jose",
    # OCR stack — RapidOCR ships its ONNX models as package data, so collect_all
    # is required; fitz=PyMuPDF, cv2=OpenCV.
    "rapidocr_onnxruntime",
    "fitz",
    "cv2",
):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

# Bundle the English OCR recognition model (fixes English word spacing).
datas += [("../app/rag/ocr_models/en_PP-OCRv3_rec_infer.onnx", "app/rag/ocr_models")]

# uvicorn picks its loop/protocol/lifespan implementations by import string at
# runtime; pull in all submodules so none are missing when frozen.
hiddenimports += collect_submodules("uvicorn")
# passlib loads bcrypt backend lazily by name.
hiddenimports += ["passlib.handlers.bcrypt", "bcrypt"]
# URL ingestion lazily imports these inside functions (YouTube transcripts,
# HTML page parsing), so PyInstaller's static analysis misses them — pull them
# in explicitly. Both must also be pip-installed in venv_pkg (they live in
# requirements-package.txt but aren't auto-installed by the freeze).
hiddenimports += collect_submodules("youtube_transcript_api")
hiddenimports += collect_submodules("bs4")
# Our own app package (imported lazily in run_server.main).
hiddenimports += collect_submodules("app")

block_cipher = None

a = Analysis(
    ["run_server.py"],
    pathex=[".."],          # backend/ root so `import app...` resolves
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Dev/build tooling that must never enter the runtime bundle.
        "torch",
        "sentence_transformers",
        "transformers",
        "PyInstaller",
        "pip",
        "setuptools",
        "pytest",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="aetherrag-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,          # keep a console so launcher can read stdout/stderr logs
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="aetherrag-backend",
)
