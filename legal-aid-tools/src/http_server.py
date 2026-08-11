#!/usr/bin/env python3
"""
http_server.py — FastAPI HTTP wrapper for parse_contract_document.

Exposes a single endpoint:
  POST /parse-contract
    Content-Type: multipart/form-data
    Field       : file  (PDF or DOCX, max 10 MB)

Returns JSON:
  { "success": true,  "text": "<extracted text>" }
  { "success": false, "error": "<reason>" }

Run:
  python src/http_server.py
  # or:
  uvicorn src.http_server:app --host 0.0.0.0 --port 8000 --reload
"""

import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, UploadFile
from starlette import status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ── resolve src/ so extractor.py is importable regardless of cwd ────────────
sys.path.insert(0, str(Path(__file__).parent))
from extractor import MAX_FILE_BYTES, parse_contract_bytes  # noqa: E402


# ──────────────────────────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Legal Aid Tools — Contract Parser",
    description=(
        "Extracts plain text from contract documents (PDF or DOCX). "
        "Upload the file via multipart/form-data. "
        "Files larger than 10 MB or in unsupported formats are rejected. "
        "Scanned / image-only PDFs return an error with OCR guidance."
    ),
    version="1.0.0",
    contact={
        "name": "Legal Aid Tools",
    },
    license_info={
        "name": "MIT",
    },
)


# ──────────────────────────────────────────────────────────────────────────────
# Response schemas (Pydantic — drives the OpenAPI spec)
# ──────────────────────────────────────────────────────────────────────────────

class ParseSuccess(BaseModel):
    success: bool = True
    text: str

    model_config = {
        "json_schema_extra": {
            "example": {
                "success": True,
                "text": "THIS AGREEMENT is entered into as of January 1, 2025...",
            }
        }
    }


class ParseError(BaseModel):
    success: bool = False
    error: str

    model_config = {
        "json_schema_extra": {
            "example": {
                "success": False,
                "error": "No extractable text found. The PDF may be scanned or image-only.",
            }
        }
    }


# ──────────────────────────────────────────────────────────────────────────────
# Endpoint
# ──────────────────────────────────────────────────────────────────────────────

@app.post(
    "/parse-contract",
    summary="Extract text from a contract document",
    description=(
        "Upload a PDF or DOCX contract file. "
        "The server extracts all plain text and returns it as a JSON string. "
        "**PDF strategy:** tries pypdf first, falls back to pdfplumber for "
        "complex layouts. Returns an error for scanned / image-only PDFs. "
        "**Size limit:** 10 MB."
    ),
    response_model=ParseSuccess,
    responses={
        200: {
            "description": "Text extracted successfully.",
            "model": ParseSuccess,
        },
        422: {
            "description": (
                "Extraction failed — unsupported format, file too large, "
                "corrupt file, or scanned PDF with no extractable text."
            ),
            "model": ParseError,
        },
    },
    tags=["Contract Parsing"],
)
async def parse_contract(
    file: UploadFile = File(
        ...,
        description="PDF or DOCX contract file to parse (max 10 MB).",
    ),
) -> JSONResponse:
    # ── read upload into memory ───────────────────────────────────────────────
    data = await file.read()
    filename = file.filename or "upload"

    # ── delegate to shared extractor ─────────────────────────────────────────
    result = parse_contract_bytes(data, filename)

    if result.startswith("ERROR:"):
        # Strip the "ERROR: " prefix — the field name already signals failure.
        error_msg = result[len("ERROR: "):]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=ParseError(error=error_msg).model_dump(),
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=ParseSuccess(text=result).model_dump(),
    )


# ──────────────────────────────────────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    summary="Health check",
    description="Returns `{\"status\": \"ok\"}` when the server is running.",
    tags=["Meta"],
    include_in_schema=True,
)
async def health() -> dict:
    return {"status": "ok"}


# ──────────────────────────────────────────────────────────────────────────────
# Entry-point
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "http_server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        app_dir=str(Path(__file__).parent),
    )
