# ⚖️ Legal Aid Advisor

An AI-powered legal assistant: a marketing landing page, an app dashboard with a **custom chat UI** that streams replies from an **IBM watsonx Orchestrate** agent (built from an orchestration of **3 agents working together**), and contract review with instant risk-clause detection — all in one place.

> ⚠️ **Disclaimer:** This project is a demonstration tool. Output from the chatbot is general information, **not legal advice**. Always consult a licensed attorney for real decisions.

---

## ✨ Features

| | |
|---|---|
| 🏠 **Landing page** | Full marketing landing page at `/` — "Justice Chamber" theme, animated chat mockup, risk-library marquee, suggestion chips |
| 💬 **AI Legal Chatbot** | Custom chat UI (no IBM widget) that streams token-by-token from the watsonx Orchestrate agent — an orchestration that combines **three specialized agents** (triage, contract analysis, compliance) so one conversation routes each question to the right expertise |
| 🔁 **Conversation continuity** | Threads are created server-side and stored per dashboard session; refreshing the page resumes the same conversation |
| 📄 **Contract Review** | Drag-and-drop a PDF or DOCX → text is extracted server-side and scanned for **9 risk-clause patterns** (auto-renewal, indemnification, unlimited liability, …) |
| ⚖️ **Evaluate with Advisor** | One click sends the *whole extracted contract* into the chat, which reviews risk, flags one-sided terms, and suggests negotiation points — right in the chat where you can follow up |
| 📊 **Live Analytics** | A sidebar tracks every chat message in real time (questions, categories, risk flags); a global Analytics view aggregates everything across sessions |
| 🗂️ **Session History** | Every session (messages + contract uploads) is stored and browsable; full conversation logs with categories |
| 🔌 **MCP Server for IBM Bob** | The same text-extraction core is exposed as a Model Context Protocol tool so the IBM Bob coding assistant can parse contracts directly |

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Browser — http://localhost:3000                                            │
│  ┌──────────────┐ ┌─────────────┐ ┌────────────────┐ ┌──────────────────┐  │
│  │ Landing page │ │ Dashboard   │ │ Chat view      │ │ Analytics /      │  │
│  │ (marketing,  │ │ (SPA at     │ │ (custom UI +   │ │ Sessions /       │  │
│  │  at /)       │ │ /dashboard) │ │  SSE streaming)│ │ Settings         │  │
│  └──────────────┘ └──────┬──────┘ └────────┬───────┘ └───────┬──────────┘  │
└──────────────────────────┼─────────────────┼──────────────────┼────────────┘
                           └─────────────────┼──────────────────┘
                                             ▼  REST API (localhost:8000)
┌────────────────────────────────────────────────────────────────────────────┐
│  Node.js  server.js  :3000   (static server — vanilla JS, zero deps)       │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Python  FastAPI  legal-aid-tools/src/api_server.py  :8000                 │
│  POST /chat (SSE relay) · /chat/reset · /parse-contract                    │
│  · /sessions CRUD · /analytics/summary · /health  (in-memory store)        │
└──────────────┬────────────────────────────────────┬────────────────────────┘
               │                                    │
               ▼ PDF/DOCX extraction                ▼ chat SSE
┌──────────────────────────────┐   ┌─────────────────────────────────────────┐
│  legal-aid-tools/src/        │   │  IBM watsonx Orchestrate (au-syd)       │
│  extractor.py                │   │  /instances/{id}/orchestrate/runs       │
│  pypdf → pdfplumber → docx   │   │  → stream=true (SSE), thread per session│
└──────────────────────────────┘   └─────────────────────────────────────────┘
```

---

## 🧠 How the chatbot works — watsonx Orchestrate & the 3 agents

The chat is a **fully custom UI** — the official watsonx Orchestrate widget is not used. The dashboard's Chat view is our own dark "Justice Chamber" interface that streams replies token-by-token. The agent itself — its prompts, tools, and orchestration — is untouched and still runs inside watsonx Orchestrate.

**How it connects:**

1. `views/chat.js` sends the user's message via `POST /chat` to the FastAPI backend.
2. The backend creates (or reuses) a **server-side conversation thread** (`POST /instances/{id}/threads`) per dashboard session, then calls `/instances/{id}/orchestrate/runs?stream=true` with the same `X-Ibm-Wo-*` headers the official embed used.
3. The agent's SSE stream (`run.started`, `message.delta`, …) is relayed back 1:1 and rendered by our UI with markdown-lite formatting and a typing indicator.
4. **No credentials anywhere** — the `X-Ibm-Wo-Crn` / `X-Ibm-Wo-Orchestrate-Id` / `X-Ibm-Wo-User-Id` headers are the identity, exactly as with the old embed. Nothing secret lives in the frontend or backend.

The orchestration itself is built in IBM Cloud and combines **three agents working together**. Update this table with your actual agent names/roles:

| # | Agent (example) | Responsibility (example) |
|---|---|---|
| 1 | **Triage / Intake** | Understands the question and routes it to the right specialist |
| 2 | **Contract Analyst** | Reviews clauses, spots risks, extracts obligations |
| 3 | **Compliance Advisor** | Checks regulations (tenant rights, data protection, …) |

*Edit this section to match your exact orchestration in IBM Cloud — the app works regardless of the agent split, because it talks to the orchestration as one entry point.*

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS SPA (no framework), hand-rolled router, CSS design tokens |
| Type | Playfair Display (display serif) · Inter (UI) · IBM Plex Mono (labels) |
| Frontend server | Node.js `http` module (zero dependencies) |
| Backend | Python 3 · FastAPI · Uvicorn · Pydantic |
| Extraction | pypdf, pdfplumber, python-docx |
| AI | IBM watsonx Orchestrate (chat API via backend proxy + 3-agent orchestration) |
| Extras | MCP server for IBM Bob (Model Context Protocol) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (any modern LTS)
- **Python 3.10+** with `pip`
- An internet connection (chat requests go to IBM Cloud)

### 1 — Start the Python backend

```bash
cd legal-aid-tools

# First time only
pip install -r requirements.txt

# Start the API server (also starts the dashboard backend)
python src/api_server.py
# → http://localhost:8000   (Swagger docs: http://localhost:8000/docs)
```

### 2 — Start the Node frontend server

```bash
cd Legal-Aid
node server.js
# → http://localhost:3000
```

### 3 — Open the app

| Route | Page |
|---|---|
| `http://localhost:3000/` | Landing page |
| `http://localhost:3000/dashboard` | App dashboard (chat, analytics, contract review, sessions) |

The dashboard header shows **Connected** when the backend is reachable (it polls `/health` every 15 s).

---

## 📁 Project Structure

```
attorney/                          ← repository root
├── README.md
├── Sample_Service_Agreement.pdf   ← sample contract for testing
├── Legal-Aid/                     ← frontend + Node server
│   ├── server.js                  ← static file server (port 3000, routes / and /dashboard)
│   ├── README.md                  ← frontend quick-start
│   └── public/
│       ├── index.html             ← marketing landing page
│       ├── dashboard.html         ← SPA shell (chat, analytics, contracts, sessions)
│       ├── css/
│       │   ├── app.css            ← design system + dashboard layout
│       │   └── landing.css        ← landing page styles
│       └── js/
│           ├── api.js             ← fetch wrapper for FastAPI + chat streaming + anonymous user id
│           ├── utils.js           ← shared helpers (toast, charts, classify)
│           ├── landing.js         ← landing page interactions (reveals, counters, mockup)
│           ├── app.js             ← SPA router + bootstrap (session persistence)
│           └── views/
│               ├── chat.js        ← custom chat UI + SSE streaming + analytics sidebar
│               ├── analytics.js   ← global KPI dashboard
│               ├── contracts.js   ← upload + risk detection + Evaluate with Advisor
│               ├── sessions.js    ← session history + detail
│               └── settings.js    ← config + API health check
└── legal-aid-tools/               ← Python backend + MCP server
    ├── requirements.txt
    ├── src/
    │   ├── extractor.py           ← PDF/DOCX extraction core (shared)
    │   ├── api_server.py          ← FastAPI backend (chat proxy, sessions, analytics, parsing)
    │   ├── http_server.py         ← minimal single-endpoint parser
    │   └── server.py              ← MCP server for IBM Bob
```

---

## 🔌 API Reference

All endpoints are served by the FastAPI backend on port 8000 (interactive docs at `/docs`).

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/chat` | Send a message to the watsonx Orchestrate agent; returns an SSE stream of `run.started` / `message.delta` events |
| `POST` | `/chat/reset` | Rotate to a fresh conversation thread for a session |
| `POST` | `/parse-contract` | Upload a PDF/DOCX (max 10 MB) → `{ success, text }` |
| `POST` | `/sessions` | Create a session |
| `GET` | `/sessions` | List all sessions (summaries) |
| `GET` | `/sessions/{id}` | Session detail + full event log |
| `POST` | `/sessions/{id}/events` | Append a chat event (`user` / `agent` / `system`) |
| `DELETE` | `/sessions/{id}` | Delete a session |
| `GET` | `/analytics/summary` | Aggregate KPIs across all sessions |
| `GET` | `/health` | Health check |

---

## 🚩 Risk Clause Detectors

The Contract Review panel scans extracted text for these patterns (regex-based, client-side):

| Clause | What it flags |
|---|---|
| Auto-Renewal | Contract may renew automatically without an explicit opt-out |
| Indemnification | Broad indemnity — review the scope carefully |
| Unlimited Liability | No liability cap — exposure may be unrestricted |
| Sole Discretion | One party gets unilateral decision-making rights |
| Liquidated Damages | Pre-set damages — verify the amount is reasonable |
| Perpetual License | License granted in perpetuity |
| Non-Compete | Restriction — check duration and geography |
| Jury Waiver | Waiver of the right to a jury trial |
| Mandatory Arbitration | Disputes must go to arbitration |

---

## ⚖️ The "Evaluate with Advisor" Flow

1. Upload a contract → text is extracted and risk clauses are flagged.
2. Click **⚖️ Evaluate with Advisor**.
3. The app switches to the Chat view and sends the document (first 8,000 characters) with a review prompt through the custom chat.
4. The advisor replies in the chat — ask follow-ups, and everything is recorded to the session and analytics.

---

## 🔒 Security Notes

- **No secrets in the repo.** The WxO orchestration ID / agent ID / CRN live in `legal-aid-tools/src/api_server.py` (`WXO_*` constants) and are *embed identifiers*, not credentials — the API authenticates with the `X-Ibm-Wo-*` headers, exactly like the official embed. If you add credentials later (API keys, IAM tokens), **keep them out of the repo** — use environment variables.
- **Sessions are in-memory** in the Python process and reset on restart. For persistence, swap the `_sessions` dict for SQLite/PostgreSQL.
- **No OCR.** Scanned/image-only PDFs return a clear error.
- CORS is wide open (`allow_origins=["*"]`) — fine for local dev, restrict it before any public deployment.

---

## 🧭 Known Limitations & Roadmap

- [ ] Persist sessions to a database (SQLite first)
- [ ] Server-side risk detection (currently client-side regex)
- [ ] OCR support for scanned PDFs
- [ ] Configurable evaluation prompt (focus areas, jurisdiction)
- [ ] Render markdown tables in chat replies (markdown-lite currently shows pipes)
- [ ] Agent-memory button in the chat header (view / clear agent memory)
- [ ] Docker compose for one-command startup
- [ ] Tests (frontend + backend)

---

## 📄 License

MIT — see each subproject for details. This is a demo; the chatbot output is not legal advice.
