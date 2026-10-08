/** Top page-progress bar + SPA-ish navigation feedback. */
(() => {
  'use strict';
  const { $ } = window.WT;
  const bar = $('#pageProgress');
  if (!bar) return;

  const start = () => { bar.classList.remove('done'); bar.classList.add('loading'); };
  const done = () => { bar.classList.remove('loading'); bar.classList.add('done'); setTimeout(() => bar.classList.remove('done'), 600); };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;
    if (url.href === location.href) return;
    start();
  });

  window.addEventListener('pageshow', done);
  window.addEventListener('pagehide', start);
  window.addEventListener('load', done);
  window.WT.progress = { start, done };
})();
