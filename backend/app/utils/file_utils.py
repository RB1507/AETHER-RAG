import os
import uuid
from app.core.config import settings

def generate_secure_filename(filename: str) -> str:
    """
    Generates a unique, path-safe filename using a UUID4 prefix.

    The original name is reduced to its basename so embedded path separators or
    ``..`` segments in a crafted upload filename cannot escape the upload
    directory (path traversal). The extension is lowercased and preserved.
    """
    # Strip any directory components from a (possibly malicious) client filename.
    base = os.path.basename(filename.replace("\\", "/"))
    name, ext = os.path.splitext(base)
    return f"{uuid.uuid4()}_{name}{ext.lower()}"

def validate_file_extension(filename: str) -> bool:
    """
    Validates if the file extension is in the allowed list from configurations.
    """
    allowed_exts = {ext.strip().lower() for ext in settings.ALLOWED_EXTENSIONS.split(",")}
    ext = os.path.splitext(filename)[1].lstrip(".").lower()
    return ext in allowed_exts

def validate_mime_type(content_type: str) -> bool:
    """
    Validates if the content type/MIME type is allowed.
    """
    allowed_mimes = {
        "application/pdf",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        # Image types (OCR'd via RapidOCR)
        "image/png",
        "image/jpeg",
        "image/tiff",
        "image/bmp",
        "image/x-ms-bmp",
    }
    return content_type.lower() in allowed_mimes
