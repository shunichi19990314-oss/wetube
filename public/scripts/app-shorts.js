/** Shorts stage: vertical navigation, swipe, wheel and keyboard. */
(() => {
  'use strict';
  const { $, $$, notify } = window.WT;
  if (document.body.dataset.page !== 'shorts') return;

  const stage = $('#shortsStage');
  if (!stage) return;
  const slides = $$('.short-slide', stage);
  let index = Math.max(0, slides.findIndex((s) => s.classList.contains('active')));
  let touchY = null;

  function show(i, { push = true } = {}) {
    if (!slides.length) return;
    index = (i + slides.length) % slides.length;
    slides.forEach((s, n) => {
      const active = n === index;
      s.classList.toggle('active', active);
      const frame = s.querySelector('iframe');
      if (!active && frame) frame.src = 'about:blank';
      if (active && !frame) {
        const id = s.dataset.videoId;
        const holder = s.querySelector('.short-player');
        if (holder && id) {
          holder.innerHTML = `<iframe class="short-frame" src="https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&loop=1&playlist=${encodeURIComponent(id)}&controls=1&rel=0&hl=ja" title="short" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        }
      }
    });
    if (push) {
      const id = slides[index]?.dataset.videoId;
      if (id) history.replaceState(null, '', `/shorts/${encodeURIComponent(id)}`);
    }
  }

  $('#shortsNext')?.addEventListener('click', () => show(index + 1));
  $('#shortsPrev')?.addEventListener('click', () => show(index - 1));

  document.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '')) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); show(index + 1); }
    if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); show(index - 1); }
  });

  stage.addEventListener('wheel', window.WT.debounce((e) => {
    if (Math.abs(e.deltaY) < 24) return;
    show(index + (e.deltaY > 0 ? 1 : -1));
  }, 260), { passive: true });

  stage.addEventListener('touchstart', (e) => { touchY = e.touches[0]?.clientY ?? null; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchY === null) return;
    const dy = (e.changedTouches[0]?.clientY ?? touchY) - touchY;
    if (Math.abs(dy) > 60) show(index + (dy < 0 ? 1 : -1));
    touchY = null;
  }, { passive: true });

  show(index, { push: false });
})();
