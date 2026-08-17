/**
 * theme.js — shared light/dark theme toggle for the Legal Aid Advisor site.
 * Persists the choice in localStorage; falls back to the OS preference.
 * Both the landing page and the dashboard include this file.
 */
(function () {
  'use strict';

  const KEY = 'legal-aid-theme';
  const root = document.documentElement;

  const getSaved = () => {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  };

  const apply = theme => {
    root.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0F172A' : '#F8FAFC');
    }
    // sync any toggle buttons on the page
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.setAttribute('aria-pressed', theme === 'dark');
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      btn.classList.toggle('dark', theme === 'dark');
    });
  };

  const initial = getSaved() ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  apply(initial);

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (err) { /* private mode */ }
    apply(next);
  });
})();
