"""Ingest failures must reach the user with a reason, not a bare 'failed'."""
import errno
from app.services import document_service as ds


def test_reason_for_disk_full():
    exc = OSError(errno.ENOSPC, "No space left on device")
    assert "disk space" in ds._reason_for(exc).lower()


def test_reason_for_generic():
    assert "went wrong" in ds._reason_for(ValueError("boom")).lower()


def test_extraction_failure_sets_error(monkeypatch):
    doc_id = "doc_test01"
    ds.DOCUMENT_STATUSES[doc_id] = {"document_id": doc_id, "filename": "x.pdf",
                                    "file_path": "x.pdf", "status": "processing", "chunk_count": 0}
    monkeypatch.setattr(ds, "extract_text_from_file", lambda p: ("", False))
    ds.process_document_task(doc_id, "x.pdf", "x.pdf")
    rec = ds.DOCUMENT_STATUSES[doc_id]
    assert rec["status"] == "failed"
    assert "corrupted" in rec["error"].lower()


def test_no_readable_text_is_failure(monkeypatch):
    doc_id = "doc_test02"
    ds.DOCUMENT_STATUSES[doc_id] = {"document_id": doc_id, "filename": "img.png",
                                    "file_path": "img.png", "status": "processing", "chunk_count": 0}
    monkeypatch.setattr(ds, "extract_text_from_file", lambda p: ("x", True))
    monkeypatch.setattr(ds, "chunk_text", lambda *a, **k: [])
    ds.process_document_task(doc_id, "img.png", "img.png")
    rec = ds.DOCUMENT_STATUSES[doc_id]
    assert rec["status"] == "failed"
    assert "no readable text" in rec["error"].lower()


if __name__ == "__main__":
    import sys
    import pytest
    sys.exit(pytest.main([__file__, "-q"]))
