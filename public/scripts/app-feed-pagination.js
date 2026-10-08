/** Infinite scroll / "load more" for home, feeds, search, channel, playlist. */
(() => {
  'use strict';
  const { $, api, notify, render } = window.WT;

  const grid = $('#recommendationGrid') || $('#searchResults') || $('#channelGrid') || $('#playlistList');
  const more = $('#feedLoadMore');
  const spinner = $('#feedSpinner');
  if (!grid || !more) return;

  const kind = grid.dataset.feed || grid.dataset.channel || 'feed';
  const isSearch = !!grid.closest('.page-search');
  const isChannel = !!grid.dataset.channel;
  let continuation = more.dataset.continuation || '';
  let loading = false;
  let page = 1;

  const endpoint = () => {
    if (isSearch) {
      const q = document.body.dataset.searchQuery || new URLSearchParams(location.search).get('q') || '';
      return `/api/search/next?continuation=${encodeURIComponent(continuation)}&q=${encodeURIComponent(q)}`;
    }
    if (isChannel) return `/api/channel/next?continuation=${encodeURIComponent(continuation)}&id=${encodeURIComponent(grid.dataset.channel)}`;
    if (grid.closest('.page-playlist')) return `/api/channel/next?continuation=${encodeURIComponent(continuation)}`;
    return null;
  };

  async function loadNext() {
    if (!continuation || loading) return;
    loading = true;
    more.hidden = true;
    if (spinner) spinner.hidden = false;
    try {
      const data = isSearch || isChannel || grid.closest('.page-playlist')
        ? await api(endpoint())
        : await api('/api/feed/next', { method: 'POST', body: { continuation, kind } });
      const items = data.items || data.videos || [];
      grid.insertAdjacentHTML('beforeend', items.map((v, i) => render.videoHtml(v, { index: page * 20 + i })).join(''));
      continuation = data.continuation || '';
      more.dataset.continuation = continuation;
      page += 1;
    } catch (e) {
      notify(e.message || '続きを読むことに失敗しました。');
    } finally {
      loading = false;
      if (spinner) spinner.hidden = true;
      more.hidden = !continuation;
    }
  }

  more.addEventListener('click', loadNext);

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting) && continuation) loadNext();
    }, { rootMargin: '600px' });
    io.observe(more);
  }
})();
