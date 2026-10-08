/** YouTube TV device authorization dialogs and polling. */
(() => {
  'use strict';
  const { $, api, notify, copyText, authStatus } = window.WT;

  const dialogs = {
    login: $('#authDialog'),
    tv: $('#tvDialog'),
    authed: $('#authedDialog'),
    error: $('#authErrorDialog'),
  };
  let pollTimer = null;

  const closeAll = () => { Object.values(dialogs).forEach((d) => { if (d) d.hidden = true; }); };
  const open = (name) => { closeAll(); dialogs[name]?.removeAttribute('hidden'); };

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeAll();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  document.addEventListener('wt:open-auth', () => onAuthMenu());

  const authMenu = $('#authMenuAction');
  authMenu?.addEventListener('click', () => {
    $('#accountMenuPopover')?.setAttribute('hidden', '');
    onAuthMenu();
  });

  async function onAuthMenu() {
    const state = await authStatus(true);
    if (state.status === 'signed_in') {
      const name = $('#authedName');
      const handle = $('#authedHandle');
      const avatar = $('#authedAvatar');
      if (name) name.textContent = state.account?.name || 'YouTubeアカウント';
      if (handle) handle.textContent = state.account?.handle || '';
      if (avatar) {
        avatar.classList.toggle('placeholder', !state.account?.avatar);
        avatar.innerHTML = state.account?.avatar ? `<img src="${window.WT.esc(state.account.avatar)}" alt="">` : window.WT.esc((state.account?.name || 'W').slice(0, 1));
      }
      open('authed');
    } else if (state.status === 'pending') {
      showCode(state);
    } else if (state.status === 'error') {
      showError(state.error);
    } else {
      open('login');
    }
  }

  function showCode(state) {
    const code = $('#tvUserCode');
    const url = $('#tvVerifyUrl');
    const status = $('#tvStatus');
    if (code) code.textContent = state.userCode || '----------';
    if (url && state.verificationUrl) url.href = state.verificationUrl;
    if (status) status.textContent = '認証を待っています…';
    open('tv');
    startPolling();
  }

  function showError(message) {
    const el = $('#authErrorMessage');
    if (el) el.textContent = message || '認証に失敗しました。';
    open('error');
  }

  $('#authStartButton')?.addEventListener('click', async () => {
    const btn = $('#authStartButton');
    const progress = $('#authProgress');
    btn.disabled = true;
    if (progress) progress.hidden = false;
    try {
      const data = await api('/api/auth/start', { method: 'POST' });
      showCode(data);
    } catch (e) {
      showError(e.message);
    } finally {
      btn.disabled = false;
      if (progress) progress.hidden = true;
    }
  });

  $('#tvUserCode')?.addEventListener('click', async () => {
    const code = $('#tvUserCode')?.textContent || '';
    if (!code) return;
    const ok = await copyText(code);
    notify(ok ? '認証コードをコピーしました' : 'コピーできませんでした。');
  });

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        const state = await authStatus(true);
        if (state.status === 'signed_in') {
          stopPolling();
          notify('ログインしました');
          setTimeout(() => location.reload(), 700);
        } else if (state.status === 'error') {
          stopPolling();
          showError(state.error);
        } else if (state.status === 'signed_out') {
          stopPolling();
          closeAll();
        }
      } catch { /* keep polling */ }
    }, 4000);
  }

  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  $('#authSignOut')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/signout', { method: 'POST' });
      notify('ログアウトしました');
      stopPolling();
      setTimeout(() => location.reload(), 600);
    } catch (e) { notify(e.message); }
  });

  $('#authRetry')?.addEventListener('click', () => { open('login'); });

  $('#settingsSignIn')?.addEventListener('click', () => onAuthMenu());
  $('#settingsSignOut')?.addEventListener('click', () => $('#authSignOut')?.click());
  $('#librarySignIn')?.addEventListener('click', () => onAuthMenu());

  // keep the header label in sync
  authStatus().then((s) => {
    const label = $('#authMenuLabel');
    if (label) label.textContent = s.status === 'signed_in' ? 'ログアウト' : 'YouTubeアカウントでログイン';
  }).catch(() => {});
})();
