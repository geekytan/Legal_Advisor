/**
 * app.js — SPA router and application bootstrap.
 * Initialises views, manages shared state, handles navigation.
 */

(function () {
  'use strict';

  /* ── Shared state ──────────────────────────────────────────────────────── */
  const state = {
    session: {
      id:        null,
      label:     null,
      questions: 0,
      cats:      { qa: 0, contract: 0, compliance: 0, research: 0 },
    },
    currentView: 'chat',
  };

  /* ── View registry ────────────────────────────────────────────────────── */
  const VIEWS = {
    chat:      { module: ChatView,      el: null },
    analytics: { module: AnalyticsView, el: null },
    contracts: { module: ContractsView, el: null },
    sessions:  { module: SessionsView,  el: null },
    settings:  { module: SettingsView,  el: null },
  };

  /* ── Boot ─────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    // Cache view elements
    Object.keys(VIEWS).forEach(k => {
      VIEWS[k].el = document.getElementById(`view-${k}`);
    });

    // Render all views (they render into their containers)
    VIEWS.chat.module.render(VIEWS.chat.el, state);
    VIEWS.analytics.module.render(VIEWS.analytics.el);
    VIEWS.contracts.module.render(VIEWS.contracts.el, state);
    VIEWS.sessions.module.render(VIEWS.sessions.el, state);
    VIEWS.settings.module.render(VIEWS.settings.el, state);

    // Nav click handler
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate(btn.dataset.view);
        // Close the drawer on mobile after navigating
        document.getElementById('appNav')?.classList.remove('open');
      });
    });

    // Mobile nav toggle
    document.getElementById('navToggle')?.addEventListener('click', () => {
      document.getElementById('appNav')?.classList.toggle('open');
    });

    // Programmatic navigation (used by views, e.g. Contracts → Chat)
    document.addEventListener('app:navigate', e => navigate(e.detail));

    // Auto-create a session on load
    await _initSession();

    // Poll backend health every 15s
    _pollHealth();
    setInterval(_pollHealth, 15000);
  });

  /* ── Navigation ───────────────────────────────────────────────────────── */
  function navigate(viewKey) {
    if (!VIEWS[viewKey]) return;
    state.currentView = viewKey;

    // Toggle active view
    Object.keys(VIEWS).forEach(k => {
      VIEWS[k].el?.classList.toggle('active', k === viewKey);
    });

    // Toggle active nav item
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewKey);
    });

    // Refresh analytics when switching to that view
    if (viewKey === 'analytics') AnalyticsView.refresh();
    if (viewKey === 'settings')  SettingsView.refresh(state);
  }

  /* ── Session init ─────────────────────────────────────────────────────── */
  async function _initSession() {
    const label = 'Session ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const r = await API.createSession(label);
    if (r.ok) {
      state.session.id    = r.data.id;
      state.session.label = r.data.label;
      ChatView.updateSessionLabel(r.data.label);
      const nav = document.getElementById('navSessionLabel');
      if (nav) nav.textContent = label;
      const chip = document.getElementById('headerSessionLabel');
      if (chip) chip.textContent = label;
    }
  }

  /* ── Health polling ───────────────────────────────────────────────────── */
  async function _pollHealth() {
    const pill = document.getElementById('statusPill');
    if (!pill) return;
    const r = await API.health();
    if (r.ok) {
      pill.textContent = 'Connected';
      pill.className   = 'status-pill';
    } else {
      pill.textContent = 'API Offline';
      pill.className   = 'status-pill disconnected';
    }
  }
})();
