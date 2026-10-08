/** Settings page: playback preferences, data export / clear. */
(() => {
  'use strict';
  const { $, notify, store } = window.WT;
  if (document.body.dataset.page !== 'settings') return;

  const settings = store.get('settings', {});

  const bind = (id, key, type = 'checked') => {
    const el = $(id);
    if (!el) return;
    if (type === 'checked') el.checked = settings[key] !== undefined ? !!settings[key] : el.checked;
    else el.value = settings[key] !== undefined ? settings[key] : el.value;
    el.addEventListener('change', () => {
      const next = { ...store.get('settings', {}) };
      next[key] = type === 'checked' ? el.checked : el.value;
      store.set('settings', next);
      notify('設定を保存しました', { duration: 1600 });
      if (key === 'theme') window.WT.theme?.set(next.theme);
    });
  };

  bind('#settingAutoplay', 'autoplay');
  bind('#settingAnnotations', 'annotations');
  bind('#settingTheater', 'theater');
  bind('#settingMute', 'mute');
  bind('#settingQuality', 'source', 'value');
  bind('#settingSpeed', 'speed', 'value');

  $('#settingsExport')?.addEventListener('click', () => {
    const dump = {};
    ['history', 'watchLater', 'likedVideos', 'dislikedVideos', 'subscriptions', 'searchHistory', 'queue', 'playlists', 'settings'].forEach((k) => {
      dump[k] = store.get(k, k === 'settings' ? {} : []);
    });
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wetube-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify('データを書き出しました');
  });

  $('#settingsClearLocal')?.addEventListener('click', () => {
    if (!window.confirm('この端末に保存したデータをすべて消去しますか？')) return;
    ['history', 'watchLater', 'likedVideos', 'dislikedVideos', 'subscriptions', 'searchHistory', 'queue', 'playlists', 'recommendationCache'].forEach((k) => store.remove(k));
    notify('端末のデータを消去しました');
    setTimeout(() => location.reload(), 800);
  });
})();
