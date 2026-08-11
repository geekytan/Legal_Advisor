#!/usr/bin/env python3
"""
legal-aid-tools MCP server
Exposes legal document utilities to IBM Bob.

Requires: mcp>=2.0.0, pypdf, pdfplumber, python-docx
"""

import asyncio
import sys
from pathlib import Path

import mcp.types as types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from extractor import parse_contract  # shared extraction core

# ──────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────
TOOL_NAME = "parse_contract_document"
TOOL_DESCRIPTION = (
    "Extract all plain text from a contract document (PDF or DOCX). "
    "Accepts an absolute or workspace-relative path to a .pdf or .docx file "
    "and returns the extracted text as a single string. "
    "Files over 10 MB are rejected. Scanned/image-only PDFs return an error "
    "with guidance to use OCR."
)
TOOL_INPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "file_path": {
            "type": "string",
            "description": (
                "Absolute or relative path to the PDF or DOCX file to parse."
            ),
        }
    },
    "required": ["file_path"],
    "additionalProperties": False,
}



# ──────────────────────────────────────────────
# MCP server wiring (mcp 2.x API)
# ──────────────────────────────────────────────

async def _on_list_tools(_ctx, _params) -> types.ListToolsResult:
    return types.ListToolsResult(
        tools=[
            types.Tool(
                name=TOOL_NAME,
                description=TOOL_DESCRIPTION,
                inputSchema=TOOL_INPUT_SCHEMA,
            )
        ]
    )


async def _on_call_tool(_ctx, params: types.CallToolRequestParams) -> types.CallToolResult:
    if params.name != TOOL_NAME:
        return types.CallToolResult(
            content=[
                types.TextContent(type="text", text=f"ERROR: Unknown tool '{params.name}'")
            ],
            isError=True,
        )

    # params.arguments is a dict
    args = params.arguments or {}
    file_path = args.get("file_path", "")
    if not file_path:
        return types.CallToolResult(
            content=[
                types.TextContent(
                    type="text", text="ERROR: 'file_path' argument is required."
                )
            ],
            isError=True,
        )

    result_text = parse_contract(str(file_path))
    is_error = result_text.startswith("ERROR:")

    return types.CallToolResult(
        content=[types.TextContent(type="text", text=result_text)],
        isError=is_error,
    )


server = Server(
    name="legal-aid-tools",
    version="1.0.0",
    description="Legal document utilities — extract text from contracts.",
    on_list_tools=_on_list_tools,
    on_call_tool=_on_call_tool,
)


# ──────────────────────────────────────────────
# Entry-point
# ──────────────────────────────────────────────

async def main() -> None:
    print("[legal-aid-tools] starting on stdio", file=sys.stderr)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
