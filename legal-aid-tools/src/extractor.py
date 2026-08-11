"""
extractor.py — shared extraction core
Used by both the MCP server (server.py) and the HTTP server (http_server.py).
"""

import sys
from pathlib import Path

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


# ──────────────────────────────────────────────
# Format-specific extractors
# ──────────────────────────────────────────────

def _extract_pdf(path: Path) -> str:
    """
    Attempt 1 — pypdf (fast, handles most text-layer PDFs).
    Attempt 2 — pdfplumber (richer layout reconstruction).
    Raises ValueError when neither library finds text (scanned / image-only PDF).
    """
    # --- pypdf ---
    try:
        import pypdf  # noqa: PLC0415

        reader = pypdf.PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n".join(pages).strip()
        if text:
            return text
    except Exception as exc:
        print(f"[extractor] pypdf error: {exc}", file=sys.stderr)

    # --- pdfplumber ---
    try:
        import pdfplumber  # noqa: PLC0415

        with pdfplumber.open(str(path)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        text = "\n".join(pages).strip()
        if text:
            return text
    except Exception as exc:
        print(f"[extractor] pdfplumber error: {exc}", file=sys.stderr)

    raise ValueError(
        "No extractable text found. The PDF may be scanned or image-only. "
        "OCR is required to process this file."
    )


def _extract_docx(path: Path) -> str:
    """Extract paragraph text from a DOCX file."""
    try:
        from docx import Document  # noqa: PLC0415

        doc = Document(str(path))
        text = "\n".join(para.text for para in doc.paragraphs).strip()
        return text
    except Exception as exc:
        raise ValueError(f"Failed to read DOCX file: {exc}") from exc


# ──────────────────────────────────────────────
# Public entry-point
# ──────────────────────────────────────────────

def parse_contract(file_path: str) -> str:
    """
    Validate, dispatch, and extract text from a PDF or DOCX file.
    Always returns a plain string; errors are prefixed with 'ERROR:'.
    """
    path = Path(file_path).expanduser()

    if not path.exists():
        return f"ERROR: File not found: {file_path}"
    if not path.is_file():
        return f"ERROR: Path is not a file: {file_path}"

    file_size = path.stat().st_size
    if file_size > MAX_FILE_BYTES:
        size_mb = file_size / (1024 * 1024)
        limit_mb = MAX_FILE_BYTES // (1024 * 1024)
        return (
            f"ERROR: File is too large ({size_mb:.1f} MB). "
            f"Maximum allowed size is {limit_mb} MB."
        )

    suffix = path.suffix.lower()
    try:
        if suffix == ".pdf":
            return _extract_pdf(path)
        elif suffix in {".docx", ".docm"}:
            return _extract_docx(path)
        else:
            return (
                f"ERROR: Unsupported file format '{path.suffix}'. "
                "Only .pdf and .docx files are supported."
            )
    except ValueError as exc:
        return f"ERROR: {exc}"
    except Exception as exc:
        return f"ERROR: Unexpected error: {type(exc).__name__}: {exc}"


def parse_contract_bytes(data: bytes, filename: str) -> str:
    """
    Extract text from an in-memory file upload.
    Writes to a NamedTemporaryFile, delegates to parse_contract(), cleans up.
    """
    import tempfile, os  # noqa: PLC0415, E401

    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".docx", ".docm"}:
        return (
            f"ERROR: Unsupported file format '{suffix}'. "
            "Only .pdf and .docx files are supported."
        )

    if len(data) > MAX_FILE_BYTES:
        size_mb = len(data) / (1024 * 1024)
        limit_mb = MAX_FILE_BYTES // (1024 * 1024)
        return (
            f"ERROR: File is too large ({size_mb:.1f} MB). "
            f"Maximum allowed size is {limit_mb} MB."
        )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        return parse_contract(tmp_path)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
