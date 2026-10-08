/** Card action sheet: queue / watch later / like / share / download / copy. */
(() => {
  'use strict';
  const { $, $$, esc, api, notify, store, queue, render, copyText, shareUrl } = window.WT;
  const sheet = $('#cardActionsSheet');
  let target = null;

  function metaFor(videoId) {
    const card = document.querySelector(`[data-video-id="${CSS.escape(videoId)}"]`);
    return {
      id: videoId,
      title: card?.querySelector('.video-title, .compact-title, .short-title')?.textContent?.trim() ||
        document.querySelector('#watchTitle')?.textContent || `動画 (${videoId})`,
      author: card?.querySelector('.video-author, .compact-author')?.textContent?.trim() || '',
      thumbnail: card?.querySelector('img')?.src || render.proxy(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
      duration: card?.querySelector('.thumb-duration')?.textContent?.trim() || '',
    };
  }

  function openSheet(videoId) {
    if (!sheet) return;
    target = metaFor(videoId);
    $('#sheetThumb').src = target.thumbnail || '';
    $('#sheetTitle').textContent = target.title;
    $('#sheetAuthor').textContent = target.author;
    sheet.hidden = false;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const holder = btn.closest('[data-video-id]');
    const videoId = btn.dataset.videoId || holder?.dataset.videoId || document.body.dataset.videoId || '';

    if (action === 'menu') {
      e.preventDefault();
      e.stopPropagation();
      openSheet(videoId);
      return;
    }
    if (action === 'queue' && videoId) {
      e.preventDefault();
      e.stopPropagation();
      queue.add(metaFor(videoId));
      btn.classList.add('active');
      notify('キューに追加しました');
      return;
    }
    if (action === 'watch-later' && videoId) {
      e.preventDefault();
      e.stopPropagation();
      const { exists } = store.toggle('watchLater', metaFor(videoId));
      btn.classList.toggle('active', exists);
      notify(exists ? '「後で見る」に保存しました' : '「後で見る」から削除しました');
      api('/api/interact', { method: 'POST', body: { action: exists ? 'watch-later-add' : 'watch-later-remove', videoId } }).catch(() => {});
      return;
    }
    if (action === 'share' && videoId) {
      e.preventDefault();
      const url = shareUrl(videoId);
      if (navigator.share) navigator.share({ title: target?.title || document.title, url }).catch(() => {});
      else copyText(url).then((ok) => notify(ok ? 'リンクをコピーしました' : 'コピーできませんでした。'));
    }
  });

  sheet?.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-sheet-action]');
    if (!item || !target) return;
    const action = item.dataset.sheetAction;
    sheet.hidden = true;
    switch (action) {
      case 'queue':
        queue.add(target);
        notify('キューに追加しました');
        break;
      case 'watch-later': {
        const { exists } = store.toggle('watchLater', target);
        notify(exists ? '「後で見る」に保存しました' : '「後で見る」から削除しました');
        api('/api/interact', { method: 'POST', body: { action: exists ? 'watch-later-add' : 'watch-later-remove', videoId: target.id } }).catch(() => {});
        break;
      }
      case 'like':
        api('/api/interact', { method: 'POST', body: { action: 'like', videoId: target.id } })
          .then(() => { store.upsert('likedVideos', target); notify('高く評価しました'); })
          .catch((err) => notify(err.message));
        break;
      case 'playlist': {
        const playlists = store.list('playlists');
        const name = window.prompt('保存先の再生リスト名を入力してください', playlists[0]?.name || '新しい再生リスト');
        if (!name) break;
        let list = playlists.find((p) => p.name === name);
        if (!list) { list = { id: `local-${Date.now()}`, name, items: [] }; playlists.unshift(list); }
        if (!list.items.some((v) => v.id === target.id)) list.items.unshift(target);
        store.set('playlists', playlists);
        notify(`「${name}」に保存しました`);
        break;
      }
      case 'download':
        $('#downloadButton')?.click() || $('#streamInfoButton')?.click();
        break;
      case 'share':
      case 'copy': {
        const url = shareUrl(target.id);
        if (action === 'share' && navigator.share) { try { await navigator.share({ title: target.title, url }); break; } catch { /* fallthrough */ } }
        const ok = await copyText(url);
        notify(ok ? 'リンクをコピーしました' : 'コピーできませんでした。');
        break;
      }
      default: break;
    }
  });
})();
