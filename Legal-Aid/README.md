# Legal-Aid (frontend)

This folder contains the **Legal Aid Advisor** frontend (marketing landing page + app dashboard) and Node static server.

**The full project documentation (architecture, setup, API reference, and the watsonx Orchestrate integration) lives in the [repository-root README](../README.md).**

Quick start:

```bash
# 1) backend (from the repo root)
cd legal-aid-tools && python src/api_server.py

# 2) frontend (from this folder)
node server.js
```

| Route         | Page                          |
| ------------- | ----------------------------- |
| `/`           | Landing page (`index.html`)   |
| `/dashboard`  | App dashboard (`dashboard.html`) |

- Landing page: `public/index.html` + `public/css/landing.css` + `public/js/landing.js`
- App dashboard: `public/dashboard.html` + `public/css/app.css` + `public/js/*`

> The chat is a custom UI backed by the FastAPI `/chat` SSE proxy — the embedded watsonx Orchestrate widget is no longer used, and the agent's script is unchanged.
