/**
 * views/sessions.js — Session history list + detail view.
 * Renders into #view-sessions.
 */

const SessionsView = (() => {
  function render(container, state) {
    container.innerHTML = `
<div class="page-bar">
  <div>
    <h1>Session History</h1>
    <div class="sub">All chat sessions in this server instance</div>
  </div>
  <button class="btn primary" id="newSessionBtn">+ New Session</button>
</div>

<div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;flex:1">
  <div class="section-card">
    <div class="section-title">Sessions</div>
    <div id="sessionsTableWrap">
      <p class="empty-state" style="padding:24px">Loading…</p>
    </div>
  </div>
  <div id="sessionDetailWrap" style="display:none"></div>
</div>`;

    document.getElementById('newSessionBtn').addEventListener('click', () => _createSession(state));
    _loadSessions(state);
  }

  async function _loadSessions(state) {
    const r = await API.listSessions();
    const wrap = document.getElementById('sessionsTableWrap');
    if (!r.ok) { wrap.innerHTML = `<p class="empty-state" style="padding:24px">Failed: ${esc(r.error)}</p>`; return; }
    const sessions = r.data || [];

    if (!sessions.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🗂️</div>No sessions yet. Start chatting to create one.</div>`;
      return;
    }

    wrap.innerHTML = `<table class="data-table">
      <thead><tr>
        <th>Label</th><th>Started</th><th>Last Active</th>
        <th>Messages</th><th>Risk Flags</th><th>Contracts</th><th></th>
      </tr></thead>
      <tbody>
        ${sessions.map(s => `<tr>
          <td><strong>${esc(s.label)}</strong>${s.id === state?.session?.id ? ' <span class="badge" style="background:var(--blue)">Active</span>' : ''}</td>
          <td>${fmtDateTime(s.created_at)}</td>
          <td>${fmtDateTime(s.updated_at)}</td>
          <td>${s.message_count}</td>
          <td>${s.risk_flags > 0 ? `<span style="color:var(--danger);font-weight:600">${s.risk_flags}</span>` : '0'}</td>
          <td>${s.contracts_parsed}</td>
          <td style="display:flex;gap:6px">
            <button class="btn" data-action="view" data-id="${esc(s.id)}">View</button>
            <button class="btn danger" data-action="delete" data-id="${esc(s.id)}">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;

    wrap.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'view')   _viewSession(id);
      if (btn.dataset.action === 'delete') await _deleteSession(id, state);
    });
  }

  async function _viewSession(id) {
    const r = await API.getSession(id);
    const wrap = document.getElementById('sessionDetailWrap');
    if (!r.ok) { toast('Failed to load session', 'error'); return; }
    const s = r.data;

    const userMsgs = (s.events || []).filter(e => e.role === 'user');

    wrap.style.display = 'block';
    wrap.innerHTML = `
<div class="section-card">
  <div class="section-title">${esc(s.label)} — Conversation Log</div>
  <div class="section-body">
    ${!userMsgs.length
      ? '<p class="empty-state" style="padding:12px 0">No messages in this session.</p>'
      : `<table class="data-table">
          <thead><tr><th>Time</th><th>Category</th><th>Message</th></tr></thead>
          <tbody>
            ${userMsgs.map(e=>`<tr>
              <td style="white-space:nowrap">${fmtDateTime(e.ts)}</td>
              <td>${catBadge(e.category)}</td>
              <td>${esc(e.text)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`}
  </div>
</div>`;

    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function _deleteSession(id, state) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    const r = await API.deleteSession(id);
    if (!r.ok) { toast('Delete failed: ' + r.error, 'error'); return; }
    toast('Session deleted', 'success');
    if (state?.session?.id === id) {
      state.session.id = null;
      localStorage.removeItem('laa_session_id');
    }
    _loadSessions(state);
    document.getElementById('sessionDetailWrap').style.display = 'none';
  }

  async function _createSession(state) {
    const label = `Session ${new Date().toLocaleString()}`;
    const r = await API.createSession(label);
    if (!r.ok) { toast('Failed to create session: ' + r.error, 'error'); return; }
    state.session.id = r.data.id;
    state.session.label = r.data.label;
    localStorage.setItem('laa_session_id', r.data.id);
    toast('Session created: ' + r.data.label, 'success');
    ChatView.updateSessionLabel(r.data.label);
    document.getElementById('navSessionLabel').textContent = r.data.label;
    _loadSessions(state);
  }

  return { render };
})();
