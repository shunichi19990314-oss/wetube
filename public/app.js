/**
 * Core client runtime: DOM helpers, JSON API wrapper, toasts, the local
 * account-data store (history / watch later / likes / subscriptions / queue /
 * playlists / search history) and shared card renderers used by every page.
 *
 * Exposes a single global `WT` namespace that the other scripts build on.
 */
(() => {
  'use strict';

  const $ = (s, el = document) => (el || document).querySelector(s);
  const $$ = (s, el = document) => Array.from((el || document).querySelectorAll(s));

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- json api ---------------- */

  async function api(path, options = {}) {
    const init = { cache: 'no-store', credentials: 'same-origin', ...options };
    if (init.body && typeof init.body !== 'string') {
      init.body = JSON.stringify(init.body);
      init.headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
    }
    const res = await fetch(path, init);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json().catch(() => ({})) : { error: '応答を解析できませんでした。' };
    if (!res.ok) {
      const e = new Error(data.error || `リクエストに失敗しました (${res.status})`);
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  /* ---------------- toasts ---------------- */

  function notify(message, { action = null, duration = 3200 } = {}) {
    const root = $('#toastRoot');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(message)}</span>`;
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        action.onClick?.();
        el.remove();
      });
      el.append(btn);
    }
    root.append(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s';
      setTimeout(() => el.remove(), 260);
    }, duration);
    return el;
  }

  /* ---------------- local account data ---------------- */

  const ACCOUNT_KEYS = new Set([
    'history', 'watchLater', 'likedVideos', 'dislikedVideos', 'subscriptions',
    'searchHistory', 'queue', 'playlists', 'recommendationCache',
  ]);

  const isAuthed = () => document.body.dataset.authenticated === 'true';
  const useLocal = (key) => !ACCOUNT_KEYS.has(key) || !isAuthed();

  function readJson(key, fallback) {
    if (!useLocal(key)) return fallback;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    if (!useLocal(key)) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  const store = {
    get: readJson,
    set: writeJson,
    remove(key) {
      localStorage.removeItem(key);
    },
    /** history / watchLater / liked helpers */
    list(key) {
      return readJson(key, []);
    },
    upsert(key, item, { max = 500 } = {}) {
      const list = readJson(key, []).filter((x) => x && x.id !== item.id);
      list.unshift(item);
      writeJson(key, list.slice(0, max));
      return list;
    },
    removeItem(key, id) {
      const list = readJson(key, []).filter((x) => x?.id !== id);
      writeJson(key, list);
      return list;
    },
    toggle(key, item) {
      const list = readJson(key, []);
      const exists = list.some((x) => x?.id === item.id);
      const next = exists ? list.filter((x) => x?.id !== item.id) : [item, ...list];
      writeJson(key, next.slice(0, 500));
      return { exists: !exists, list: next };
    },
    clear(key) {
      writeJson(key, []);
    },
  };

  /* ---------------- auth state ---------------- */

  let authPromise = null;
  let authState = { status: 'signed_out', account: null };

  function authStatus(refresh = false) {
    if (refresh || !authPromise) {
      authPromise = api('/api/auth/status')
        .then((data) => {
          authState = data;
          return data;
        })
        .catch(() => {
          authState = { status: 'signed_out', account: null };
          return authState;
        });
    }
    return authPromise;
  }

  /* ---------------- shared renderers ---------------- */

  function proxy(url) {
    if (!url) return '';
    if (url.startsWith('/') || url.startsWith('data:')) return url;
    return `/image-proxy?url=${encodeURIComponent(url)}`;
  }

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  function videoHtml(v, { layout = 'grid', index = 0 } = {}) {
    if (!v || (!v.id && !v.title)) return '';
    const href = v.href || (v.id ? `/watch?v=${encodeURIComponent(v.id)}` : '#');
    const thumb = v.thumbnail || proxy(`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`);
    const line = [v.views, v.published].filter(Boolean).join('・');
    const channelHref = v.authorId ? `/channel/${encodeURIComponent(v.authorId)}` : '#';
    return `<article class="video-card ${layout === 'row' ? 'video-card-row' : ''}" data-video-id="${esc(v.id || '')}" data-index="${index}">
  <a class="video-thumb" href="${esc(href)}" aria-label="${esc(v.title || '')}">
    <img loading="lazy" src="${esc(thumb)}" alt="">
    ${v.duration ? `<span class="thumb-duration${v.isLive ? ' live' : ''}">${esc(v.duration)}</span>` : ''}
    <span class="thumb-hover">
      <button class="thumb-action" data-action="queue" title="キューに追加" aria-label="キューに追加">${icon('queue')}</button>
      <button class="thumb-action" data-action="watch-later" title="後で見るに保存" aria-label="後で見るに保存">${icon('clock')}</button>
    </span>
  </a>
  <div class="video-meta">
    <a class="channel-thumb" href="${esc(channelHref)}" tabindex="-1" aria-hidden="true">
      ${v.authorThumbnail ? `<img loading="lazy" src="${esc(v.authorThumbnail)}" alt="">` : `<span class="channel-thumb-fallback">${esc((v.author || '?').slice(0, 1))}</span>`}
    </a>
    <div class="video-meta-text">
      <h3 class="video-title"><a href="${esc(href)}" title="${esc(v.title || '')}">${esc(v.title || '')}</a></h3>
      <p class="video-author">${v.authorId ? `<a href="${esc(channelHref)}">${esc(v.author || '')}</a>` : esc(v.author || '')}</p>
      <p class="video-stats">${esc(line)}</p>
      ${layout === 'row' && v.description ? `<p class="video-desc">${esc(String(v.description).slice(0, 160))}</p>` : ''}
    </div>
    <button class="card-menu icon-btn-sm" data-action="menu" aria-label="操作メニュー">${icon('more')}</button>
  </div>
</article>`;
  }

  function compactHtml(v, { active = false } = {}) {
    if (!v?.id) return '';
    return `<a class="compact-video${active ? ' active' : ''}" href="/watch?v=${encodeURIComponent(v.id)}" data-video-id="${esc(v.id)}">
  <span class="compact-thumb"><img loading="lazy" src="${esc(v.thumbnail || '')}" alt="">${v.duration ? `<span class="thumb-duration">${esc(v.duration)}</span>` : ''}</span>
  <span class="compact-meta">
    <span class="compact-title">${esc(v.title || '')}</span>
    <span class="compact-author">${esc(v.author || '')}</span>
    <span class="compact-stats">${esc([v.views, v.published].filter(Boolean).join('・'))}</span>
  </span>
</a>`;
  }

  function shortHtml(s) {
    if (!s?.id) return '';
    return `<a class="short-card" href="/shorts/${encodeURIComponent(s.id)}" data-video-id="${esc(s.id)}">
  <span class="short-thumb"><img loading="lazy" src="${esc(s.thumbnail || '')}" alt=""></span>
  <span class="short-title">${esc(s.title || '')}</span>
  <span class="short-views">${esc(s.views || '')}</span>
</a>`;
  }

  function commentHtml(c, { reply = false } = {}) {
    const avatar = c.avatar
      ? `<img class="comment-avatar" loading="lazy" src="${esc(c.avatar)}" alt="">`
      : `<span class="comment-avatar fallback">${esc((c.author || '?').slice(0, 1))}</span>`;
    return `<div class="comment${reply ? ' reply' : ''}" data-comment-id="${esc(c.id || '')}">
  ${avatar}
  <div class="comment-body">
    <p class="comment-head"><span class="comment-author">${esc(c.author || '')}</span><span class="comment-time">${esc(c.time || '')}</span>${c.isAuthor ? '<span class="comment-badge owner">投稿者</span>' : ''}${c.heartedByCreator ? '<span class="comment-badge heart">♥</span>' : ''}</p>
    <p class="comment-text">${esc(c.text || '').replace(/\n/g, '<br>')}</p>
    <div class="comment-actions">
      <button class="icon-btn-sm" data-action="comment-like" aria-label="高く評価">${icon('like')}<span>${esc(c.likes || '')}</span></button>
      <button class="icon-btn-sm" data-action="comment-dislike" aria-label="低く評価">${icon('dislike')}</button>
      ${reply ? '' : `<button class="text-btn" data-action="comment-replies"${c.repliesToken ? ` data-token="${esc(c.repliesToken)}"` : ''}>${esc(c.replyCount || '返信')}</button>`}
    </div>
    ${reply ? '' : '<div class="comment-replies" data-replies hidden></div>'}
  </div>
</div>`;
  }

  function channelHtml(c) {
    if (!c?.id && !c?.title) return '';
    const href = c.href || `/channel/${encodeURIComponent(c.id || '')}`;
    return `<article class="channel-card" data-channel-id="${esc(c.id || '')}">
  <a class="channel-card-avatar" href="${esc(href)}">${c.thumbnail ? `<img loading="lazy" src="${esc(c.thumbnail)}" alt="">` : `<span class="channel-thumb-fallback">${esc((c.title || '?').slice(0, 1))}</span>`}</a>
  <h3 class="channel-card-title"><a href="${esc(href)}">${esc(c.title || '')}</a></h3>
  <p class="channel-card-meta">${esc([c.handle, c.subscribers || c.stats].filter(Boolean).join(' ・ '))}</p>
  <button class="btn btn-secondary subscribe-btn" data-action="subscribe" data-channel-id="${esc(c.id || '')}">登録</button>
</article>`;
  }

  function skeletonHtml(count = 8) {
    return Array.from({ length: count })
      .map(
        () =>
          `<div class="video-card skeleton"><div class="sk-thumb"></div><div class="sk-meta"><span class="sk-avatar"></span><div class="sk-lines"><i></i><i></i></div></div></div>`
      )
      .join('');
  }

  /* ---------------- queue ---------------- */

  const queue = {
    all: () => store.list('queue'),
    add(video) {
      if (!video?.id) return [];
      const list = store.list('queue').filter((v) => v.id !== video.id);
      list.push({ id: video.id, title: video.title, author: video.author, thumbnail: video.thumbnail, duration: video.duration });
      store.set('queue', list.slice(-100));
      document.dispatchEvent(new CustomEvent('wt:queue-changed', { detail: { list } }));
      return list;
    },
    remove(id) {
      const list = store.list('queue').filter((v) => v.id !== id);
      store.set('queue', list);
      document.dispatchEvent(new CustomEvent('wt:queue-changed', { detail: { list } }));
      return list;
    },
    clear() {
      store.set('queue', []);
      document.dispatchEvent(new CustomEvent('wt:queue-changed', { detail: { list: [] } }));
    },
    move(id, dir) {
      const list = store.list('queue');
      const i = list.findIndex((v) => v.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      [list[i], list[j]] = [list[j], list[i]];
      store.set('queue', list);
      document.dispatchEvent(new CustomEvent('wt:queue-changed', { detail: { list } }));
      return list;
    },
  };

  /* ---------------- history ---------------- */

  function recordWatch(videoId, meta = {}) {
    if (!videoId) return;
    if (isAuthed()) {
      // The server records it on YouTube's side; keep a local mirror for the UI.
      api('/api/account/history', { method: 'GET' }).catch(() => {});
    }
    store.upsert('history', {
      id: videoId,
      title: meta.title || document.title.replace(/ \| .+$/, ''),
      author: meta.author || '',
      thumbnail: meta.thumbnail || proxy(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
      duration: meta.duration || '',
      watchedAt: Date.now(),
      position: 0,
    });
    document.dispatchEvent(new CustomEvent('wt:history-changed', { detail: { videoId } }));
  }

  /* ---------------- misc helpers ---------------- */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand?.('copy');
      ta.remove();
      return !!ok;
    }
  }

  const shareUrl = (videoId) => `${location.origin}/watch?v=${encodeURIComponent(videoId)}`;

  function debounce(fn, ms = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function timeAgo(ts) {
    const diff = Date.now() - Number(ts || 0);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min} 分前`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} 時間前`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} 日前`;
    const date = new Date(Number(ts));
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  /* ---------------- expose ---------------- */

  window.WT = {
    $,
    $$,
    esc,
    api,
    notify,
    store,
    queue,
    authStatus,
    get authState() {
      return authState;
    },
    render: { videoHtml, compactHtml, shortHtml, commentHtml, channelHtml, skeletonHtml, icon, proxy },
    recordWatch,
    copyText,
    shareUrl,
    debounce,
    timeAgo,
    isAuthed,
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('wt-ready');
    authStatus().catch(() => {});
  });
})();
