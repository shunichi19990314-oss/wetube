/** Library pages: server data when signed in, local data otherwise. */
(() => {
  'use strict';
  const { $, $$, api, notify, store, render, esc, isAuthed } = window.WT;
  if (document.body.dataset.page !== 'library') return;

  const kind = document.body.dataset.libraryKind;
  const grid = $('#libraryGrid');
  const localWrap = $('#libraryLocal');
  const localGrid = $('#libraryLocalGrid');
  if (!grid) return;

  const LOCAL_MAP = {
    history: 'history',
    liked: 'likedVideos',
    'watch-later': 'watchLater',
    subscriptions: 'subscriptions',
    playlists: 'playlists',
  };

  const toCard = (item) => ({
    id: item.id,
    title: item.title,
    author: item.author || '',
    thumbnail: item.thumbnail || render.proxy(`https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`),
    duration: item.duration || '',
    views: item.views || (item.watchedAt ? window.WT.timeAgo(item.watchedAt) : ''),
    published: item.published || '',
    href: kind === 'subscriptions' ? `/channel/${encodeURIComponent(item.id)}` : `/watch?v=${encodeURIComponent(item.id)}`,
  });

  function renderLocal() {
    const key = LOCAL_MAP[kind];
    if (!key) return;
    const items = store.list(key);
    if (isAuthed()) {
      // Show local items in a secondary section so nothing gets lost.
      if (localWrap && localGrid && items.length) {
        localWrap.hidden = false;
        localGrid.innerHTML = kind === 'subscriptions'
          ? items.map(render.channelHtml).join('')
          : items.map((i, n) => render.videoHtml(toCard(i), { index: n })).join('');
      }
      return;
    }
    grid.innerHTML = items.length
      ? (kind === 'subscriptions'
          ? items.map((c) => render.channelHtml({ id: c.id, title: c.title, thumbnail: c.thumbnail || c.avatar, handle: c.handle })).join('')
          : items.map((i, n) => render.videoHtml(toCard(i), { index: n })).join(''))
      : grid.innerHTML;
  }

  async function loadRemote() {
    if (!isAuthed()) return;
    const path = { history: '/api/account/history', liked: '/api/account/liked', 'watch-later': '/api/account/watch-later', subscriptions: '/api/account/subscriptions', playlists: '/api/account/playlists' }[kind];
    if (!path) return;
    if (grid.children.length) return; // server already rendered the first page
    grid.innerHTML = render.skeletonHtml(8);
    try {
      const data = await api(path);
      const items = data.items || [];
      grid.innerHTML = items.length
        ? (kind === 'subscriptions' ? items.map(render.channelHtml).join('') : items.map((v, i) => render.videoHtml(v, { index: i })).join(''))
        : `<div class="empty-state"><p>データがありません。</p></div>`;
      const more = $('#feedLoadMore');
      if (more && data.continuation) { more.hidden = false; more.dataset.continuation = data.continuation; more.dataset.target = 'library'; }
    } catch (e) {
      grid.innerHTML = `<p class="feed-error">${esc(e.message)}</p>`;
    }
  }

  loadRemote();
  renderLocal();

  document.addEventListener('wt:history-changed', () => { if (kind === 'history') renderLocal(); });
  document.addEventListener('wt:queue-changed', renderLocal);
})();
