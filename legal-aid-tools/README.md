# legal-aid-tools

MCP server providing legal document utilities for IBM Bob.

## Tools

### `parse_contract_document`

Extracts all plain text from a contract file (PDF or DOCX).

| Parameter | Type | Description |
|---|---|---|
| `file_path` | `string` | Absolute or relative path to a `.pdf` or `.docx` file |

**Returns:** extracted plain text as a string, or `"ERROR: ..."` on failure.

**Limits:**
- Maximum file size: **10 MB**
- Supported formats: `.pdf`, `.docx`

**PDF extraction strategy:**
1. Tries **pypdf** first (fast, works for most standard PDFs)
2. Falls back to **pdfplumber** when pypdf finds no text (handles complex layouts)
3. Returns an error if neither library finds text (scanned / image-only PDF)

## Setup

```bash
cd legal-aid-tools
pip install -r requirements.txt
```

## Running manually (for testing)

```bash
python src/server.py
```

## MCP registration

The server is registered in `~/.bob/settings/mcp.json` under the key `legal-aid-tools`.
