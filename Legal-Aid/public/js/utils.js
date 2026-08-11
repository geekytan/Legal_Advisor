/**
 * utils.js — shared helpers used by all views.
 */

/* ── Toast ─────────────────────────────────────────────────────────────── */
function toast(msg, type = 'info', ms = 3000) {
  const ct = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  ct.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ── HTML escape ────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Format timestamp ───────────────────────────────────────────────────── */
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ── Category meta ──────────────────────────────────────────────────────── */
const CAT_META = {
  qa:         { label: 'Legal Q&A',    color: '#2f5fa3' },
  contract:   { label: 'Contract',     color: '#6f4fc4' },
  compliance: { label: 'Compliance',   color: '#c77d2e' },
  research:   { label: 'Research',     color: '#3e7d4e' },
};

function catColor(k) { return CAT_META[k]?.color || '#57606a'; }
function catLabel(k) { return CAT_META[k]?.label || k; }

function catBadge(k) {
  return `<span class="badge" style="background:${catColor(k)}">${esc(catLabel(k))}</span>`;
}

/* ── Classify user message text ─────────────────────────────────────────── */
function classifyText(text) {
  const t = text || '';
  if (/tenant|landlord|rent|evict|repair|lease|rights|housing/i.test(t))        return 'qa';
  if (/gdpr|compliance|data.?protect|privacy|regulation|cookie/i.test(t))       return 'compliance';
  if (/contract|clause|renew|indemnif|liability|ip|copyright|ownership/i.test(t)) return 'contract';
  if (/case.?law|research|judgment|court|ruling|precedent|statute/i.test(t))    return 'research';
  return 'qa';
}

/* ── SVG bar chart renderer ─────────────────────────────────────────────── */
function renderBarChart(containerId, catsData) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const cats = [
    { key:'qa',         label:'Q&A',        color:'#2f5fa3' },
    { key:'contract',   label:'Contract',   color:'#6f4fc4' },
    { key:'compliance', label:'Compliance', color:'#c77d2e' },
    { key:'research',   label:'Research',   color:'#3e7d4e' },
  ];
  const maxVal = Math.max(...cats.map(c => catsData[c.key] || 0), 1);
  const W=320, H=118, pad={top:12,right:10,bottom:30,left:28};
  const barW=40, gap=(W-pad.left-pad.right-cats.length*barW)/(cats.length+1);
  const chartH=H-pad.top-pad.bottom;

  let bars = '', ticks = '';
  cats.forEach((c, i) => {
    const val = catsData[c.key] || 0;
    const bh  = Math.max((val/maxVal)*chartH, val>0?3:0);
    const x   = pad.left+gap*(i+1)+barW*i;
    const y   = pad.top+(chartH-bh);
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${c.color}" opacity=".92"/>`;
    if (val>0) bars += `<text x="${x+barW/2}" y="${y-4}" text-anchor="middle" font-size="10" font-weight="600" fill="#6d7789">${val}</text>`;
    bars += `<text x="${x+barW/2}" y="${H-pad.bottom+15}" text-anchor="middle" font-size="10" fill="#6d7789">${c.label}</text>`;
  });
  for (let t=0; t<=maxVal; t+=Math.ceil(maxVal/4)||1) {
    const ty = pad.top+chartH-(t/maxVal)*chartH;
    ticks += `<line x1="${pad.left-4}" x2="${W-pad.right}" y1="${ty}" y2="${ty}" stroke="#e4ddcd" stroke-width="1"/>`;
    ticks += `<text x="${pad.left-6}" y="${ty+3}" text-anchor="end" font-size="9" fill="#97a1b3">${t}</text>`;
  }
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${ticks}${bars}</svg>`;
}
