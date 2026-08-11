# ⚖️ Legal Aid Advisor

An AI-powered legal assistant dashboard: upload a contract, get instant risk-clause detection, then hand the full document to an **IBM watsonx Orchestrate** chatbot (built from an orchestration of **3 agents working together**) for a deep evaluation — all in one place.

> ⚠️ **Disclaimer:** This project is a demonstration tool. Output from the chatbot is general information, **not legal advice**. Always consult a licensed attorney for real decisions.

---

## ✨ Features

| | |
|---|---|
| 💬 **AI Legal Chatbot** | Embedded IBM watsonx Orchestrate chat — an orchestration that combines **three specialized agents** (triage, contract analysis, compliance) so one conversation routes each question to the right expertise |
| 📄 **Contract Review** | Drag-and-drop a PDF or DOCX → text is extracted server-side and scanned for **9 risk-clause patterns** (auto-renewal, indemnification, unlimited liability, …) |
| ⚖️ **Evaluate with Advisor** | One click sends the *whole extracted contract* into the chatbot, which reviews risk, flags one-sided terms, and suggests negotiation points — right in the chat where you can follow up |
| 📊 **Live Analytics** | A sidebar tracks every chat message in real time (questions, categories, risk flags) via a DOM observer on the chat widget; a global Analytics view aggregates everything across sessions |
| 🗂️ **Session History** | Every session (messages + contract uploads) is stored and browsable; full conversation logs with categories |
| 🔌 **MCP Server for IBM Bob** | The same text-extraction core is exposed as a Model Context Protocol tool so the IBM Bob coding assistant can parse contracts directly |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser — http://localhost:3000                                  │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  Chat    │  │ Analytics  │  │ Contract     │  │ Sessions /│  │
│  │ (WxO     │  │ (global    │  │ Review       │  │ Settings  │  │
│  │  embed)  │  │  KPIs)     │  │ + Evaluate   │  │           │  │
│  └────┬─────┘  └─────┬──────┘  └──────┬───────┘  └─────┬─────┘  │
└───────┼──────────────┼────────────────┼─────────────────┼───────┘
        │              │                │                 │
        ▼              ▼                ▼                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Node.js  server.js  :3000   (static SPA server — vanilla JS)     │
│  public/js/wxochat.js  programmatically drives the chat widget    │
└───────────────────────────────┬──────────────────────────────────┘
                                │  REST API (localhost:8000)
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Python  FastAPI  legal-aid-tools/src/api_server.py  :8000       │
│  POST /parse-contract  ·  /sessions CRUD  ·  /analytics/summary  │
│  ·  /health  (sessions stored in memory)                         │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼  PDF/DOCX extraction
┌──────────────────────────────────────────────────────────────────┐
│  legal-aid-tools/src/extractor.py                                │
│  pypdf → pdfplumber (PDF)  ·  python-docx (DOCX)  ·  max 10 MB   │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼  chat responses
┌──────────────────────────────────────────────────────────────────┐
│  IBM watsonx Orchestrate (au-syd)                                │
│  Embed flow: wxoLoader.js → instance API → 3-agent orchestration │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🧠 How the chatbot works — watsonx Orchestrate & the 3 agents

The chat panel embeds the official **watsonx Orchestrate** widget (no iframe — it renders directly into the page DOM, which is what lets the app observe and even *drive* it programmatically). The widget is configured in [`public/js/views/chat.js`](Legal-Aid/public/js/views/chat.js) with:

- an **orchestration ID** (the workspace instance),
- an **agent ID** (the entry agent), and
- the **CRN** + regional host URL.

The orchestration itself is built in IBM Cloud and combines **three agents working together**. Update this table with your actual agent names/roles:

| # | Agent (example) | Responsibility (example) |
|---|---|---|
| 1 | **Triage / Intake** | Understands the question and routes it to the right specialist |
| 2 | **Contract Analyst** | Reviews clauses, spots risks, extracts obligations |
| 3 | **Compliance Advisor** | Checks regulations (tenant rights, data protection, …) |

*Edit this section to match your exact orchestration in IBM Cloud — the dashboard works regardless of the agent split, because it talks to the orchestration as one entry point.*

**How the frontend integrates:**

- **Observing** — `views/chat.js` attaches a `MutationObserver` to the widget root and watches for new message nodes (`userRequest` / `agentResponse`), feeding the Live Analytics sidebar and session log in real time.
- **Driving** — `wxochat.js` can *send* a message on the user's behalf: it opens the launcher, finds the TipTap editor input, injects text as block elements, and clicks send. This powers **Evaluate with Advisor** (it types the contract + evaluation prompt into the chat and lets you keep the conversation going).
- **Fallback** — if the widget is unreachable (offline, widget upgrade), the evaluation prompt is copied to the clipboard so nothing is lost.

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS SPA (no framework), hand-rolled router, CSS design tokens |
| Frontend server | Node.js `http` module (zero dependencies) |
| Backend | Python 3 · FastAPI · Uvicorn · Pydantic |
| Extraction | pypdf, pdfplumber, python-docx |
| AI | IBM watsonx Orchestrate (embedded chat + 3-agent orchestration) |
| Extras | MCP server for IBM Bob (Model Context Protocol) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (any modern LTS)
- **Python 3.10+** with `pip`
- An internet connection (the chat widget loads from IBM Cloud)

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

### 3 — Open the dashboard

```
http://localhost:3000
```

The header shows **Connected** when the backend is reachable (it polls `/health` every 15 s).

---

## 📁 Project Structure

```
attorney/                          ← repository root
├── README.md
├── Sample_Service_Agreement.pdf   ← sample contract for testing
├── Legal-Aid/                     ← dashboard (frontend + Node server)
│   ├── server.js                  ← static file server (port 3000)
│   ├── legal-aid-advisor-dashboard.html ← legacy single-file prototype (superseded)
│   └── public/
│       ├── index.html             ← SPA shell
│       ├── css/app.css            ← design system + layout
│       └── js/
│           ├── api.js             ← fetch wrapper for the FastAPI backend
│           ├── utils.js           ← shared helpers (toast, charts, classify)
│           ├── wxochat.js         ← programmatic driver for the WxO chat widget
│           ├── app.js             ← SPA router + bootstrap
│           └── views/
│               ├── chat.js        ← WxO embed + live analytics sidebar
│               ├── analytics.js   ← global KPI dashboard
│               ├── contracts.js   ← upload + risk detection + Evaluate with Advisor
│               ├── sessions.js    ← session history + detail
│               └── settings.js    ← config + API health check
└── legal-aid-tools/               ← Python backend + MCP server
    ├── requirements.txt
    ├── src/
    │   ├── extractor.py           ← PDF/DOCX extraction core (shared)
    │   ├── api_server.py          ← FastAPI backend (sessions, analytics, parsing)
    │   ├── http_server.py         ← minimal single-endpoint parser
    │   └── server.py              ← MCP server for IBM Bob
```

---

## 🔌 API Reference

All endpoints are served by the FastAPI backend on port 8000 (interactive docs at `/docs`).

| Method | Endpoint | Description |
|---|---|---|
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
3. The app switches to the Chat view and programmatically sends the document (first 8,000 characters) with a review prompt to the watsonx Orchestrate chatbot.
4. The advisor replies in the chat — ask follow-ups, and everything is recorded to the session and analytics.

---

## 🔒 Security Notes

- **No secrets in the repo.** The WxO orchestration ID / agent ID / CRN in `chat.js` are *embed identifiers* — they are client-side by design (any site visitor can read them) and are needed for the public embed to work. If you add credentials later (API keys, IAM tokens), **keep them out of the repo** — use environment variables.
- **Sessions are in-memory** in the Python process and reset on restart. For persistence, swap the `_sessions` dict for SQLite/PostgreSQL.
- **No OCR.** Scanned/image-only PDFs return a clear error.
- CORS is wide open (`allow_origins=["*"]`) — fine for local dev, restrict it before any public deployment.

---

## 🧭 Known Limitations & Roadmap

- [ ] Persist sessions to a database (SQLite first)
- [ ] Server-side risk detection (currently client-side regex)
- [ ] OCR support for scanned PDFs
- [ ] Configurable evaluation prompt (focus areas, jurisdiction)
- [ ] Stream the advisor evaluation into the Contract Review view (via the orchestrate REST API)
- [ ] Docker compose for one-command startup
- [ ] Tests (frontend + backend)

---

## 📄 License

MIT — see each subproject for details. This is a demo; the chatbot output is not legal advice.
