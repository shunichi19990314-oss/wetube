/** Channel page: tabs, subscribe toggle, tab content loading. */
(() => {
  'use strict';
  const { $, $$, api, notify, store, render, esc } = window.WT;
  if (document.body.dataset.page !== 'channel') return;

  const channelId = document.body.dataset.channelId || '';
  const subBtn = $('#channelSubscribe');

  if (subBtn && channelId) {
    const setSubscribed = (v) => {
      subBtn.classList.toggle('subscribed', v);
      subBtn.textContent = v ? '登録済み' : '登録';
      subBtn.dataset.subscribed = v ? 'true' : 'false';
    };
    if (document.body.dataset.authenticated === 'true') {
      api(`/api/account/channel-state?id=${encodeURIComponent(channelId)}`).then((s) => setSubscribed(!!s.subscribed)).catch(() => {});
    } else if (store.list('subscriptions').some((c) => c.id === channelId)) {
      setSubscribed(true);
    }

    subBtn.addEventListener('click', async () => {
      const next = subBtn.dataset.subscribed !== 'true';
      setSubscribed(next);
      if (next) store.upsert('subscriptions', { id: channelId, title: $('.channel-name')?.textContent || '' });
      else store.removeItem('subscriptions', channelId);
      try {
        await api('/api/interact', { method: 'POST', body: { action: next ? 'subscribe' : 'unsubscribe', channelId } });
      } catch (e) {
        setSubscribed(!next);
        if (e.status !== 401) notify(e.message);
      }
      notify(next ? 'チャンネルを登録しました' : '登録を解除しました');
    });
  }

  // Client-side tab switching keeps the URL clean and avoids a full reload.
  $$('#channelTabs .channel-tab').forEach((tab) => {
    tab.addEventListener('click', async (e) => {
      const href = tab.getAttribute('href');
      if (!href || href === location.pathname) return;
      e.preventDefault();
      history.pushState({}, '', href);
      $$('#channelTabs .channel-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const grid = $('#channelGrid');
      if (grid) grid.innerHTML = render.skeletonHtml(12);
      try {
        const html = await fetch(href).then((r) => r.text());
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const newGrid = doc.querySelector('#channelGrid');
        if (grid && newGrid) grid.innerHTML = newGrid.innerHTML;
        const more = doc.querySelector('#feedLoadMore');
        const moreLocal = $('#feedLoadMore');
        if (more && moreLocal) {
          moreLocal.dataset.continuation = more.dataset.continuation || '';
          moreLocal.hidden = !more.dataset.continuation;
        }
      } catch (err) {
        notify('タブを読み込めませんでした。');
      }
    });
  });
})();
