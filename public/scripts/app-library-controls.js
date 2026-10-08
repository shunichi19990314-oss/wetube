/** Library controls: clear all, sort, manage, new playlist, play all. */
(() => {
  'use strict';
  const { $, api, notify, store, render } = window.WT;

  const LOCAL_MAP = { history: 'history', liked: 'likedVideos', 'watch-later': 'watchLater', playlists: 'playlists', subscriptions: 'subscriptions' };

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-library-action]');
    if (btn) {
      const action = btn.dataset.libraryAction;
      const kind = btn.dataset.kind || document.body.dataset.libraryKind;
      if (action === 'clear') {
        if (!window.confirm('すべての項目を削除しますか？')) return;
        const key = LOCAL_MAP[kind];
        if (key) store.clear(key);
        try { await api('/api/interact', { method: 'POST', body: { action: `${kind}-clear` } }); } catch { /* not supported upstream */ }
        notify('削除しました');
        const grid = $('#libraryGrid');
        if (grid) grid.innerHTML = '<div class="empty-state"><p>データがありません。</p></div>';
        return;
      }
      if (action === 'sort') {
        const grid = $('#libraryGrid');
        if (!grid) return;
        const asc = grid.dataset.sort === 'asc';
        grid.dataset.sort = asc ? 'desc' : 'asc';
        const cards = Array.from(grid.children);
        cards.reverse().forEach((c) => grid.append(c));
        notify(asc ? '古い順に並べ替えました' : '新しい順に並べ替えました');
        return;
      }
      if (action === 'new') {
        const name = window.prompt('再生リスト名を入力してください');
        if (!name) return;
        const playlists = store.list('playlists');
        playlists.unshift({ id: `local-${Date.now()}`, name, items: [] });
        store.set('playlists', playlists);
        notify('再生リストを作成しました');
        renderPlaylists();
        return;
      }
      if (action === 'manage') {
        notify('登録チャンネルの管理はYouTubeアカウントで行えます。', { action: { label: 'ログイン', onClick: () => document.dispatchEvent(new CustomEvent('wt:open-auth')) } });
      }
      return;
    }

    const playAll = e.target.closest('#playlistPlayAll');
    if (playAll) {
      const first = playAll.dataset.first;
      if (first) location.href = `/watch?v=${encodeURIComponent(first)}`;
      else notify('再生する動画がありません。');
      return;
    }

    const queueAll = e.target.closest('[data-action="queue-all"]');
    if (queueAll) {
      const rows = Array.from(document.querySelectorAll('#playlistList .playlist-row'));
      rows.forEach((row) => {
        const id = row.dataset.videoId;
        if (!id) return;
        window.WT.queue.add({
          id,
          title: row.querySelector('h3')?.textContent?.trim() || '',
          author: row.querySelector('.muted')?.textContent?.trim() || '',
          thumbnail: row.querySelector('img')?.src || '',
        });
      });
      notify(`${rows.length} 件の動画をキューに追加しました`);
    }
  });

  function renderPlaylists() {
    if (document.body.dataset.libraryKind !== 'playlists') return;
    const grid = $('#libraryGrid');
    if (!grid) return;
    const playlists = store.list('playlists');
    grid.innerHTML = playlists
      .map((p) => `<article class="video-card playlist-card" data-playlist-id="${window.WT.esc(p.id)}">
        <div class="video-thumb"><span class="thumb-count">${window.WT.render.icon('playlist')} ${p.items?.length || 0}</span></div>
        <div class="video-meta"><div class="video-meta-text">
          <h3 class="video-title">${window.WT.esc(p.name)}</h3>
          <p class="video-stats">${(p.items || []).length} 本の動画</p>
        </div></div>
      </article>`)
      .join('');
  }

  if (document.body.dataset.libraryKind === 'playlists' && !document.querySelector('#libraryGrid .playlist-card')) renderPlaylists();
})();
