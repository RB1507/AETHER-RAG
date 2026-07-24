import os
import pypdf
import docx
import structlog
from app.utils.text_utils import clean_text
from app.rag.ocr import ocr_image

logger = structlog.get_logger()

# Pages with fewer than this many extractable characters are treated as
# scanned/image pages and routed through OCR.
_MIN_PAGE_TEXT_CHARS = 10
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp")


def _ocr_pdf_page(fitz_doc, page_index: int) -> str:
    """Rasterize one PDF page with PyMuPDF and OCR it. '' if unavailable."""
    try:
        import numpy as np

        page = fitz_doc[page_index]
        pix = page.get_pixmap(dpi=200)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n >= 3:
            img = np.ascontiguousarray(img[:, :, :3][:, :, ::-1])  # RGB -> BGR for OCR
        return ocr_image(img)
    except Exception as e:
        logger.error("PDF page OCR failed", page=page_index, error=str(e))
        return ""


def extract_pdf(path: str) -> tuple[str, bool]:
    """
    Extracts text from a PDF using pypdf, falling back to OCR (RapidOCR via
    PyMuPDF rasterization) for scanned/image-only pages that have no text layer.
    """
    try:
        reader = pypdf.PdfReader(path)
        text_parts = []
        fitz_doc = None  # opened lazily only when a page needs OCR
        ocr_pages = 0
        for i, page in enumerate(reader.pages):
            page_text = (page.extract_text() or "").strip()
            if len(page_text) < _MIN_PAGE_TEXT_CHARS:
                try:
                    if fitz_doc is None:
                        import fitz  # PyMuPDF (optional dependency)

                        fitz_doc = fitz.open(path)
                    ocr_text = _ocr_pdf_page(fitz_doc, i)
                    if ocr_text:
                        page_text = ocr_text
                        ocr_pages += 1
                except Exception as e:
                    logger.warning("PDF OCR fallback unavailable", error=str(e))
            if page_text:
                text_parts.append(page_text)
        if fitz_doc is not None:
            fitz_doc.close()
        if ocr_pages:
            logger.info("Applied OCR to scanned PDF pages", path=path, ocr_pages=ocr_pages)
        return "\n---PAGE_BREAK---\n".join(text_parts), True
    except Exception as e:
        logger.error("Failed to extract PDF", path=path, error=str(e))
        return "", False


def extract_image(path: str) -> tuple[str, bool]:
    """
    Extracts text from an image file (png/jpg/tiff/bmp) via OCR.
    """
    try:
        text = ocr_image(path)
        return text, True
    except Exception as e:
        logger.error("Failed to extract image", path=path, error=str(e))
        return "", False

def extract_docx(path: str) -> tuple[str, bool]:
    """
    Extracts text from a DOCX file using python-docx.
    """
    try:
        doc = docx.Document(path)
        text_parts = []
        for paragraph in doc.paragraphs:
            if paragraph.text:
                text_parts.append(paragraph.text)
        return "\n".join(text_parts), True
    except Exception as e:
        logger.error("Failed to extract DOCX", path=path, error=str(e))
        return "", False

def extract_txt(path: str) -> tuple[str, bool]:
    """
    Extracts text from a TXT file with UTF-8 decoding and fallback to latin-1.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read(), True
    except UnicodeDecodeError:
        try:
            logger.warning("UTF-8 decoding failed, falling back to latin-1", path=path)
            with open(path, "r", encoding="latin-1") as f:
                return f.read(), True
        except Exception as e:
            logger.error("Failed to extract TXT with latin-1 fallback", path=path, error=str(e))
            return "", False
    except Exception as e:
        logger.error("Failed to extract TXT", path=path, error=str(e))
        return "", False

def extract_text_from_file(path: str) -> tuple[str, bool]:
    """
    Identifies the file type and extracts clean text.
    Returns (cleaned_text, success_flag).
    """
    if not os.path.exists(path):
        logger.error("File does not exist for extraction", path=path)
        return "", False

    ext = os.path.splitext(path)[1].lower()
    
    if ext == ".pdf":
        raw_text, success = extract_pdf(path)
    elif ext == ".docx":
        raw_text, success = extract_docx(path)
    elif ext in (".txt", ".text"):
        raw_text, success = extract_txt(path)
    elif ext in IMAGE_EXTENSIONS:
        raw_text, success = extract_image(path)
    else:
        logger.error("Unsupported file extension for extraction", path=path, ext=ext)
        return "", False

    if success:
        return clean_text(raw_text), True
    
    return "", False
