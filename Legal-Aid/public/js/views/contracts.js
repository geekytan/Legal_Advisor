/**
 * views/contracts.js — Contract upload & review panel.
 * Renders into #view-contracts.
 */

const ContractsView = (() => {
  let _state = null;

  function render(container, state) {
    _state = state;
    container.innerHTML = `
<div class="page-bar">
  <div>
    <h1>Contract Review</h1>
    <div class="sub">Upload a PDF or DOCX to extract text and detect risk clauses</div>
  </div>
</div>

<div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;flex:1">

  <!-- Upload zone -->
  <div class="upload-zone" id="uploadZone">
    <div class="uz-icon">📄</div>
    <h3>Drop your contract here</h3>
    <p>PDF or DOCX · max 10 MB</p>
    <div style="margin-top:14px">
      <button class="btn primary" id="browseBtn">Browse file</button>
    </div>
    <input type="file" id="fileInput" accept=".pdf,.docx" style="display:none" />
  </div>

  <!-- Result area -->
  <div id="contractResult" style="display:none;flex-direction:column;gap:14px"></div>

</div>`;

    _wire();
  }

  function _wire() {
    const zone  = document.getElementById('uploadZone');
    const input = document.getElementById('fileInput');
    const browse = document.getElementById('browseBtn');

    browse.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files[0]) _handle(input.files[0]); });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) _handle(f);
    });
  }

  async function _handle(file) {
    const zone   = document.getElementById('uploadZone');
    const result = document.getElementById('contractResult');

    zone.innerHTML = `<div class="uz-icon">⏳</div><h3>Parsing ${esc(file.name)}…</h3>`;
    result.style.display = 'none';

    const r = await API.parseContract(file, _state?.session?.id);

    // Restore zone
    zone.innerHTML = `
      <div class="uz-icon">📄</div>
      <h3>Drop your contract here</h3>
      <p>PDF or DOCX · max 10 MB</p>
      <div style="margin-top:14px">
        <button class="btn primary" id="browseBtn">Browse file</button>
      </div>
      <input type="file" id="fileInput" accept=".pdf,.docx" style="display:none" />`;
    document.getElementById('browseBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', ev => { if (ev.target.files[0]) _handle(ev.target.files[0]); });

    if (!r.ok) {
      toast('Parse failed: ' + r.error, 'error');
      result.style.display = 'flex';
      result.innerHTML = `<div class="risk-item"><div class="risk-name">Parse Error</div><div class="risk-ctx">${esc(r.error)}</div></div>`;
      return;
    }

    const text   = r.data.text || '';
    const risks  = _detectRisks(text);
    const words  = text.trim().split(/\s+/).length;

    result.style.display = 'flex';
    result.innerHTML = `
<div class="section-card">
  <div class="section-title">Document Info — ${esc(file.name)}</div>
  <div class="section-body" style="display:flex;gap:24px;flex-wrap:wrap">
    <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Words</div><div style="font-size:20px;font-weight:700">${words.toLocaleString()}</div></div>
    <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Characters</div><div style="font-size:20px;font-weight:700">${text.length.toLocaleString()}</div></div>
    <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Risk Flags</div><div style="font-size:20px;font-weight:700;color:${risks.length?'var(--danger)':'var(--success)'}">${risks.length}</div></div>
  </div>
</div>

${risks.length ? `
<div class="section-card">
  <div class="section-title">Detected Risk Clauses</div>
  <div class="section-body">
    <div class="risk-list">
      ${risks.map(r=>`<div class="risk-item"><div class="risk-name">${esc(r.name)}</div><div class="risk-ctx">${esc(r.ctx)}</div></div>`).join('')}
    </div>
  </div>
</div>` : `<div class="section-card"><div class="section-body"><p class="empty-state" style="padding:12px 0">No risk clauses detected.</p></div></div>`}

<div class="section-card">
  <div class="section-title">Advisor Evaluation</div>
  <div class="section-body">
    <p style="margin:0 0 12px;font-size:13px;color:var(--muted)">Send the extracted text to the <strong>Legal Aid Advisor</strong> chatbot for a full risk evaluation — it will review the document and suggest what to negotiate.</p>
    <button class="btn primary" id="evaluateBtn">⚖️ Evaluate with Advisor</button>
    <p style="margin:10px 0 0;font-size:12px;color:var(--muted)">Sends the first ${WxoChat.MAX_CHAT_CHARS.toLocaleString()} characters of the document to the chat.</p>
  </div>
</div>

<div class="section-card">
  <div class="section-title">Extracted Text</div>
  <div class="contract-result" style="margin:12px 14px">
    <pre>${esc(text.slice(0, 6000))}${text.length>6000?'\n\n[… truncated — '+text.length.toLocaleString()+' chars total]':''}</pre>
  </div>
</div>`;

    toast(`Parsed ${file.name} — ${risks.length} risk flag${risks.length!==1?'s':''}`, risks.length ? 'error' : 'success');

    document.getElementById('evaluateBtn')?.addEventListener('click', () => _evaluateWithAdvisor(text, file.name));
  }

  /* Build the prompt we hand to the advisor chatbot. */
  function _evalPrompt(fileName, text) {
    return `Please act as a legal advisor and review the contract below (file: "${esc(fileName)}").
Evaluate its overall risk level, list the most important concerns, flag anything unusual or one-sided, and suggest what to negotiate. Be specific and concise.

CONTRACT TEXT:
${text}`;
  }

  /* Send the extracted text to the embedded chatbot and switch to the Chat view. */
  async function _evaluateWithAdvisor(text, fileName) {
    let body = text;
    if (body.length > WxoChat.MAX_CHAT_CHARS) {
      body = body.slice(0, WxoChat.MAX_CHAT_CHARS)
        + `\n\n[… excerpt — full document is ${text.length.toLocaleString()} characters]`;
    }
    const prompt = _evalPrompt(fileName, body);

    const btn = document.getElementById('evaluateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending to advisor…'; }

    // Switch to the Chat view first so the user watches the evaluation happen.
    document.dispatchEvent(new CustomEvent('app:navigate', { detail: 'chat' }));

    try {
      await WxoChat.sendMessage(prompt);
      toast(`Sent ${fileName} to the advisor — evaluating now.`);
    } catch (e) {
      // Widget unreachable (offline / upgraded markup): give the user the prompt
      // so they can paste it into the chat manually.
      try {
        await navigator.clipboard.writeText(prompt);
        toast(`Chat unreachable (${e.message}) — prompt copied to clipboard, paste it in the Chat tab.`, 'error', 5000);
      } catch (_) {
        toast(`Chat unreachable: ${e.message}`, 'error');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⚖️ Evaluate with Advisor'; }
    }
  }

  const RISK_PATTERNS = [
    { re: /auto.?renew/i,         name: 'Auto-Renewal',         ctx: 'Contract may renew automatically without explicit opt-out.' },
    { re: /indemnif/i,            name: 'Indemnification',       ctx: 'Broad indemnification clause detected — review scope carefully.' },
    { re: /unlimited\s+liabilit/i,name: 'Unlimited Liability',   ctx: 'No liability cap — exposure may be unrestricted.' },
    { re: /sole\s+discretion/i,   name: 'Sole Discretion',       ctx: 'Unilateral decision-making rights granted to one party.' },
    { re: /liquidated\s+damages/i,name: 'Liquidated Damages',    ctx: 'Pre-set damages clause — verify the amount is reasonable.' },
    { re: /perpetual\s+licen/i,   name: 'Perpetual License',     ctx: 'License granted in perpetuity — may restrict future options.' },
    { re: /non.?compet/i,         name: 'Non-Compete',           ctx: 'Non-competition restriction — check duration and geography.' },
    { re: /waiver\s+of\s+jury/i,  name: 'Jury Waiver',          ctx: 'Waiver of right to jury trial detected.' },
    { re: /arbitration/i,         name: 'Mandatory Arbitration', ctx: 'Disputes must go to arbitration — may limit legal remedies.' },
  ];

  function _detectRisks(text) {
    return RISK_PATTERNS.filter(p => p.re.test(text));
  }

  return { render };
})();
