/**
 * Watch page behaviour: embedded / direct-stream playback, player modes,
 * actions (like, watch later, share, download, queue), description, comments,
 * related videos, live chat, theater / fullscreen / mini player and the
 * keyboard shortcuts that apply on this page.
 */
(() => {
  'use strict';
  if (document.body.dataset.page !== 'watch') return;

  const { $, $$, esc, api, notify, store, queue, render, recordWatch, copyText, shareUrl } = window.WT;
  const { commentHtml, compactHtml } = render;

  const videoId = document.body.dataset.videoId || new URLSearchParams(location.search).get('v') || '';
  const channelId = document.body.dataset.channelId || '';
  const liveChatId = document.body.dataset.chatId || '';
  const degraded = document.body.dataset.degraded === '1';

  const playerFrame = $('#player');
  const streamPlayer = $('#streamPlayer');
  const modeSelect = $('#playerModeSelect');
  const shell = $('#playerShell');

  let ytPlayer = null;
  let ytReady = false;
  let iframeInitRequested = false;
  let currentMode = modeSelect?.value || 'youtube';
  let playbackRate = 1;
  let isPlaying = false;
  let miniActive = false;
  let watchRecorded = false;

  /* ---------------- embedded player ---------------- */

  function initIframePlayer() {
    if (iframeInitRequested || !playerFrame) return;
    iframeInitRequested = true;
    const build = () => {
      try {
        ytPlayer = new window.YT.Player('player', {
          events: {
            onReady: () => {
              ytReady = true;
              applyRate();
              if (store.get('settings', {}).mute) ytPlayer.mute?.();
            },
            onStateChange: (e) => {
              isPlaying = e.data === 1;
              if (e.data === 1) onPlaybackStart();
              if (e.data === 0) onPlaybackEnd();
              updateMiniPlayButton();
            },
            onPlaybackRateChange: (e) => {
              playbackRate = e.data;
            },
          },
        });
      } catch {
        ytPlayer = null;
      }
    };
    if (window.YT?.Player) build();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        build();
      };
    }
  }

  const cmd = (fn, ...args) => {
    try {
      if (currentMode === 'stream' && streamPlayer) {
        return streamFn(fn, ...args);
      }
      if (ytReady && ytPlayer?.[fn]) return ytPlayer[fn](...args);
      return undefined;
    } catch {
      return undefined;
    }
  };

  const streamFn = (fn, ...args) => {
    if (!streamPlayer) return undefined;
    switch (fn) {
      case 'playVideo': return streamPlayer.play().catch(() => {});
      case 'pauseVideo': return streamPlayer.pause();
      case 'seekTo': streamPlayer.currentTime = args[0]; return undefined;
      case 'getCurrentTime': return streamPlayer.currentTime;
      case 'getDuration': return streamPlayer.duration || 0;
      case 'mute': streamPlayer.muted = true; return undefined;
      case 'unMute': streamPlayer.muted = false; return undefined;
      case 'isMuted': return streamPlayer.muted;
      case 'setPlaybackRate': streamPlayer.playbackRate = args[0]; return undefined;
      case 'getPlaybackRate': return streamPlayer.playbackRate;
      default: return undefined;
    }
  };

  function onPlaybackStart() {
    isPlaying = true;
    if (!watchRecorded) {
      watchRecorded = true;
      recordWatch(videoId, {
        title: $('#watchTitle')?.textContent || document.title,
        author: $('.watch-channel-name')?.textContent || '',
        thumbnail: document.querySelector('meta[property="og:image"]')?.content || '',
      });
    }
    cancelCountdown();
  }

  function onPlaybackEnd() {
    isPlaying = false;
    if ($('#autoplayToggle')?.checked) startCountdown();
  }

  /* ---------------- playback mode ---------------- */

  function setIframeMode(mode) {
    if (!playerFrame) return;
    if (streamPlayer) {
      streamPlayer.pause();
      streamPlayer.removeAttribute('src');
      streamPlayer.hidden = true;
    }
    playerFrame.hidden = false;
    let src = modeSelect?.dataset.youtube;
    if (mode === 'nocookie') src = modeSelect?.dataset.nocookie || src;
    else if (mode.startsWith('edu')) {
      let sources = [];
      try { sources = JSON.parse(modeSelect?.dataset.eduSources || '[]'); } catch { /* noop */ }
      const i = Math.max(0, Number(mode.split(':')[1]) || 0);
      src = sources[i]?.url || modeSelect?.dataset.edu || src;
    }
    if (playerFrame.src !== src) playerFrame.src = src;
    currentMode = mode;
    initIframePlayer();
    applyRate();
  }

  async function setStreamMode() {
    currentMode = 'stream';
    if (playerFrame) {
      playerFrame.hidden = true;
      playerFrame.src = 'about:blank';
    }
    if (!streamPlayer) return;
    streamPlayer.hidden = false;
    notify('ストリームURLを取得しています…', { duration: 1600 });
    try {
      const data = await api(`/api/stream-info?v=${encodeURIComponent(videoId)}`);
      const formats = Array.isArray(data.formats) ? data.formats : [];
      const mp4 = formats.find((f) => {
        if (!f.url) return false;
        const mime = String(f.mimeType || '').toLowerCase();
        return mime.includes('mp4') || mime.includes('webm') || !mime;
      });
      if (!mp4) throw new Error('再生可能なストリームがありません。');
      streamPlayer.src = mp4.url;
      streamPlayer.load();
      await streamPlayer.play().catch(() => {});
      applyRate();
    } catch (e) {
      notify(e.message || 'ストリームを再生できませんでした。');
      setIframeMode(modeSelect?.value === 'stream' ? 'youtube' : modeSelect?.value || 'youtube');
      if (modeSelect) modeSelect.value = 'youtube';
    }
  }

  modeSelect?.addEventListener('change', () => {
    if (modeSelect.value === 'stream') setStreamMode();
    else setIframeMode(modeSelect.value);
    store.set('settings', { ...store.get('settings', {}), source: modeSelect.value });
  });

  function applyRate() {
    playbackRate = Number(store.get('settings', {}).speed || 1);
    cmd('setPlaybackRate', playbackRate);
  }

  /* ---------------- player toolbar ---------------- */

  $('#theaterButton')?.addEventListener('click', () => {
    document.body.classList.toggle('theater');
    store.set('settings', { ...store.get('settings', {}), theater: document.body.classList.contains('theater') });
    closeDetails();
  });

  document.querySelector('[data-action="fullscreen"]')?.addEventListener('click', () => {
    toggleFullscreen();
    closeDetails();
  });

  function toggleFullscreen() {
    const el = shell || document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }

  $('#pipButton')?.addEventListener('click', () => {
    toggleMiniPlayer();
    closeDetails();
  });

  function toggleMiniPlayer(force) {
    const mini = $('#miniPlayer');
    if (!mini) return;
    miniActive = force === undefined ? !miniActive : force;
    mini.hidden = !miniActive;
    document.body.classList.toggle('mini-player-active', miniActive);
    const target = mini.querySelector('.mini-player-shell');
    if (!target) return;
    if (miniActive) {
      target.innerHTML = '';
      if (currentMode === 'stream' && streamPlayer) {
        target.append(streamPlayer);
      } else if (playerFrame) {
        target.append(playerFrame);
      }
    } else if (shell) {
      shell.append(playerFrame);
      shell.append(streamPlayer);
    }
  }

  $('#miniCloseButton')?.addEventListener('click', () => toggleMiniPlayer(false));
  $('#miniPlayButton')?.addEventListener('click', () => {
    if (isPlaying) cmd('pauseVideo');
    else cmd('playVideo');
    updateMiniPlayButton();
  });

  function updateMiniPlayButton() {
    const btn = $('#miniPlayButton');
    if (btn) btn.innerHTML = render.icon(isPlaying ? 'pause' : 'play');
  }

  function closeDetails() {
    $$('.player-menu[open], .sort-menu[open]').forEach((d) => d.removeAttribute('open'));
  }

  /* ---------------- actions ---------------- */

  const likeBtn = $('#likeButton');
  const dislikeBtn = $('#dislikeButton');
  const laterBtn = $('#watchLaterButton');
  const subBtn = $('#subscribeButton');

  async function sendInteract(action, payload = {}) {
    try {
      return await api('/api/interact', { method: 'POST', body: { action, videoId, channelId, ...payload } });
    } catch (e) {
      if (e.status === 401) {
        notify('この操作にはYouTubeアカウントへのログインが必要です。', {
          action: { label: 'ログイン', onClick: () => document.dispatchEvent(new CustomEvent('wt:open-auth')) },
        });
      } else {
        notify(e.message);
      }
      return null;
    }
  }

  likeBtn?.addEventListener('click', async () => {
    const active = likeBtn.classList.toggle('active');
    dislikeBtn?.classList.remove('active');
    store.toggle('likedVideos', { id: videoId, title: $('#watchTitle')?.textContent || '' });
    if (active) await sendInteract('like');
    else await sendInteract('none');
  });

  dislikeBtn?.addEventListener('click', async () => {
    const active = dislikeBtn.classList.toggle('active');
    likeBtn?.classList.remove('active');
    store.toggle('dislikedVideos', { id: videoId, title: $('#watchTitle')?.textContent || '' });
    await sendInteract(active ? 'dislike' : 'none');
  });

  laterBtn?.addEventListener('click', async () => {
    const active = laterBtn.classList.toggle('active');
    const item = {
      id: videoId,
      title: $('#watchTitle')?.textContent || document.title,
      author: $('.watch-channel-name')?.textContent || '',
      thumbnail: document.querySelector('meta[property="og:image"]')?.content || '',
    };
    store.toggle('watchLater', item);
    notify(active ? '「後で見る」に保存しました' : '「後で見る」から削除しました');
    await sendInteract(active ? 'watch-later-add' : 'watch-later-remove');
  });

  $('#queueAddButton')?.addEventListener('click', () => {
    queue.add({
      id: videoId,
      title: $('#watchTitle')?.textContent || document.title,
      author: $('.watch-channel-name')?.textContent || '',
      thumbnail: document.querySelector('meta[property="og:image"]')?.content || '',
    });
    notify('キューに追加しました', { action: { label: '表示', onClick: () => $('#queueDialog')?.removeAttribute('hidden') } });
  });

  $('#shareButton')?.addEventListener('click', async () => {
    const url = shareUrl(videoId);
    if (navigator.share) {
      try { await navigator.share({ title: document.title, url }); return; } catch { /* cancelled */ }
    }
    const ok = await copyText(url);
    notify(ok ? 'リンクをコピーしました' : 'リンクをコピーできませんでした。');
  });

  $('#downloadButton')?.addEventListener('click', () => openStreamDialog());
  $('#streamInfoButton')?.addEventListener('click', () => { openStreamDialog(); closeDetails(); });

  async function openStreamDialog() {
    const dialog = $('#streamInfoDialog');
    const list = $('#streamInfoList');
    const titleEl = $('#streamVideoTitle');
    if (!dialog) return;
    dialog.hidden = false;
    if (list) list.innerHTML = '<p class="muted">読み込み中…</p>';
    try {
      const res = await api(`/api/stream-info?v=${encodeURIComponent(videoId)}`);
      if (titleEl) {
        titleEl.textContent = res.title || '';
        titleEl.hidden = !res.title;
      }
      const formats = res.formats || [];
      if (!formats.length) throw new Error(res.error || '利用可能な形式がありません');
      list.innerHTML = formats
        .slice(0, 40)
        .map((f) => {
          const isAudio = String(f.mimeType || '').startsWith('audio/') || f.kind === 'audio';
          const details = [f.fps ? `${f.fps}fps` : '', f.bitrate ? `${Math.round(f.bitrate / 1000)}kbps` : '', f.size ? `${Math.round(f.size / 1048576)}MB` : '']
            .filter(Boolean)
            .join(' · ');
          return `<article class="stream-format">
            <div class="stream-format-badge">${isAudio ? '♫' : 'HD'}</div>
            <div class="stream-format-meta">
              <strong>${esc(f.quality || (isAudio ? '音声' : '動画'))}</strong>
              <span>${esc(isAudio ? '音声' : '動画')} · ${esc(String(f.mimeType || '').split('/')[1] || '')}</span>
              ${details ? `<small>${esc(details)}</small>` : ''}
            </div>
            ${f.url ? `<a class="stream-download" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" download><span>ダウンロード</span><b>↓</b></a>` : ''}
          </article>`;
        })
        .join('');
    } catch (e) {
      if (list) list.innerHTML = `<p class="muted">${esc(e.message || '取得できませんでした。')}</p>`;
    }
  }

  subBtn?.addEventListener('click', async () => {
    const isSubscribed = subBtn.classList.contains('subscribed');
    const next = !isSubscribed;
    subBtn.classList.toggle('subscribed', next);
    subBtn.textContent = next ? '登録済み' : '登録';
    if (next) store.upsert('subscriptions', { id: channelId, title: $('.watch-channel-name')?.textContent || '' });
    else store.removeItem('subscriptions', channelId);
    const res = await sendInteract(next ? 'subscribe' : 'unsubscribe');
    if (!res) {
      subBtn.classList.toggle('subscribed', isSubscribed);
      subBtn.textContent = isSubscribed ? '登録済み' : '登録';
    }
  });

  /* ---------------- description ---------------- */

  const metaBox = $('#watchMetaBox');
  const descToggle = $('#descriptionToggle');
  const flipDesc = () => {
    const expanded = metaBox?.classList.toggle('expanded');
    if (descToggle) descToggle.textContent = expanded ? '閉じる' : 'もっと見る';
  };
  metaBox?.addEventListener('click', flipDesc);

  /* ---------------- comments ---------------- */

  const commentsList = $('#commentsList');
  const commentsCount = $('#commentsCount');
  const loadMoreBtn = $('#commentsLoadMore');
  let commentsContinuation = '';
  let commentsSort = 'top';
  let commentsLoading = false;

  async function loadComments(sort = commentsSort, append = false) {
    if (!commentsList) return;
    commentsLoading = true;
    if (!append) commentsList.innerHTML = '<div class="comments-loading"><span></span><span></span><span></span></div>';
    try {
      const data = await api(`/api/comments?v=${encodeURIComponent(videoId)}&sort=${encodeURIComponent(sort)}`);
      const list = data.comments || [];
      commentsContinuation = data.continuation || '';
      commentsSort = sort;
      if (commentsCount) commentsCount.textContent = data.totalCount ? `コメント ${data.totalCount}` : `コメント ${list.length ? list.length + '件' : ''}`;
      commentsList.innerHTML = list.length
        ? list.map((c) => commentHtml(c)).join('')
        : '<p class="muted">コメントはまだありません。</p>';
      if (loadMoreBtn) loadMoreBtn.hidden = !commentsContinuation;
      if (data.error) notify(data.error);
    } catch (e) {
      commentsList.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
    } finally {
      commentsLoading = false;
    }
  }

  async function loadMoreComments() {
    if (!commentsContinuation || commentsLoading) return;
    commentsLoading = true;
    if (loadMoreBtn) loadMoreBtn.textContent = '読み込み中…';
    try {
      const data = await api(`/api/comments/next?continuation=${encodeURIComponent(commentsContinuation)}`);
      commentsContinuation = data.continuation || '';
      const html = (data.comments || []).map((c) => commentHtml(c)).join('');
      commentsList.insertAdjacentHTML('beforeend', html);
      if (loadMoreBtn) {
        loadMoreBtn.hidden = !commentsContinuation;
        loadMoreBtn.textContent = 'もっと読み込む';
      }
    } catch (e) {
      notify(e.message);
    } finally {
      commentsLoading = false;
    }
  }

  loadMoreBtn?.addEventListener('click', loadMoreComments);

  $$('#commentsSortMenu .sort-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('#commentsSortMenu .sort-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const label = $('#commentsSortLabel');
      if (label) label.textContent = btn.textContent;
      $('#commentsSortMenu')?.removeAttribute('open');
      loadComments(btn.dataset.sort);
    });
  });

  commentsList?.addEventListener('click', async (e) => {
    const replyBtn = e.target.closest('[data-action="comment-replies"]');
    if (!replyBtn) return;
    const token = replyBtn.dataset.token;
    const container = replyBtn.closest('.comment')?.querySelector('[data-replies]');
    if (!container) return;
    if (!container.hidden) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    if (!token) {
      container.innerHTML = '<p class="muted">返信はありません。</p>';
      return;
    }
    container.innerHTML = '<p class="muted">読み込み中…</p>';
    try {
      const data = await api(`/api/comment-replies?continuation=${encodeURIComponent(token)}`);
      container.innerHTML = (data.comments || []).map((c) => commentHtml(c, { reply: true })).join('') || '<p class="muted">返信はありません。</p>';
    } catch (err) {
      container.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    }
  });

  // Lazy-load comments on mobile when the section scrolls into view.
  const commentsSection = $('#commentsSection');
  let commentsStarted = false;
  const startComments = () => {
    if (commentsStarted) return;
    commentsStarted = true;
    loadComments('top');
  };
  if (window.matchMedia('(max-width: 792px)').matches && commentsSection && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) startComments();
    }, { rootMargin: '300px' }).observe(commentsSection);
  } else {
    startComments();
  }

  /* ---------------- related ---------------- */

  const relatedList = $('#relatedList');
  const relatedMore = $('#relatedLoadMore');

  relatedMore?.addEventListener('click', async () => {
    const token = relatedMore.dataset.continuation;
    if (!token) return;
    relatedMore.textContent = '読み込み中…';
    try {
      const data = await api(`/api/related/next?continuation=${encodeURIComponent(token)}`);
      relatedList.insertAdjacentHTML('beforeend', (data.items || []).filter((v) => v.id !== videoId).map((v) => compactHtml(v)).join(''));
      relatedMore.dataset.continuation = data.continuation || '';
      relatedMore.hidden = !data.continuation;
    } catch (e) {
      notify(e.message);
    } finally {
      relatedMore.textContent = 'もっと読み込む';
    }
  });

  $('#relatedRefresh')?.addEventListener('click', async () => {
    relatedList.innerHTML = render.skeletonHtml(4).replace(/video-card/g, 'compact-video-skeleton');
    try {
      const data = await api(`/api/recommendations`);
      const items = (data.items || []).filter((v) => v.id !== videoId).slice(0, 20);
      relatedList.innerHTML = items.map((v) => compactHtml(v)).join('') || '<p class="muted">関連動画を取得できませんでした。</p>';
    } catch (e) {
      relatedList.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
    }
  });

  /* ---------------- autoplay next ---------------- */

  let countdownTimer = null;
  const countdownEl = $('#autoplayCountdown');
  const countdownNum = $('#autoplayCountNumber');

  function startCountdown(seconds = 8) {
    const nextHref = relatedList?.querySelector('.compact-video')?.href;
    if (!nextHref) return;
    let left = seconds;
    if (countdownEl) countdownEl.hidden = false;
    if (countdownNum) countdownNum.textContent = String(left);
    cancelCountdown();
    countdownTimer = setInterval(() => {
      left -= 1;
      if (countdownNum) countdownNum.textContent = String(Math.max(0, left));
      if (left <= 0) {
        clearInterval(countdownTimer);
        location.href = nextHref;
      }
    }, 1000);
  }

  function cancelCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    if (countdownEl) countdownEl.hidden = true;
  }

  countdownEl?.addEventListener('click', cancelCountdown);

  /* ---------------- live chat ---------------- */

  if (liveChatId && $('#liveChatPanel')) {
    const messagesEl = $('#liveChatMessages');
    let continuation = liveChatId;
    let pollMs = 2500;
    let chatTimer = null;
    let stopped = false;

    const rowHtml = (m) => {
      if (m.type === 'system') return `<div class="live-chat-row system">${esc(m.text)}</div>`;
      const cls = m.isOwner ? ' owner' : m.isModerator ? ' moderator' : m.isMember ? ' member' : '';
      const avatar = m.avatar
        ? `<img class="live-chat-avatar" loading="lazy" src="${esc(m.avatar)}" alt="">`
        : `<span class="live-chat-avatar">${esc((m.author || '?').slice(0, 1))}</span>`;
      return `<div class="live-chat-row${cls}">
        ${avatar}
        <div class="live-chat-body"><span class="live-chat-author">${esc(m.author)}</span>${esc(m.text)}${
          m.badges?.length ? `<span class="live-chat-badges">${m.badges.map((b) => `<span>${esc(b)}</span>`).join('')}</span>` : ''
        }</div>
      </div>`;
    };

    async function poll() {
      if (stopped) return;
      try {
        const data = await api(`/api/live-chat/${encodeURIComponent(continuation)}/events?continuation=${encodeURIComponent(continuation)}`);
        if (data.messages?.length) {
          messagesEl.insertAdjacentHTML('beforeend', data.messages.map(rowHtml).join(''));
          while (messagesEl.children.length > 400) messagesEl.firstElementChild.remove();
          const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 160;
          if (nearBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        if (data.continuation) continuation = data.continuation;
        if (data.pollingMs) pollMs = Math.min(Math.max(data.pollingMs, 1200), 10000);
      } catch {
        pollMs = Math.min(pollMs * 1.6, 15000);
      }
      chatTimer = setTimeout(poll, pollMs);
    }

    (async () => {
      try {
        const info = await api(`/api/live-chat/start?v=${encodeURIComponent(videoId)}`, { method: 'POST' });
        continuation = info.continuation || info.chatId;
        poll();
      } catch (e) {
        messagesEl.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
      }
    })();

    $('#liveChatClose')?.addEventListener('click', () => {
      stopped = true;
      clearTimeout(chatTimer);
      $('#liveChatPanel').hidden = true;
    });

    $('#liveChatFilter')?.addEventListener('change', async (e) => {
      try {
        const data = await api(`/api/live-chat/${encodeURIComponent(continuation)}/filter`, {
          method: 'POST',
          body: { filter: e.target.value },
        });
        if (data.continuation) continuation = data.continuation;
      } catch { /* keep polling */ }
    });
  }

  /* ---------------- keyboard ---------------- */

  const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    const key = e.key;
    const lower = key.toLowerCase();

    if (lower === 'k' || key === ' ') {
      e.preventDefault();
      cmd(isPlaying ? 'pauseVideo' : 'playVideo');
      isPlaying = !isPlaying;
      updateMiniPlayButton();
    } else if (lower === 'j') {
      e.preventDefault();
      seek(-10);
    } else if (lower === 'l') {
      e.preventDefault();
      seek(10);
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      seek(-5);
    } else if (key === 'ArrowRight') {
      e.preventDefault();
      seek(5);
    } else if (/^[0-9]$/.test(key)) {
      e.preventDefault();
      const dur = cmd('getDuration') || Number(document.body.dataset.duration || 0);
      if (dur) cmd('seekTo', (dur * Number(key)) / 10, true);
    } else if (key === '>' || key === '<') {
      e.preventDefault();
      const step = key === '>' ? 0.25 : -0.25;
      playbackRate = Math.min(2, Math.max(0.25, Math.round((playbackRate + step) * 100) / 100));
      cmd('setPlaybackRate', playbackRate);
      notify(`再生速度 ${playbackRate}x`, { duration: 1200 });
    } else if (lower === 't') {
      document.body.classList.toggle('theater');
    } else if (lower === 'f') {
      toggleFullscreen();
    } else if (lower === 'i') {
      toggleMiniPlayer();
    } else if (lower === 'm') {
      const muted = cmd('isMuted');
      cmd(muted ? 'unMute' : 'mute');
      notify(muted ? 'ミュートを解除しました' : 'ミュートしました', { duration: 1200 });
    }
  });

  function seek(delta) {
    if (currentMode === 'stream' && streamPlayer) {
      streamPlayer.currentTime = Math.max(0, (streamPlayer.currentTime || 0) + delta);
      return;
    }
    const t = cmd('getCurrentTime') || 0;
    cmd('seekTo', Math.max(0, t + delta), true);
  }

  if (streamPlayer) {
    streamPlayer.addEventListener('play', onPlaybackStart);
    streamPlayer.addEventListener('ended', onPlaybackEnd);
  }

  /* ---------------- boot ---------------- */

  const settings = store.get('settings', {});
  if (settings.theater) document.body.classList.add('theater');
  if (settings.source && modeSelect && modeSelect.querySelector(`option[value="${settings.source}"]`)) {
    modeSelect.value = settings.source;
    if (settings.source === 'stream') setStreamMode();
  }
  initIframePlayer();

  // reflect server-side like / watch-later state when signed in
  if (document.body.dataset.authenticated === 'true') {
    api(`/api/account/video-state?id=${encodeURIComponent(videoId)}`)
      .then((s) => {
        if (s.liked) likeBtn?.classList.add('active');
        if (s.disliked) dislikeBtn?.classList.add('active');
        if (s.inWatchLater) laterBtn?.classList.add('active');
      })
      .catch(() => {});
    if (channelId) {
      api(`/api/account/channel-state?id=${encodeURIComponent(channelId)}`)
        .then((s) => {
          if (s.subscribed && subBtn) {
            subBtn.classList.add('subscribed');
            subBtn.textContent = '登録済み';
          }
        })
        .catch(() => {});
    }
  } else {
    if (store.list('likedVideos').some((v) => v.id === videoId)) likeBtn?.classList.add('active');
    if (store.list('dislikedVideos').some((v) => v.id === videoId)) dislikeBtn?.classList.add('active');
    if (store.list('watchLater').some((v) => v.id === videoId)) laterBtn?.classList.add('active');
    if (channelId && store.list('subscriptions').some((c) => c.id === channelId) && subBtn) {
      subBtn.classList.add('subscribed');
      subBtn.textContent = '登録済み';
    }
  }

  if (degraded) {
    notify('このサーバーからの動画情報取得が制限されているため、一部の機能が制限されています。', { duration: 6000 });
  }
})();
