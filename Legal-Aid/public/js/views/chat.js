/**
 * views/chat.js — WxO embedded chat panel + live analytics sidebar.
 * Renders into #view-chat.
 */

const ChatView = (() => {
  const WXO = {
    orchestrationID: '41bb59990fd34b5081873a229f14864f_e20e6693-dff2-428e-89d1-8dc79978a62a',
    hostURL:         'https://au-syd.watson-orchestrate.cloud.ibm.com',
    rootElementID:   'wxo-root',
    deploymentPlatform: 'ibmcloud',
    crn: 'crn:v1:bluemix:public:watsonx-orchestrate:au-syd:a/41bb59990fd34b5081873a229f14864f:e20e6693-dff2-428e-89d1-8dc79978a62a::',
    chatOptions: { agentId: 'ed18d61c-a3a7-495b-8e87-21c59f4c19f5' },
  };

  function render(container, state) {
    container.innerHTML = `
<div class="chat-col">
  <div class="chat-col-header">
    <h2>Chat</h2>
    <span class="chat-session-label" id="chatSessionLabel">No session</span>
  </div>
  <div class="chat-fallback" id="chatFallback">
    <div class="cf-emblem">⚖️</div>
    <h3>Your legal advisor is ready</h3>
    <p>Ask about tenant rights, contracts, compliance, or case research.
    The secure chat connects to <strong>IBM watsonx Orchestrate</strong>.</p>
    <p class="cf-note">If the chat window hasn't appeared, check your connection to watsonx Orchestrate and reload.</p>
  </div>
  <div id="wxo-root"></div>
</div>

<aside class="chat-sidebar">
  <div class="panel-header">
    <h2>Live Analytics</h2>
    <span class="live-dot">Live</span>
  </div>
  <div class="sidebar-body">
    <div class="mini-stat-row">
      <div class="mini-stat"><div class="lbl">Questions</div><div class="val" id="cs-questions">0</div></div>
      <div class="mini-stat"><div class="lbl">Risk Flags</div><div class="val" id="cs-risks">0</div></div>
    </div>
    <div class="section-card">
      <div class="section-title">Categories</div>
      <div class="section-body">
        <div class="cat-list">
          ${['qa','contract','compliance','research'].map(k=>`
          <div>
            <div class="cat-label-row"><span class="cat-name" style="color:${catColor(k)}">${catLabel(k)}</span><span class="cat-count" id="cs-cnt-${k}">0</span></div>
            <div class="cat-bar-bg"><div class="cat-bar-fill" id="cs-bar-${k}" style="width:0%;background:${catColor(k)}"></div></div>
          </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="section-card">
      <div class="section-title">Session Log</div>
      <div class="section-body" style="padding:2px 14px">
        <div class="log-list" id="cs-log"><p class="panel-empty">No interactions yet — ask the advisor a question.</p></div>
      </div>
    </div>
    <div class="section-card">
      <div class="section-title">Flagged Risk Clauses</div>
      <div class="section-body">
        <div class="risk-list" id="cs-risks-list"><p class="panel-empty">None detected yet.</p></div>
      </div>
    </div>
  </div>
</aside>`;

    _loadWxO(state);
    _attachObserver(state);
    _monitorChat();
  }

  /* Hide the welcome fallback once the WxO widget actually renders. */
  function _monitorChat() {
    const fallback = document.getElementById('chatFallback');
    if (!fallback) return;
    let aliveCount = 0;
    let tries = 0;
    const t = setInterval(() => {
      const root = document.getElementById('wxo-root');
      // Require sustained, visible widget content before hiding the fallback
      const alive = !!root && root.children.length > 0 && root.getBoundingClientRect().height > 120;
      aliveCount = alive ? aliveCount + 1 : 0;
      if (aliveCount >= 2) {
        fallback.style.display = 'none';
        clearInterval(t);
      } else if (++tries > 25) {
        clearInterval(t);
      }
    }, 800);
  }

  function _loadWxO(state) {
    if (window._wxoLoaded) return;
    window._wxoLoaded = true;
    window.wxOConfiguration = { ...WXO };
    const s = document.createElement('script');
    s.src = `${WXO.hostURL}/wxochat/wxoLoader.js?embed=true`;
    s.onload = () => wxoLoader.init();
    document.head.appendChild(s);
  }

  function _attachObserver(state) {
    const root = document.getElementById('wxo-root');
    if (!root) return;
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const cls = node.className || '';
          const isUser  = /\buser\b/.test(cls) || /\buserRequest\b/.test(cls);
          const isAgent = /\bagentResponse\b/.test(cls);

          if (isUser) {
            const text = (node.innerText || node.textContent || '').trim();
            if (text) _recordUserMsg(text, state);
          } else if (isAgent) {
            // The agent streams its reply — wait for it to settle before persisting.
            const initial = (node.innerText || node.textContent || '').trim();
            if (initial) {
              setTimeout(() => {
                const final = (node.innerText || node.textContent || '').trim();
                if (final) _recordAgentMsg(final, state);
              }, 2000);
            }
          } else {
            // Fallback: some widgets wrap the message in a non-descriptive container.
            const inner = node.querySelector?.('[data-author="user"],[role="user"],.userRequest');
            if (!inner) continue;
            const text = (inner.innerText || inner.textContent || '').trim();
            if (text) _recordUserMsg(text, state);
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function _recordAgentMsg(text, state) {
    if (state.session.id) {
      API.addEvent(state.session.id, { role: 'agent', text, category: 'contract', risk_flags: [] });
    }
  }

  function _recordUserMsg(text, state) {
    const cat = classifyText(text);
    state.session.cats[cat] = (state.session.cats[cat] || 0) + 1;
    state.session.questions++;

    // Persist to backend
    if (state.session.id) {
      API.addEvent(state.session.id, { role: 'user', text, category: cat, risk_flags: [] });
    }

    // Update sidebar
    document.getElementById('cs-questions').textContent = state.session.questions;
    _updateCatBars(state.session.cats);
    _addLogItem(text);

    // Update nav footer
    const lbl = document.getElementById('navSessionLabel');
    if (lbl) lbl.textContent = `${state.session.questions} message${state.session.questions===1?'':'s'} sent`;
  }

  function _updateCatBars(cats) {
    const total = Object.values(cats).reduce((a,b)=>a+b,0) || 1;
    ['qa','contract','compliance','research'].forEach(k => {
      const el = document.getElementById(`cs-cnt-${k}`);
      const bar = document.getElementById(`cs-bar-${k}`);
      if (el) el.textContent = cats[k] || 0;
      if (bar) bar.style.width = (((cats[k]||0)/total)*100).toFixed(1)+'%';
    });
  }

  function _addLogItem(text) {
    const log = document.getElementById('cs-log');
    if (!log) return;
    const empty = log.querySelector('.empty-state');
    if (empty) empty.remove();
    const ts = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const short = text.length>65 ? text.slice(0,65)+'…' : text;
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `<span class="log-time">${ts}</span><span class="log-q">${esc(short)}</span>`;
    log.insertBefore(item, log.firstChild);
  }

  function updateSessionLabel(label) {
    const el = document.getElementById('chatSessionLabel');
    if (el) el.textContent = label || 'No session';
  }

  return { render, updateSessionLabel };
})();
