/** Playback queue dialog. */
(() => {
  'use strict';
  const { $, esc, notify, queue } = window.WT;
  const dialog = $('#queueDialog');
  const list = $('#queueList');
  if (!dialog || !list) return;

  const currentId = document.body.dataset.videoId || '';

  function render() {
    const items = queue.all();
    if (!items.length) {
      list.innerHTML = '<p class="muted" style="padding:16px;text-align:center">キューは空です</p>';
      return;
    }
    list.innerHTML = items
      .map((v, i) => `<div class="queue-item${v.id === currentId ? ' active' : ''}" data-video-id="${esc(v.id)}">
        <span class="queue-index">${i + 1}</span>
        <a href="/watch?v=${encodeURIComponent(v.id)}"><img loading="lazy" src="${esc(v.thumbnail || '')}" alt=""></a>
        <div class="queue-item-meta">
          <b><a href="/watch?v=${encodeURIComponent(v.id)}">${esc(v.title || '')}</a></b>
          <span>${esc(v.author || '')}</span>
        </div>
        <button class="icon-btn-sm" data-queue-action="up" aria-label="上へ">▲</button>
        <button class="icon-btn-sm" data-queue-action="down" aria-label="下へ">▼</button>
        <button class="icon-btn-sm" data-queue-action="remove" aria-label="削除">✕</button>
      </div>`)
      .join('');
  }

  $('#queueButton')?.addEventListener('click', () => { render(); dialog.hidden = false; });
  $('#queueClear')?.addEventListener('click', () => { queue.clear(); render(); notify('キューを消去しました'); });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-queue-action]');
    if (!btn) return;
    const row = btn.closest('.queue-item');
    const id = row?.dataset.videoId;
    if (!id) return;
    if (btn.dataset.queueAction === 'remove') queue.remove(id);
    else if (btn.dataset.queueAction === 'up') queue.move(id, -1);
    else queue.move(id, 1);
    render();
  });

  document.addEventListener('wt:queue-changed', () => { if (!dialog.hidden) render(); });
  dialog.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dialog.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dialog.hidden) dialog.hidden = true; });
})();
