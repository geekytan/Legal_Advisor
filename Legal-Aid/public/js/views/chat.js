/**
 * views/chat.js — Custom Legal Aid Advisor chat.
 *
 * Replaces the IBM watsonx Orchestrate widget with our own UI. Messages are
 * streamed through the FastAPI /chat proxy, which relays the agent's SSE
 * events (the agent itself — prompts, tools, memory — is untouched).
 *
 * Renders into #view-chat.
 */

const ChatView = (() => {
  const MAX_CHAT_CHARS = 8000;

  const GREETING = 'Your legal advisor is ready';
  const SUB = 'Ask about tenant rights, contracts, compliance, or case research — ' +
              'the secure chat connects to IBM watsonx Orchestrate.';

  const CHIPS = [
    { text: 'My landlord hasn’t returned my security deposit — what are my rights?', cat: 'qa' },
    { text: 'What does an indemnity clause mean?',                                cat: 'contract' },
    { text: 'Is my non-compete clause enforceable?',                               cat: 'compliance' },
    { text: 'How do I research relevant case law before a hearing?',               cat: 'research' },
  ];

  /* Contract risk patterns shared with the Contract Review view. */
  const RISK_PATTERNS = [
    { re: /auto.?renew/i,         name: 'Auto-Renewal',         ctx: 'Contract may renew automatically without explicit opt-out.' },
    { re: /indemnif/i,            name: 'Indemnification',       ctx: 'Broad indemnification clause detected — review scope carefully.' },
    { re: /unlimited\s+liabilit/i,name: 'Unlimited Liability',   ctx: 'No liability cap — exposure may be unrestricted.' },
    { re: /sole\s+discretion/i,   name: 'Sole Discretion',       ctx: 'Unilateral decision-making rights granted to one party.' },
    { re: /liquidated\s+damages/i,name: 'Liquidated Damages',    ctx: 'Pre-set damages clause — verify the amount is reasonable.' },
    { re: /perpetual\s+licen/i,   name: 'Perpetual License',     ctx: 'License granted in perpetuity — may restrict future options.' },
    { re: /non.?compet/i,         name: 'Non-Compete',           ctx: 'Non-competition restriction — check duration and geography.' },
    { re: /waiver\s+of\s+jury/i,  name: 'Jury Waiver',           ctx: 'Waiver of right to jury trial detected.' },
    { re: /arbitration/i,         name: 'Mandatory Arbitration', ctx: 'Disputes must go to arbitration — may limit legal remedies.' },
  ];

  let _state = null;
  let _msgs = [];          // [{ role: 'user'|'agent', text }]
  let _riskCount = 0;
  let _streaming = false;

  /* ── Render ──────────────────────────────────────────────────────────── */
  function render(container, state) {
    _state = state;
    container.innerHTML = `
<div class="cc" id="ccWrap">
  <div class="cc-header">
    <h2><span class="cc-dot"></span>Chat</h2>
    <div class="cc-header-right">
      <span class="chat-session-label" id="chatSessionLabel">No session</span>
      <button class="cc-reset" id="ccReset" title="Start a new conversation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        New chat
      </button>
    </div>
  </div>

  <div class="cc-body" id="ccBody">
    <div class="cc-empty" id="ccEmpty">
      <div class="cc-empty-inner">
        <div class="cc-empty-emblem">⚖️</div>
        <h2>${GREETING}</h2>
        <p class="cc-empty-sub">${SUB}</p>
        <div class="cc-chips">
          ${CHIPS.map((c, i) => `
          <button class="cc-chip" data-i="${i}">
            <i style="background:${catColor(c.cat)}"></i>
            <span>${esc(c.text)}</span>
          </button>`).join('')}
        </div>
      </div>
    </div>

    <div class="cc-thread" id="ccThread" aria-live="polite"></div>
  </div>

  <div class="cc-composer">
    <div class="cc-input-row">
      <input class="cc-input" id="ccInput" type="text" autocomplete="off"
             placeholder="Ask about tenant rights, contracts, compliance…" />
      <button class="cc-send" id="ccSend" aria-label="Send message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
    <p class="cc-hint">Legal Aid Advisor provides general legal information — not legal advice.</p>
  </div>
</div>

<aside class="chat-sidebar cc-sidebar">
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

    _wire(state);
  }

  function _wire(state) {
    const input = document.getElementById('ccInput');
    const send  = document.getElementById('ccSend');

    const submit = () => {
      const text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      _send(text);
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

    document.getElementById('ccReset').addEventListener('click', _reset);

    // Suggestion chips
    document.querySelectorAll('.cc-chip').forEach((chip, i) => {
      chip.addEventListener('click', () => _send(CHIPS[i].text));
    });

    if (!state?.session?.id) {
      input.focus();
      _renderEmpty();
    }
  }

  /* Called by app.js once the backend session has been created. */
  async function onSessionReady(state) {
    _state = state;
    if (!state?.session?.id) { _renderEmpty(); return; }

    const r = await API.getSession(state.session.id);
    if (r.ok) {
      const events = (r.data?.events || []).filter(e => e.role === 'user' || e.role === 'agent');
      _msgs = events.map(e => ({ role: e.role, text: e.text }));
      events.filter(e => e.role === 'user').forEach(e => _countUser(e.text, e.category));
      _riskCount = 0;
      events.filter(e => e.role === 'agent').forEach(e => { _riskCount += _countRisks(e.text); });
      _renderThreadOrEmpty();
      _renderSidebar();
    }
  }

  function _renderEmpty() {
    const wrap = document.getElementById('ccWrap');
    wrap.classList.add('state-empty');
    wrap.classList.remove('state-chat');
    const empty = document.getElementById('ccEmpty');
    if (empty) empty.style.display = '';
    document.getElementById('ccThread').innerHTML = '';
    _renderSidebar();
    _focusInput();
  }

  function _renderThreadOrEmpty() {
    if (_msgs.length) {
      const wrap = document.getElementById('ccWrap');
      wrap.classList.remove('state-empty');
      wrap.classList.add('state-chat');
      document.getElementById('ccEmpty').style.display = 'none';
      _renderThread();
    } else {
      _renderEmpty();
    }
  }

  function _renderThread() {
    const thread = document.getElementById('ccThread');
    thread.innerHTML = _msgs.map(m => m.role === 'user' ? _userBubble(m.text) : _agentBubble(m.text)).join('');
    thread.scrollTop = thread.scrollHeight;
  }

  /* ── Bubbles ─────────────────────────────────────────────────────────── */
  function _userBubble(text) {
    return `
<div class="cc-msg cc-msg-user">
  <div class="cc-bubble">${_renderText(text)}</div>
</div>`;
  }

  function _agentBubble(text) {
    return `
<div class="cc-msg cc-msg-agent">
  <span class="cc-avatar">LA</span>
  <div class="cc-bubble">
    <span class="cc-msg-role">Legal Aid Advisor</span>
    <span class="cc-msg-text">${_renderText(text)}</span>
  </div>
</div>`;
  }

  /* Markdown-lite rendering (safe: escape first, then a minimal subset). */
  function _inline(s) {
    let h = esc(s);
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/__(.+?)__/g, '<strong>$1</strong>');
    h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    return h;
  }

  function _renderText(text) {
    const raw = String(text || '');
    const lines = raw.split(/\n/);
    const out = [];
    let list = [];
    const flush = () => { if (list.length) { out.push('<ul>' + list.join('') + '</ul>'); list = []; } };
    for (const line of lines) {
      const t = line.trim();
      if (/^[-*•]\s+/.test(t)) { list.push('<li>' + _inline(t.replace(/^[-*•]\s+/, '')) + '</li>'); continue; }
      if (/^\d+[.)]\s+/.test(t)) { list.push('<li>' + _inline(t.replace(/^\d+[.)]\s+/, '')) + '</li>'); continue; }
      flush();
      if (!t) continue;
      if (/^#{1,4}\s/.test(t)) { out.push('<h4>' + _inline(t.replace(/^#{1,4}\s/, '')) + '</h4>'); continue; }
      out.push('<p>' + _inline(t) + '</p>');
    }
    flush();
    return out.join('') || esc(raw);
  }

  function _typingBubble() {
    const div = document.createElement('div');
    div.className = 'cc-msg cc-msg-agent';
    div.innerHTML = `
  <span class="cc-avatar">LA</span>
  <div class="cc-bubble">
    <span class="cc-msg-role">Legal Aid Advisor</span>
    <span class="cc-typing"><i></i><i></i><i></i></span>
  </div>`;
    return div;
  }

  /* ── Sending ─────────────────────────────────────────────────────────── */
  function _send(text) {
    if (!_state?.session?.id) { toast('No active session — refresh the page.', 'error'); return; }
    if (_streaming) { toast('The advisor is still replying — give it a moment.', 'error'); return; }
    if (text.length > MAX_CHAT_CHARS) {
      toast(`Message too long (${text.length.toLocaleString()} chars) — the advisor accepts up to ${MAX_CHAT_CHARS.toLocaleString()}.`, 'error');
      return;
    }

    // Switch to conversation view
    _msgs.push({ role: 'user', text });
    _renderThreadOrEmpty();

    // Record + analytics for the user message
    _recordUserMsg(text);

    // Assistant bubble with typing indicator
    const thread = document.getElementById('ccThread');
    const bubble = _typingBubble();
    thread.appendChild(bubble);
    thread.scrollTop = thread.scrollHeight;

    _streamReply(text, bubble);
  }

  async function _streamReply(text, bubble) {
    _streaming = true;
    const gotAny = { v: false };
    const full = { v: '' };
    let done = false;

    const finalize = () => {
      if (done) return;
      done = true;
      _streaming = false;
      clearInterval(watchdog);
      _finishAgentReply(bubble, full.v, gotAny.v);
    };

    const watchdog = setInterval(() => { finalize(); }, 20000);

    try {
      const r = await API.chatStream(_state.session.id, API.getUserId(), text);
      if (!r.ok) {
        _failBubble(bubble, r.error);
        return finalize();
      }

      const reader = r.res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          let ev;
          try { ev = JSON.parse(t); } catch { continue; }
          const delta = ev?.data?.delta;
          if (delta && Array.isArray(delta.content)) {
            for (const part of delta.content) {
              if (part && part.response_type === 'text' && part.text) {
                full.v += part.text;
                gotAny.v = true;
                _setBubbleText(bubble, full.v);
                _scrollThread();
              }
            }
          }
        }
      }
    } catch (e) {
      _failBubble(bubble, 'Connection to the advisor was interrupted.');
    }
    finalize();
  }

  function _finishAgentReply(bubble, text, gotAny) {
    if (!gotAny) {
      bubble.querySelector('.cc-typing')?.remove();
      _setBubbleText(bubble, 'I couldn’t reach the advisor just now — please try again.');
    }
    _msgs.push({ role: 'agent', text: text || '' });

    // Persist + analytics
    if (_state?.session?.id) {
      const riskFlags = _detectRisks(text).map(r => ({ name: r.name, ctx: r.ctx }));
      API.addEvent(_state.session.id, { role: 'agent', text, category: 'qa', risk_flags: riskFlags });
    }
    _riskCount += _detectRisks(text).length;
    _renderSidebar();

    document.getElementById('ccInput')?.focus();
  }

  function _failBubble(bubble, msg) {
    bubble.querySelector('.cc-typing')?.remove();
    bubble.querySelector('.cc-msg-role')?.remove();
    const textEl = bubble.querySelector('.cc-msg-text') || bubble.querySelector('.cc-bubble');
    if (textEl) textEl.textContent = '⚠️ ' + msg;
    _msgs.push({ role: 'agent', text: '⚠️ ' + msg });
    _renderSidebar();
  }

  function _setBubbleText(bubble, text) {
    bubble.querySelector('.cc-typing')?.remove();
    let el = bubble.querySelector('.cc-msg-text');
    if (!el) {
      el = document.createElement('span');
      el.className = 'cc-msg-text';
      bubble.querySelector('.cc-bubble')?.appendChild(el);
    }
    el.innerHTML = _renderText(text);
  }

  function _scrollThread() {
    const thread = document.getElementById('ccThread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  }

  function _focusInput() {
    const input = document.getElementById('ccInput');
    if (input) input.focus();
  }

  /* External entry point — used by Contract Review ("Evaluate with Advisor"). */
  function externalSend(text, title) {
    if (!text) return;
    _send(text);
  }

  /* ── Analytics / persistence ─────────────────────────────────────────── */
  function _recordUserMsg(text) {
    const cat = classifyText(text);
    _state.session.cats[cat] = (_state.session.cats[cat] || 0) + 1;
    _state.session.questions++;
    if (_state.session.id) {
      API.addEvent(_state.session.id, { role: 'user', text, category: cat, risk_flags: [] });
    }
    _addLogItem(text);
    _renderSidebar();
    _updateNavFooter();
  }

  function _countUser(text, cat) {
    const k = cat || classifyText(text);
    _state.session.cats[k] = (_state.session.cats[k] || 0) + 1;
    _state.session.questions++;
    _addLogItem(text);
    _updateNavFooter();
  }

  function _detectRisks(text) {
    return RISK_PATTERNS.filter(p => p.re.test(text || ''));
  }

  function _countRisks(text) {
    return _detectRisks(text).length;
  }

  function _addLogItem(text) {
    const log = document.getElementById('cs-log');
    if (!log) return;
    log.querySelector('.panel-empty')?.remove();
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const short = text.length > 65 ? text.slice(0, 65) + '…' : text;
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `<span class="log-time">${ts}</span><span class="log-q">${esc(short)}</span>`;
    log.insertBefore(item, log.firstChild);
  }

  function _renderSidebar() {
    const el = (id) => document.getElementById(id);
    if (el('cs-questions')) el('cs-questions').textContent = _state.session.questions;
    if (el('cs-risks')) el('cs-risks').textContent = _riskCount;

    const cats = _state.session.cats || {};
    const total = Object.values(cats).reduce((a, b) => a + b, 0) || 1;
    ['qa', 'contract', 'compliance', 'research'].forEach(k => {
      if (el(`cs-cnt-${k}`)) el(`cs-cnt-${k}`).textContent = cats[k] || 0;
      if (el(`cs-bar-${k}`)) el(`cs-bar-${k}`).style.width = (((cats[k] || 0) / total) * 100).toFixed(1) + '%';
    });

    // Risk list: rebuild from the last few agent messages
    const list = el('cs-risks-list');
    if (list) {
      const found = [];
      _msgs.filter(m => m.role === 'agent').slice(-4).forEach(m => {
        _detectRisks(m.text).forEach(r => { if (!found.some(f => f.name === r.name)) found.push(r); });
      });
      list.innerHTML = found.length
        ? found.map(r => `<div class="risk-item"><div class="risk-name">${esc(r.name)}</div><div class="risk-ctx">${esc(r.ctx)}</div></div>`).join('')
        : '<p class="panel-empty">None detected yet.</p>';
    }
  }

  function _updateNavFooter() {
    const lbl = document.getElementById('navSessionLabel');
    if (lbl) lbl.textContent = `${_state.session.questions} message${_state.session.questions === 1 ? '' : 's'} sent`;
  }

  /* ── Reset / new chat ────────────────────────────────────────────────── */
  async function _reset() {
    if (!_state?.session?.id) return;
    if (_streaming) { toast('The advisor is still replying — wait a moment.', 'error'); return; }
    const r = await API.resetChat(_state.session.id);
    if (!r.ok) { toast('Reset failed: ' + r.error, 'error'); return; }
    _msgs = [];
    _riskCount = 0;
    _state.session.questions = 0;
    _state.session.cats = { qa: 0, contract: 0, compliance: 0, research: 0 };
    const log = document.getElementById('cs-log');
    if (log) log.innerHTML = '<p class="panel-empty">No interactions yet — ask the advisor a question.</p>';
    _renderEmpty();
    toast('New conversation started.', 'success');
  }

  /* ── Public API ──────────────────────────────────────────────────────── */
  function updateSessionLabel(label) {
    const el = document.getElementById('chatSessionLabel');
    if (el) el.textContent = label || 'No session';
  }

  return { render, updateSessionLabel, onSessionReady, externalSend, MAX_CHAT_CHARS };
})();
