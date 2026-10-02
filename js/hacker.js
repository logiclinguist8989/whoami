// Small behaviours for the hacker-theme pages: live clock, time in industry,
// project filters and copy-to-clipboard. Loaded as an external file so the
// strict Content-Security-Policy can forbid inline scripts.
(function () {
  'use strict';

  // ----- Live Nepal time in the status bar (UTC+05:45) -----
  const clocks = document.querySelectorAll('[data-npt]');
  function tick() {
    const npt = new Date(Date.now() + (5 * 60 + 45) * 60000);
    const text = String(npt.getUTCHours()).padStart(2, '0') + ':' + String(npt.getUTCMinutes()).padStart(2, '0');
    clocks.forEach(el => { el.textContent = text; });
  }
  if (clocks.length) {
    tick();
    setInterval(tick, 15000);
  }

  // ----- Months in industry, counted inclusively like LinkedIn -----
  function monthsSince(start) {
    const [year, month] = start.split('-').map(Number);
    const now = new Date();
    return Math.max(1, (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month) + 1);
  }
  document.querySelectorAll('[data-months-since]').forEach(el => {
    el.textContent = String(monthsSince(el.dataset.monthsSince));
  });

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // ----- Project filters (htop F-keys) -----
  const filters = document.querySelectorAll('[data-filter]');
  if (filters.length) {
    const table = document.querySelector('[aria-label="Projects in htop"]');
    const rows = table ? Array.from(table.querySelectorAll('[data-tag]')) : [];
    const status = document.getElementById('filter-status');

    function apply(filter) {
      let shown = 0;
      rows.forEach(row => {
        const match = filter === 'all' || row.dataset.tag === filter;
        row.hidden = !match;
        if (match) shown++;
      });
      filters.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.filter === filter)));
      if (status) status.textContent = filter === 'all' ? '' : shown + ' of ' + rows.length + ' projects shown (' + filter + ')';
    }

    filters.forEach(btn => btn.addEventListener('click', () => apply(btn.dataset.filter)));

    // F4–F8 work like in htop when focus is not in a text field
    const keys = { F4: 'all', F5: 'security', F6: 'fullstack', F7: 'ai/ml', F8: 'enterprise' };
    document.addEventListener('keydown', e => {
      if (!keys[e.key] || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      apply(keys[e.key]);
    });
  }

  // ----- Copy email -----
  document.querySelectorAll('[data-copy]').forEach(btn => {
    const label = btn.textContent;
    let timer;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = '$ copied ✓';
      } catch (e) {
        window.location.href = 'mailto:' + btn.dataset.copy;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => { btn.textContent = label; }, 2000);
    });
  });
})();
