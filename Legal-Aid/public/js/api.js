/**
 * api.js — thin fetch wrapper for the Python FastAPI backend (port 8000).
 * All functions return { ok: true, data } or { ok: false, error }.
 */

const API = (() => {
  const BASE = 'http://localhost:8000';

  async function _req(method, path, body, isForm) {
    try {
      const opts = { method, headers: {} };
      if (body && !isForm) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      } else if (isForm) {
        opts.body = body; // FormData — let browser set Content-Type
      }
      const res = await fetch(BASE + path, opts);
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      return res.ok ? { ok: true, data } : { ok: false, error: data?.error || data?.detail || `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return {
    health:           ()           => _req('GET',    '/health'),
    analyticsSummary: ()           => _req('GET',    '/analytics/summary'),

    createSession:    (label)      => _req('POST',   '/sessions', { label }),
    listSessions:     ()           => _req('GET',    '/sessions'),
    getSession:       (id)         => _req('GET',    `/sessions/${id}`),
    deleteSession:    (id)         => _req('DELETE', `/sessions/${id}`),
    addEvent:         (id, event)  => _req('POST',   `/sessions/${id}/events`, event),

    parseContract: (file, sessionId) => {
      const fd = new FormData();
      fd.append('file', file);
      const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
      return _req('POST', `/parse-contract${qs}`, fd, true);
    },
  };
})();
