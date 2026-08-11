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

    /* ── Custom chat (watsonx Orchestrate proxy) ──────────────────────────── */
    // Returns { ok, res } where res is the fetch Response (SSE stream).
    // The caller owns reading res.body and parsing the event lines.
    chatStream: (sessionId, userId, message, title) => {
      const body = JSON.stringify({
        session_id: sessionId, user_id: userId, message,
        title: title || undefined,
      });
      return fetch(BASE + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).then(res => res.ok ? { ok: true, res } : res.json().catch(() => null).then(d => ({ ok: false, error: d?.detail || d?.message || `HTTP ${res.status}` })))
        .catch(e => ({ ok: false, error: e.message }));
    },

    resetChat: (sessionId) => _req('POST', '/chat/reset', { session_id: sessionId }),

    /* Stable anonymous user id (mirrors the widget's behaviour). */
    getUserId: () => {
      const KEY = 'laa_anon_user_id';
      let id = localStorage.getItem(KEY);
      if (!id) {
        id = 'anonymous-' + (crypto.randomUUID ? crypto.randomUUID() :
          'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          }));
        localStorage.setItem(KEY, id);
      }
      return id;
    },
  };
})();
