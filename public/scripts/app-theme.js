/** Theme handling: device / dark / light, persisted per browser. */
(() => {
  'use strict';
  const { $, $$, esc } = window.WT;
  const KEY = 'settings';

  const apply = (theme) => {
    document.documentElement.dataset.theme = theme || 'device';
    const label = $('#currentThemeLabel');
    if (label) label.textContent = { device: '端末の設定を使用', dark: 'ダークテーマ', light: 'ライトテーマ' }[theme] || '端末の設定を使用';
    $$('input[name="theme"], input[name="theme-setting"]').forEach((r) => { r.checked = r.value === theme; });
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'dark light';
  };

  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } })();
  apply(saved.theme || 'device');

  const persist = (theme) => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { s = {}; }
    s.theme = theme;
    localStorage.setItem(KEY, JSON.stringify(s));
    apply(theme);
  };

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el?.name === 'theme' || el?.name === 'theme-setting') persist(el.value);
  });

  $('#themeMenuTrigger')?.addEventListener('click', () => {
    $('#accountMenuPopover')?.setAttribute('hidden', '');
    $('#themeDialog')?.removeAttribute('hidden');
  });

  // system theme changes while in "device" mode
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    const s = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } })();
    if (!s.theme || s.theme === 'device') apply('device');
  });

  window.WT.theme = { apply, set: persist, get: () => document.documentElement.dataset.theme };
})();
