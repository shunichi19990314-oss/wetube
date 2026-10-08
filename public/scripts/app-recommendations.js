/** Home recommendations refresh + client-side recommendation cache. */
(() => {
  'use strict';
  const { $, api, render, store, notify } = window.WT;
  if (document.body.dataset.page !== 'home') return;

  const grid = $('#recommendationGrid');
  if (!grid) return;

  // Remember what we rendered so a back-navigation shows something instantly.
  const cacheKey = 'recommendationCache';
  const cached = store.get(cacheKey, null);
  if (cached?.html && cached.at && Date.now() - cached.at < 30 * 60 * 1000 && !grid.children.length) {
    grid.innerHTML = cached.html;
  }

  const persist = () => {
    try {
      store.set(cacheKey, { html: grid.innerHTML.slice(0, 400000), at: Date.now() });
    } catch { /* quota */ }
  };

  new MutationObserver(window.WT.debounce(persist, 800)).observe(grid, { childList: true });
  persist();

  window.WT.recommendations = {
    async refresh() {
      grid.innerHTML = render.skeletonHtml(12);
      try {
        const data = await api('/api/recommendations');
        grid.innerHTML = (data.items || []).map((v, i) => render.videoHtml(v, { index: i })).join('');
        persist();
      } catch (e) {
        grid.innerHTML = `<p class="feed-error">${window.WT.esc(e.message)}</p>`;
      }
    },
  };
})();
