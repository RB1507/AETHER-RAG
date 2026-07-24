import os
import re
import uuid
from datetime import datetime
from urllib.parse import urlparse, parse_qs

import httpx
import structlog
from fastapi import BackgroundTasks, HTTPException, status

from app.core.config import settings
from app.schemas.document import DocumentUploadResponse
from app.services.document_service import DOCUMENT_STATUSES, process_document_task

logger = structlog.get_logger()

_FETCH_TIMEOUT_S = 30
_MAX_DOWNLOAD_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024

_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}

# A plain browser-ish UA: some sites (e.g. Project Gutenberg mirrors) reject
# default client UAs with 403.
_HTTP_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AetherRAG/1.0"}


def youtube_video_id(url: str) -> str | None:
    """Extract the video id if the URL is a YouTube video link, else None."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host not in _YOUTUBE_HOSTS:
        return None
    if host == "youtu.be":
        vid = parsed.path.lstrip("/").split("/")[0]
        return vid or None
    if parsed.path == "/watch":
        return (parse_qs(parsed.query).get("v") or [None])[0]
    m = re.match(r"^/(?:shorts|embed|live)/([A-Za-z0-9_-]{5,})", parsed.path)
    return m.group(1) if m else None


def _safe_source_name(title: str, ext: str) -> str:
    """Turn a page/video title into a filesystem-safe source filename."""
    cleaned = re.sub(r"[^\w\s\-.,()]", "", title, flags=re.UNICODE).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)[:80].strip() or "web-source"
    return f"{cleaned}{ext}"


def _fetch_youtube_title(url: str) -> str | None:
    """Best-effort video title via YouTube's public oEmbed endpoint."""
    try:
        r = httpx.get(
            "https://www.youtube.com/oembed",
            params={"url": url, "format": "json"},
            headers=_HTTP_HEADERS,
            timeout=10,
        )
        if r.status_code == 200:
            title = r.json().get("title")
            return title if isinstance(title, str) and title.strip() else None
    except Exception:
        pass
    return None


def _fetch_youtube_transcript(video_id: str) -> str:
    """
    Fetch the video transcript, preferring English but falling back to the
    first available language (including auto-generated captions).
    Supports both the >=1.0 instance API and the pre-1.0 static API.
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    try:
        transcripts = YouTubeTranscriptApi().list(video_id)  # >= 1.0
    except AttributeError:
        transcripts = YouTubeTranscriptApi.list_transcripts(video_id)  # < 1.0

    try:
        transcript = transcripts.find_transcript(["en"])
    except Exception:
        transcript = next(iter(transcripts))

    parts = []
    for snippet in transcript.fetch():
        # >=1.0 yields objects with .text; <1.0 yields dicts
        text = getattr(snippet, "text", None)
        if text is None and isinstance(snippet, dict):
            text = snippet.get("text")
        if text:
            parts.append(text.strip())
    return " ".join(parts)


def _extract_html_text(html: str) -> tuple[str | None, str]:
    """Strip boilerplate from an HTML page and return (title, readable text)."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else None
    for tag in soup(["head", "script", "style", "noscript", "template", "nav", "header", "footer", "aside", "form", "iframe"]):
        tag.decompose()
    lines = (line.strip() for line in soup.get_text(separator="\n").splitlines())
    return title, "\n".join(line for line in lines if line)


def _download(url: str) -> tuple[bytes, str]:
    """Download a URL with redirects and a size cap. Returns (body, content_type)."""
    with httpx.stream(
        "GET", url, headers=_HTTP_HEADERS, timeout=_FETCH_TIMEOUT_S, follow_redirects=True
    ) as response:
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
        body = b""
        for chunk in response.iter_bytes():
            body += chunk
            if len(body) > _MAX_DOWNLOAD_BYTES:
                raise ValueError(f"Content exceeds the {settings.MAX_FILE_SIZE_MB}MB limit")
        return body, content_type


def _write_upload_file(source_name: str, data: bytes) -> str:
    """Persist fetched content into UPLOAD_DIR using the same unique-name scheme as file uploads."""
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    path = os.path.join(settings.UPLOAD_DIR, f"{uuid.uuid4()}_{source_name}")
    with open(path, "wb") as f:
        f.write(data)
    return path


def process_url_task(document_id: str, url: str, owner: str = "", workspace_id: str = "") -> None:
    """
    Background worker: fetch a URL (YouTube transcript, PDF, or web page text),
    persist it as a file in UPLOAD_DIR, then run the standard document pipeline
    (extract -> chunk -> embed -> vector store) so URL sources behave exactly
    like uploaded files — including citations and deletion.
    """
    try:
        video_id = youtube_video_id(url)
        if video_id:
            title = _fetch_youtube_title(url) or f"YouTube video {video_id}"
            transcript = _fetch_youtube_transcript(video_id)
            if not transcript.strip():
                raise ValueError("Video has no transcript/captions available")
            source_name = _safe_source_name(title, ".txt")
            content = f"{title}\nSource: {url}\n\n{transcript}"
            path = _write_upload_file(source_name, content.encode("utf-8"))
        else:
            body, content_type = _download(url)
            if content_type == "application/pdf" or url.lower().split("?")[0].endswith(".pdf"):
                fallback = os.path.basename(urlparse(url).path) or "download.pdf"
                source_name = _safe_source_name(os.path.splitext(fallback)[0], ".pdf")
                path = _write_upload_file(source_name, body)
            elif content_type in ("text/plain", "text/markdown", "text/csv"):
                fallback = os.path.basename(urlparse(url).path) or "download.txt"
                source_name = _safe_source_name(os.path.splitext(fallback)[0], ".txt")
                path = _write_upload_file(source_name, body)
            else:
                title, text = _extract_html_text(body.decode("utf-8", errors="replace"))
                if not text.strip():
                    raise ValueError("No readable text found at this URL")
                source_name = _safe_source_name(title or urlparse(url).hostname or "web-page", ".txt")
                content = f"{title or url}\nSource: {url}\n\n{text}"
                path = _write_upload_file(source_name, content.encode("utf-8"))

        # Surface the resolved title in status polls and record the on-disk path
        # so delete_document can remove the fetched file too.
        DOCUMENT_STATUSES[document_id]["filename"] = source_name
        DOCUMENT_STATUSES[document_id]["file_path"] = path

        process_document_task(document_id, path, source_name, owner, workspace_id)

    except Exception as e:
        logger.error("URL ingestion failed", document_id=document_id, url=url, error=str(e))
        DOCUMENT_STATUSES[document_id]["status"] = "failed"


def ingest_url(
    url: str,
    background_tasks: BackgroundTasks,
    owner: str = "",
    workspace_id: str = "",
) -> DocumentUploadResponse:
    """
    Validates a URL and schedules background ingestion. Returns immediately with
    a document id that can be polled via the existing /status endpoint.
    """
    url = (url or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only http(s) URLs are supported",
        )

    document_id = f"doc_{uuid.uuid4().hex[:8]}"
    DOCUMENT_STATUSES[document_id] = {
        "document_id": document_id,
        "filename": url,  # replaced with the resolved title once fetched
        "file_path": None,
        "status": "processing",
        "chunk_count": 0,
    }
    background_tasks.add_task(process_url_task, document_id, url, owner, workspace_id)

    return DocumentUploadResponse(
        document_id=document_id,
        filename=url,
        status="processing",
        size_bytes=0,
        chunk_count=0,
        created_at=datetime.utcnow(),
    )
