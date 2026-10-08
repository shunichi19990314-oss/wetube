/** Header: search suggestions, mobile search, popovers, notifications. */
(() => {
  'use strict';
  const { $, $$, esc, api, notify, store, debounce } = window.WT;

  /* ----- search suggestions ----- */
  const input = $('#searchInput');
  const box = $('#searchSuggestions');
  const clearBtn = $('#searchClear');
  let activeIndex = -1;
  let current = [];

  const closeBox = () => { if (box) box.hidden = true; activeIndex = -1; };

  const renderBox = (items, q) => {
    if (!box) return;
    current = items;
    if (!items.length) return closeBox();
    box.innerHTML = items
      .map((s) => {
        const i = s.toLowerCase().indexOf(q.toLowerCase());
        const label = i >= 0 && q ? `${esc(s.slice(0, i))}<b>${esc(s.slice(i, i + q.length))}</b>${esc(s.slice(i + q.length))}` : esc(s);
        return `<div class="suggestion" role="option" data-value="${esc(s)}">${window.WT.render.icon('search')}<span>${label}</span></div>`;
      })
      .join('');
    box.hidden = false;
    activeIndex = -1;
  };

  const fetchSuggestions = debounce(async (q) => {
    if (!q) return closeBox();
    try {
      const data = await api(`/api/suggestions?q=${encodeURIComponent(q)}`);
      renderBox(data.suggestions || [], q);
    } catch {
      closeBox();
    }
  }, 180);

  input?.addEventListener('input', () => {
    if (clearBtn) clearBtn.hidden = !input.value;
    fetchSuggestions(input.value.trim());
  });
  input?.addEventListener('focus', () => { if (input.value.trim()) fetchSuggestions(input.value.trim()); });
  input?.addEventListener('keydown', (e) => {
    if (!box || box.hidden) return;
    const items = $$('.suggestion', box);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
      e.preventDefault();
      const v = items[activeIndex].dataset.value;
      pushSearchHistory(v);
      location.href = `/search?q=${encodeURIComponent(v)}`;
    } else if (e.key === 'Escape') {
      closeBox();
    }
  });

  box?.addEventListener('click', (e) => {
    const el = e.target.closest('.suggestion');
    if (!el) return;
    const v = el.dataset.value;
    pushSearchHistory(v);
    location.href = `/search?q=${encodeURIComponent(v)}`;
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) closeBox();
  });

  clearBtn?.addEventListener('click', () => {
    if (!input) return;
    input.value = '';
    clearBtn.hidden = true;
    input.focus();
    closeBox();
  });

  function pushSearchHistory(q) {
    if (!q) return;
    const list = store.list('searchHistory').filter((x) => x !== q);
    list.unshift(q);
    store.set('searchHistory', list.slice(0, 30));
  }

  $('.search-form')?.addEventListener('submit', () => pushSearchHistory(input?.value.trim()));

  /* ----- mobile search ----- */
  $('#mobileSearchOpen')?.addEventListener('click', () => {
    document.body.classList.add('search-open');
    input?.focus();
  });
  $('#mobileSearchClose')?.addEventListener('click', () => {
    document.body.classList.remove('search-open');
    input?.blur();
  });

  /* ----- popovers ----- */
  const toggles = [
    ['#accountButton', '#accountMenuPopover'],
    ['#notificationsButton', '#notificationsPopover'],
  ];
  toggles.forEach(([btnSel, popSel]) => {
    const btn = $(btnSel);
    const pop = $(popSel);
    if (!btn || !pop) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = pop.hidden;
      closePopovers();
      pop.hidden = !willOpen;
      if (willOpen && popSel === '#notificationsPopover') loadNotifications();
    });
    pop.addEventListener('click', (e) => e.stopPropagation());
  });

  function closePopovers() {
    $$('.header-popover').forEach((p) => { p.hidden = true; });
  }
  document.addEventListener('click', closePopovers);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopovers(); });
  $('#closeNotifPopover')?.addEventListener('click', closePopovers);

  /* ----- notifications ----- */
  const notifList = $('#notificationsList');
  const badge = $('#notifBadge');
  let notifLoaded = false;

  async function loadNotifications() {
    if (!notifList || notifLoaded) return;
    notifList.innerHTML = '<div class="popover-loading"><span></span><span></span><span></span></div>';
    try {
      const data = await api('/api/notifications');
      const items = data.notifications || [];
      notifLoaded = true;
      if (!items.length) {
        notifList.innerHTML = `<p class="muted" style="padding:20px;text-align:center">${data.authenticated ? '新しい通知はありません' : 'ログインすると通知を表示できます'}</p>`;
        return;
      }
      const unread = items.filter((n) => !n.read).length;
      if (badge && unread) { badge.hidden = false; badge.textContent = String(unread); }
      notifList.innerHTML = items
        .slice(0, 40)
        .map((n) => `<a class="notif-item${n.read ? '' : ' unread'}" href="${esc(n.href || '#')}">
          ${n.avatar ? `<img loading="lazy" src="${esc(n.avatar)}" alt="">` : `<span class="notif-avatar">${window.WT.render.icon('bell')}</span>`}
          <span class="notif-body"><b>${esc(n.text || n.title || '')}</b><small>${esc(n.time || '')}</small></span>
        </a>`)
        .join('');
    } catch (e) {
      notifList.innerHTML = `<p class="muted" style="padding:20px">${esc(e.message)}</p>`;
    }
  }

  /* ----- keyboard: "/" focuses search ----- */
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    e.preventDefault();
    document.body.classList.add('search-open');
    input?.focus();
  });
})();
