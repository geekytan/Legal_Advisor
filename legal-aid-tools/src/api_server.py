#!/usr/bin/env python3
"""
api_server.py — Extended FastAPI backend for the Legal Aid Advisor Dashboard.

Endpoints:
  POST /parse-contract          — upload PDF/DOCX, extract text, record session event
  GET  /health                  — health check
  POST /sessions                — create a new session
  GET  /sessions                — list all sessions (summary)
  GET  /sessions/{id}           — get full session detail (events + analytics)
  POST /sessions/{id}/events    — append a chat event to a session
  GET  /analytics/summary       — aggregate analytics across all sessions
  DELETE /sessions/{id}         — delete a session
  POST /chat                    — stream a message to the watsonx Orchestrate agent (SSE)
  POST /chat/reset              — start a fresh conversation thread for a session

Run:
  python src/api_server.py
  # or:
  uvicorn src.api_server:app --host 0.0.0.0 --port 8000 --reload
"""

import sys, uuid, json, socket
import urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional, List

import anyio
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).parent))
from extractor import MAX_FILE_BYTES, parse_contract_bytes


# ──────────────────────────────────────────────────────────────────────────────
# watsonx Orchestrate agent connection (no credentials needed — the embed uses
# the X-Ibm-Wo-* headers as its identity, exactly like the official widget).
# ──────────────────────────────────────────────────────────────────────────────

WXO_API_HOST    = "https://api.au-syd.watson-orchestrate.cloud.ibm.com"
WXO_INSTANCE    = "e20e6693-dff2-428e-89d1-8dc79978a62a"
WXO_ORCH_ID     = "41bb59990fd34b5081873a229f14864f_e20e6693-dff2-428e-89d1-8dc79978a62a"
WXO_CRN         = "crn:v1:bluemix:public:watsonx-orchestrate:au-syd:a/41bb59990fd34b5081873a229f14864f:e20e6693-dff2-428e-89d1-8dc79978a62a::"
WXO_AGENT_ID    = "ed18d61c-a3a7-495b-8e87-21c59f4c19f5"
WXO_STREAM_MS   = 180000   # stream_timeout used by the official widget

# ──────────────────────────────────────────────────────────────────────────────
# In-memory store  (replace with a DB in production)
# ──────────────────────────────────────────────────────────────────────────────

_sessions: dict[str, dict] = {}   # id → session dict


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    label: Optional[str] = None

class ChatEvent(BaseModel):
    role: Literal["user", "agent"]
    text: str
    category: Optional[Literal["qa", "contract", "compliance", "research"]] = "qa"
    risk_flags: Optional[List[dict]] = Field(default_factory=list)

class ParseSuccess(BaseModel):
    success: bool = True
    text: str

class ParseError(BaseModel):
    success: bool = False
    error: str

class ChatRequest(BaseModel):
    session_id: str
    user_id: str
    message: str
    title: Optional[str] = None

class ChatResetRequest(BaseModel):
    session_id: str


# ──────────────────────────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Legal Aid Advisor — API",
    version="2.0.0",
    description="Backend API for the Legal Aid Advisor Dashboard.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
# Health
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Meta"])
async def health():
    return {"status": "ok", "sessions": len(_sessions)}


# ──────────────────────────────────────────────────────────────────────────────
# Contract parsing
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/parse-contract", tags=["Contract Parsing"])
async def parse_contract(
    file: UploadFile = File(...),
    session_id: Optional[str] = None,
):
    data = await file.read()
    filename = file.filename or "upload"
    result = parse_contract_bytes(data, filename)

    if result.startswith("ERROR:"):
        error_msg = result[len("ERROR: "):]
        # Record as an event if session given
        if session_id and session_id in _sessions:
            _sessions[session_id]["events"].append({
                "id": str(uuid.uuid4()),
                "ts": _now(),
                "role": "system",
                "text": f"Contract upload failed: {error_msg}",
                "category": "contract",
                "risk_flags": [],
            })
        return JSONResponse(status_code=422, content=ParseError(error=error_msg).model_dump())

    # Record successful parse as an event
    if session_id and session_id in _sessions:
        _sessions[session_id]["events"].append({
            "id": str(uuid.uuid4()),
            "ts": _now(),
            "role": "system",
            "text": f"Contract '{filename}' parsed successfully ({len(result)} chars).",
            "category": "contract",
            "risk_flags": [],
        })
        _sessions[session_id]["contracts_parsed"] = _sessions[session_id].get("contracts_parsed", 0) + 1
        _sessions[session_id]["updated_at"] = _now()

    return JSONResponse(status_code=200, content=ParseSuccess(text=result).model_dump())


# ──────────────────────────────────────────────────────────────────────────────
# Sessions
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/sessions", tags=["Sessions"], status_code=201)
async def create_session(body: SessionCreate = SessionCreate()):
    sid = str(uuid.uuid4())
    _sessions[sid] = {
        "id": sid,
        "label": body.label or f"Session {len(_sessions) + 1}",
        "created_at": _now(),
        "updated_at": _now(),
        "events": [],
        "contracts_parsed": 0,
        "cats": {"qa": 0, "contract": 0, "compliance": 0, "research": 0},
        "risk_flags": 0,
        "thread_id": None,   # watsonx Orchestrate conversation thread for this session
    }
    return _sessions[sid]


@app.get("/sessions", tags=["Sessions"])
async def list_sessions():
    summaries = []
    for s in sorted(_sessions.values(), key=lambda x: x["created_at"], reverse=True):
        summaries.append({
            "id": s["id"],
            "label": s["label"],
            "created_at": s["created_at"],
            "updated_at": s["updated_at"],
            "message_count": len([e for e in s["events"] if e["role"] == "user"]),
            "risk_flags": s["risk_flags"],
            "contracts_parsed": s["contracts_parsed"],
        })
    return summaries


@app.get("/sessions/{session_id}", tags=["Sessions"])
async def get_session(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return _sessions[session_id]


@app.delete("/sessions/{session_id}", tags=["Sessions"], status_code=204)
async def delete_session(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    del _sessions[session_id]


@app.post("/sessions/{session_id}/events", tags=["Sessions"], status_code=201)
async def add_event(session_id: str, event: ChatEvent):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    s = _sessions[session_id]
    ev = {
        "id": str(uuid.uuid4()),
        "ts": _now(),
        "role": event.role,
        "text": event.text,
        "category": event.category or "qa",
        "risk_flags": event.risk_flags or [],
    }
    s["events"].append(ev)
    s["updated_at"] = _now()

    if event.role == "user":
        cat = event.category or "qa"
        s["cats"][cat] = s["cats"].get(cat, 0) + 1

    if event.risk_flags:
        s["risk_flags"] = s.get("risk_flags", 0) + len(event.risk_flags)

    return ev


# ──────────────────────────────────────────────────────────────────────────────
# Chat — watsonx Orchestrate proxy (no credentials; X-Ibm-Wo-* headers are the
# identity, exactly like the official embedded widget). Streams SSE back to the
# frontend 1:1 so the client does the (defensive) event parsing.
# ──────────────────────────────────────────────────────────────────────────────

def _wxo_headers(user_id: str) -> dict:
    return {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "x-ibm-wo-orchestrate-id": WXO_ORCH_ID,
        "x-ibm-wo-user-id": user_id,
        "x-ibm-wo-crn": WXO_CRN,
        "User-Agent": "LegalAidAdvisor/1.0",
    }


def _wxo_error(e: urllib.error.HTTPError) -> HTTPException:
    try:
        payload = json.loads(e.read().decode("utf-8", "replace"))
        msg = payload.get("message") or payload.get("detail") or payload.get("error") or f"HTTP {e.code}"
    except Exception:
        msg = f"watsonx Orchestrate error (HTTP {e.code})"
    return HTTPException(status_code=e.code, detail=msg)


def _create_thread(user_id: str, title: str) -> str:
    """Create a server-side conversation thread and return its id."""
    url = f"{WXO_API_HOST}/instances/{WXO_INSTANCE}/threads"
    body = json.dumps({"title": title or "Legal Aid conversation", "agent_id": WXO_AGENT_ID}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=_wxo_headers(user_id), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("thread_id")
    except urllib.error.HTTPError as e:
        raise _wxo_error(e)


@app.post("/chat", tags=["Chat"])
async def chat(body: ChatRequest):
    s = _sessions.get(body.session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not body.message.strip():
        raise HTTPException(status_code=422, detail="Message must not be empty")

    # Ensure this dashboard session has a live conversation thread
    if not s.get("thread_id"):
        tid = await anyio.to_thread.run_sync(
            _create_thread, body.user_id, body.title or body.message.strip()[:60]
        )
        s["thread_id"] = tid
        s["updated_at"] = _now()

    url = (f"{WXO_API_HOST}/instances/{WXO_INSTANCE}/orchestrate/runs"
           f"?stream=true&stream_timeout={WXO_STREAM_MS}&multiple_content=true")
    payload = {
        "message": {"role": "user", "content": body.message, "additional_properties": {}},
        "context": {},
        "agent_id": WXO_AGENT_ID,
        "thread_id": s["thread_id"],
        "environment_id": "",
    }
    hdrs = _wxo_headers(body.user_id)
    hdrs["Accept"] = "text/event-stream"
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=hdrs, method="POST")

    try:
        upstream = await anyio.to_thread.run_sync(lambda: urllib.request.urlopen(req, timeout=220))
    except urllib.error.HTTPError as e:
        raise _wxo_error(e)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"watsonx Orchestrate unreachable: {e}")

    async def event_stream():
        try:
            while True:
                line = await anyio.to_thread.run_sync(upstream.readline)
                if not line:
                    break
                yield line.decode("utf-8", "replace")
        except (socket.timeout, TimeoutError):
            pass
        finally:
            upstream.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/chat/reset", tags=["Chat"])
async def chat_reset(body: ChatResetRequest):
    s = _sessions.get(body.session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Session not found")
    s["thread_id"] = None
    s["updated_at"] = _now()
    return {"ok": True, "session_id": s["id"]}


# ──────────────────────────────────────────────────────────────────────────────
# Aggregate analytics
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/analytics/summary", tags=["Analytics"])
async def analytics_summary():
    total_sessions = len(_sessions)
    total_messages = 0
    total_risks = 0
    total_contracts = 0
    cats = {"qa": 0, "contract": 0, "compliance": 0, "research": 0}

    for s in _sessions.values():
        total_messages += len([e for e in s["events"] if e["role"] == "user"])
        total_risks += s.get("risk_flags", 0)
        total_contracts += s.get("contracts_parsed", 0)
        for k in cats:
            cats[k] += s["cats"].get(k, 0)

    return {
        "total_sessions": total_sessions,
        "total_messages": total_messages,
        "total_risk_flags": total_risks,
        "total_contracts_parsed": total_contracts,
        "category_breakdown": cats,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Entry-point
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        app_dir=str(Path(__file__).parent),
    )
