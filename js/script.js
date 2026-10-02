/* Portfolio interactions: theme, mobile nav, active section, project filter, live durations. */
(function () {
  'use strict';

  const root = document.documentElement;

  // ----- Theme toggle (shares the 'theme' key with the tool pages) -----
  const themeToggle = document.querySelector('.theme-toggle');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)');

  function currentTheme() {
    return root.getAttribute('data-theme') || (prefersLight.matches ? 'light' : 'dark');
  }

  function syncThemeLabel() {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    themeToggle.setAttribute('aria-label', `Switch to ${next} theme`);
  }

  themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
    syncThemeLabel();
  });
  prefersLight.addEventListener('change', syncThemeLabel);
  syncThemeLabel();

  // ----- Mobile navigation -----
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.getElementById('nav-links');

  function setMenu(open) {
    navLinks.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  navToggle.addEventListener('click', () => setMenu(!navLinks.classList.contains('is-open')));
  navLinks.addEventListener('click', event => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && navLinks.classList.contains('is-open')) {
      setMenu(false);
      navToggle.focus();
    }
  });

  // ----- Highlight the nav link for the section in view -----
  const linkFor = new Map(
    Array.from(navLinks.querySelectorAll('a[href^="#"]')).map(a => [a.getAttribute('href').slice(1), a])
  );

  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        linkFor.forEach(link => link.classList.remove('is-active'));
        const link = linkFor.get(entry.target.id);
        if (link) link.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main section[id]').forEach(section => spy.observe(section));
  }

  // ----- Project filter -----
  const filters = document.querySelectorAll('.filter');
  const projects = document.querySelectorAll('#projects [data-category]');

  filters.forEach(button => {
    button.addEventListener('click', () => {
      const wanted = button.dataset.filter;
      filters.forEach(b => {
        const active = b === button;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      projects.forEach(project => {
        const categories = project.dataset.category.split(' ');
        project.classList.toggle('is-hidden', wanted !== 'all' && !categories.includes(wanted));
      });
    });
  });

  // ----- Durations that stay current (LinkedIn-style: the start month counts) -----
  function monthsSince(start) {
    const [year, month] = start.split('-').map(Number);
    const now = new Date();
    return Math.max(1, (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month) + 1);
  }

  function formatDuration(total) {
    const years = Math.floor(total / 12);
    const months = total % 12;
    const parts = [];
    if (years) parts.push(`${years} yr${years > 1 ? 's' : ''}`);
    if (months) parts.push(`${months} mo${months > 1 ? 's' : ''}`);
    return parts.join(' ');
  }

  document.querySelectorAll('[data-start]').forEach(el => {
    el.textContent = formatDuration(monthsSince(el.dataset.start));
  });
  document.querySelectorAll('[data-months-since]').forEach(el => {
    el.textContent = String(monthsSince(el.dataset.monthsSince));
  });

  document.getElementById('year').textContent = String(new Date().getFullYear());

  // ----- Gentle reveal on scroll -----
  const revealTargets = document.querySelectorAll(
    '.section-head, .prose, .timeline-item, .featured, .project, .tool-card, .toolkit, .thm, .learning-list, .contact > *'
  );
  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach(el => {
      el.classList.add('reveal');
      reveal.observe(el);
    });
  }
})();
