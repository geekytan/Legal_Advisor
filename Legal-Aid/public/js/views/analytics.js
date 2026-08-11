/**
 * views/analytics.js — Global analytics dashboard.
 * Renders into #view-analytics.
 */

const AnalyticsView = (() => {
  function render(container) {
    container.innerHTML = `
<div class="page-bar">
  <div>
    <h1>Analytics</h1>
    <div class="sub">Aggregate metrics across all sessions</div>
  </div>
  <button class="btn" id="analyticsRefreshBtn">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
    Refresh
  </button>
</div>

<div style="padding:20px 26px;display:flex;flex-direction:column;gap:20px;overflow-y:auto;flex:1">

  <!-- Offline notice -->
  <div id="analyticsNotice" class="notice hidden"></div>

  <!-- KPI row -->
  <div class="stat-grid" id="analyticsKpis">
    ${_kpiCard('an-sessions',  'Total Sessions',    '0', 'all time')}
    ${_kpiCard('an-messages',  'Total Messages',    '0', 'user queries')}
    ${_kpiCard('an-risks',     'Risk Flags',        '0', 'across sessions')}
    ${_kpiCard('an-contracts', 'Contracts Parsed',  '0', 'documents')}
  </div>

  <!-- Category breakdown + chart -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="section-card">
      <div class="section-title">Category Breakdown</div>
      <div class="section-body">
        <div class="cat-list">
          ${['qa','contract','compliance','research'].map(k=>`
          <div>
            <div class="cat-label-row">
              <span class="cat-name" style="color:${catColor(k)}">${catLabel(k)}</span>
              <span class="cat-count" id="an-cnt-${k}">0</span>
            </div>
            <div class="cat-bar-bg"><div class="cat-bar-fill" id="an-bar-${k}" style="width:0%;background:${catColor(k)}"></div></div>
          </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="section-card">
      <div class="section-title">Volume by Category</div>
      <div style="padding:12px 8px 6px" id="anChartWrap"></div>
    </div>
  </div>

</div>`;

    document.getElementById('analyticsRefreshBtn').addEventListener('click', refresh);
    refresh();
  }

  function _kpiCard(id, label, value, sub) {
    return `<div class="stat-card">
      <div class="label">${label}</div>
      <div class="value" id="${id}">${value}</div>
      <div class="sub">${sub}</div>
    </div>`;
  }

  async function refresh() {
    const notice = document.getElementById('analyticsNotice');
    const r = await API.analyticsSummary();
    if (!r.ok) {
      if (notice) {
        notice.innerHTML = 'The backend is unreachable — start the FastAPI server on <span class="code">localhost:8000</span> to see live metrics.';
        notice.classList.remove('hidden');
      }
      return;
    }
    if (notice) notice.classList.add('hidden');
    const d = r.data;

    _set('an-sessions',  d.total_sessions);
    _set('an-messages',  d.total_messages);
    _set('an-risks',     d.total_risk_flags);
    _set('an-contracts', d.total_contracts_parsed);

    const cats = d.category_breakdown || {};
    const total = Object.values(cats).reduce((a,b)=>a+b,0) || 1;
    ['qa','contract','compliance','research'].forEach(k => {
      _set(`an-cnt-${k}`, cats[k] || 0);
      const bar = document.getElementById(`an-bar-${k}`);
      if (bar) bar.style.width = (((cats[k]||0)/total)*100).toFixed(1)+'%';
    });

    renderBarChart('anChartWrap', cats);
  }

  function _set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '0';
  }

  return { render, refresh };
})();
