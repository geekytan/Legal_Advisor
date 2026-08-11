/**
 * views/settings.js — Configuration & connection info panel.
 * Renders into #view-settings.
 */

const SettingsView = (() => {
  function render(container, state) {
    container.innerHTML = `
<div class="page-bar">
  <div><h1>Settings</h1><div class="sub">Connection configuration and system info</div></div>
</div>

<div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;flex:1">

  <div class="section-card">
    <div class="section-title">watsonx Orchestrate</div>
    <div class="section-body">
      <table class="data-table">
        <tbody>
          <tr><td style="color:var(--muted);width:180px">Orchestration ID</td><td><code class="code">41bb59990fd34b5081873a229f14864f_e20e6693-dff2-428e-89d1-8dc79978a62a</code></td></tr>
          <tr><td style="color:var(--muted)">Agent ID</td><td><code class="code">ed18d61c-a3a7-495b-8e87-21c59f4c19f5</code></td></tr>
          <tr><td style="color:var(--muted)">Region</td><td>au-syd (Sydney)</td></tr>
          <tr><td style="color:var(--muted)">Platform</td><td>ibmcloud</td></tr>
          <tr><td style="color:var(--muted)">Host URL</td><td><a class="link" href="https://au-syd.watson-orchestrate.cloud.ibm.com" target="_blank">https://au-syd.watson-orchestrate.cloud.ibm.com</a></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section-card">
    <div class="section-title">Backend API</div>
    <div class="section-body">
      <table class="data-table">
        <tbody>
          <tr><td style="color:var(--muted);width:180px">Base URL</td><td><code class="code">http://localhost:8000</code></td></tr>
          <tr><td style="color:var(--muted)">Docs (Swagger)</td><td><a class="link" href="http://localhost:8000/docs" target="_blank">http://localhost:8000/docs</a></td></tr>
          <tr><td style="color:var(--muted)">Status</td><td id="settingsApiStatus">Checking…</td></tr>
        </tbody>
      </table>
      <div style="margin-top:12px">
        <button class="btn" id="settingsPingBtn">Ping API</button>
      </div>
    </div>
  </div>

  <div class="section-card">
    <div class="section-title">Active Session</div>
    <div class="section-body">
      <table class="data-table">
        <tbody>
          <tr><td style="color:var(--muted);width:180px">Session ID</td><td id="settingsSessionId">${esc(state?.session?.id || '—')}</td></tr>
          <tr><td style="color:var(--muted)">Label</td><td id="settingsSessionLabel">${esc(state?.session?.label || 'None')}</td></tr>
          <tr><td style="color:var(--muted)">Messages sent</td><td id="settingsSessionMsgs">${state?.session?.questions || 0}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

</div>`;

    document.getElementById('settingsPingBtn').addEventListener('click', _ping);
    _ping();
  }

  async function _ping() {
    const el = document.getElementById('settingsApiStatus');
    if (el) el.textContent = 'Checking…';
    const r = await API.health();
    if (el) {
      el.innerHTML = r.ok
        ? `<span style="color:var(--success);font-weight:600">Online</span> — ${r.data?.sessions ?? 0} session(s) in memory`
        : `<span style="color:var(--danger);font-weight:600">Offline</span> — ${esc(r.error)}`;
    }
  }

  function refresh(state) {
    const sid = document.getElementById('settingsSessionId');
    const slb = document.getElementById('settingsSessionLabel');
    const sms = document.getElementById('settingsSessionMsgs');
    if (sid) sid.textContent = state?.session?.id || '—';
    if (slb) slb.textContent = state?.session?.label || 'None';
    if (sms) sms.textContent = state?.session?.questions || 0;
  }

  return { render, refresh };
})();
