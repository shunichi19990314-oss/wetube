/** Sidebar open/close, scrim, persistence and responsive behaviour. */
(() => {
  'use strict';
  const { $ } = window.WT;
  const KEY = 'sidebarOpen';
  const isMobile = () => window.matchMedia('(max-width: 792px)').matches;

  const setOpen = (open, { persist = true } = {}) => {
    document.body.classList.toggle('sidebar-open', open);
    if (persist && !isMobile()) localStorage.setItem(KEY, open ? '1' : '0');
    $('#scrim')?.setAttribute('aria-hidden', String(!open));
  };

  const stored = localStorage.getItem(KEY);
  if (!isMobile()) setOpen(stored === null ? true : stored === '1', { persist: false });

  $('#menuButton')?.addEventListener('click', () => setOpen(!document.body.classList.contains('sidebar-open')));
  $('#scrim')?.addEventListener('click', () => setOpen(false));

  window.addEventListener('resize', () => {
    if (isMobile()) document.body.classList.remove('sidebar-open');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobile()) setOpen(false);
  });

  window.WT.sidebar = { setOpen, isOpen: () => document.body.classList.contains('sidebar-open') };
})();
