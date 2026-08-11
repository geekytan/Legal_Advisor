/**
 * landing.js — Legal Aid Advisor landing page.
 * Scroll reveals, stat counters, hero mockup chat loop, nav chrome.
 */
(function () {
  'use strict';

  /* ── Nav: solid chrome once scrolled ─────────────────────────────────── */
  const nav = document.getElementById('lpNav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Mobile menu ─────────────────────────────────────────────────────── */
  const burger = document.getElementById('lpBurger');
  const links  = document.getElementById('lpLinks');
  if (burger && links) {
    burger.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open);
    });
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      links.classList.remove('open');
      burger.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    }));
  }

  /* ── Scroll reveal with stagger ──────────────────────────────────────── */
  const reveals = document.querySelectorAll('.reveal');
  const revealStagger = () => {
    const groups = {};
    reveals.forEach((el, i) => {
      const parent = el.closest('.lp-features, .lp-stats-grid, .lp-steps, .lp-hero-copy');
      const key = parent ? 'g' + [...parent.children].indexOf(el) : 's' + i;
      groups[key] = (groups[key] || 0) + 1;
      el.style.setProperty('--d', (groups[key] - 1) * 0.09 + 's');
    });
  };
  revealStagger();

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('in'));
  }

  /* ── Stat counters ───────────────────────────────────────────────────── */
  const counters = document.querySelectorAll('[data-count]');
  const animateCount = el => {
    const target = parseInt(el.dataset.count, 10);
    const dur = 1600;
    const start = performance.now();
    const tick = now => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { animateCount(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(el => io.observe(el));
  } else {
    counters.forEach(el => el.textContent = parseInt(el.dataset.count, 10).toLocaleString('en-US'));
  }

  /* ── Hero mockup: cycling question → typing → answer ─────────────────── */
  const Q = document.getElementById('mockQ');
  const A = document.getElementById('mockA');
  const typing = document.getElementById('mockTyping');
  if (Q && A && typing) {
    const SETS = [
      { q: 'Does my landlord have to return my security deposit?',
        a: 'Your deposit must be returned within 21 days of lease end — with an itemised statement of any deductions.' },
      { q: 'Can my employer restrict moonlighting in my contract?',
        a: 'Non-compete clauses must be reasonable in scope — broad restrictions are often unenforceable.' },
      { q: 'Is an auto-renewal clause worth negotiating?',
        a: 'Yes. Auto-renewal without a written opt-out window is a common risk clause — worth negotiating.' },
    ];
    const TYPE_MS = 26, PAUSE_BEFORE = 900, PAUSE_AFTER = 4200;
    let setIdx = 0, typeTimer = null, holdTimer = null, cancelled = false;

    const cancelAll = () => {
      cancelled = true;
      clearTimeout(typeTimer);
      clearTimeout(holdTimer);
    };

    const start = () => {
      cancelled = false;
      const set = SETS[setIdx % SETS.length];
      Q.textContent = '';
      A.style.display = 'none';
      typing.style.display = 'inline-flex';
      holdTimer = setTimeout(() => typeQuestion(set), PAUSE_BEFORE);
    };

    const typeQuestion = set => {
      if (cancelled) return;
      const chars = set.q.split('');
      const type = () => {
        if (cancelled) return;
        Q.textContent += chars.shift();
        if (chars.length) {
          typeTimer = setTimeout(type, TYPE_MS);
        } else {
          typing.style.display = 'none';
          A.textContent = set.a;
          A.style.display = 'block';
          A.style.opacity = '0';
          A.style.transition = 'opacity .5s ease';
          requestAnimationFrame(() => { A.style.opacity = '1'; });
          holdTimer = setTimeout(() => { setIdx++; start(); }, PAUSE_AFTER);
        }
      };
      type();
    };

    // Respect reduced motion: show a static exchange instead.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelAll();
      typing.style.display = 'none';
      A.style.display = 'block';
    } else {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAll(); else start();
      });
      start();
    }
  }
})();
