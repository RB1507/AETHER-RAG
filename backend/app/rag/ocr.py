"""Lightweight OCR via RapidOCR (ONNX Runtime).

Chosen to fit the project's no-torch / CPU-only / small-footprint constraints:
RapidOCR runs on the same onnxruntime the embedder uses, ships ~10 MB ONNX
models, and needs no system binaries. The engine is lazily constructed on first
use (models load then), so non-OCR uploads pay nothing, and OCR degrades
gracefully to "" if the optional dependency is unavailable.
"""

from __future__ import annotations

import os
import sys

import structlog

logger = structlog.get_logger()

# English recognition model. RapidOCR's default rec model is Chinese-primary and
# drops spaces between English words ("AmountDue:$1,250.00"); the English
# PP-OCRv3 rec model fixes spacing. The character dict is embedded in the ONNX
# metadata, so no separate keys file is needed.
_EN_REC_MODEL = "en_PP-OCRv3_rec_infer.onnx"


def _en_rec_model_path() -> str | None:
    """Locate the bundled English rec model in both source and frozen runs."""
    candidates = []
    if getattr(sys, "frozen", False):  # PyInstaller: data files extracted to _MEIPASS
        candidates.append(os.path.join(sys._MEIPASS, "app", "rag", "ocr_models", _EN_REC_MODEL))
    candidates.append(os.path.join(os.path.dirname(__file__), "ocr_models", _EN_REC_MODEL))
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


class _OCR:
    _instance: "_OCR | None" = None

    def __new__(cls) -> "_OCR":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._engine = None
            cls._instance._unavailable = False
        return cls._instance

    @property
    def engine(self):
        if self._engine is None and not self._unavailable:
            try:
                from rapidocr_onnxruntime import RapidOCR

                en_rec = _en_rec_model_path()
                if en_rec:
                    logger.info("Loading OCR engine (RapidOCR/ONNX, English rec model)")
                    self._engine = RapidOCR(rec_model_path=en_rec)
                else:
                    logger.warning(
                        "English rec model not found; using default (spacing may degrade)"
                    )
                    self._engine = RapidOCR()
                logger.info("OCR engine loaded")
            except Exception as e:  # missing dep or load failure → disable OCR
                self._unavailable = True
                logger.warning("OCR unavailable; skipping OCR", error=str(e))
        return self._engine

    def image_to_text(self, image) -> str:
        """OCR a file path or a numpy image array → recognized text ("" if none)."""
        engine = self.engine
        if engine is None:
            return ""
        try:
            result, _ = engine(image)
            if not result:
                return ""
            # result is a list of [box, text, score]; keep text in reading order.
            return "\n".join(line[1] for line in result if line and len(line) > 1).strip()
        except Exception as e:
            logger.error("OCR failed", error=str(e))
            return ""


_ocr = _OCR()


def ocr_image(image) -> str:
    """OCR an image path or numpy array. Returns recognized text, or '' on failure."""
    return _ocr.image_to_text(image)


def ocr_available() -> bool:
    return _ocr.engine is not None
