import os
import sys

# tests/ now lives under backend/; add the backend root to sys.path so the
# test modules' `from app...` imports resolve when pytest is invoked from
# anywhere (previously they relied on being run from the backend/ cwd).
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)
