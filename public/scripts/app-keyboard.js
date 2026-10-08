/** Global keyboard shortcuts (watch-page media keys live in app-watch.js). */
(() => {
  'use strict';
  const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not([hidden]), .sheet:not([hidden]), .header-popover:not([hidden])').forEach((el) => { el.hidden = true; });
      document.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'));
      document.body.classList.remove('search-open');
      return;
    }
    if (isTyping(e)) return;

    const onWatch = document.body.dataset.page === 'watch';
    switch (e.key.toLowerCase()) {
      case '/':
        e.preventDefault();
        document.querySelector('#searchInput')?.focus();
        break;
      case 'g':
        e.preventDefault();
        location.href = '/';
        break;
      case 's':
        if (!onWatch) { e.preventDefault(); location.href = '/shorts'; }
        break;
      case 'h':
        e.preventDefault();
        location.href = '/history';
        break;
      default:
        break;
    }
  });
})();
