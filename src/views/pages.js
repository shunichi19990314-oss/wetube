/**
 * Page renderers. Each function returns the inner HTML for <main>; the shared
 * shell (topbar / sidebar / dialogs) is added by views/ui.js#page().
 */
import { esc, attr, cls, formatDuration, formatViewCount, formatRelative, formatViewsAndDate, absoluteDate } from '../utils.js';
import { page, videoGrid, videoCard, channelCard, playlistCard, compactVideo, commentNode, shortsRow, icon, notificationNode } from './ui.js';
import { FEEDS, HOME_CHIPS, SEARCH_TYPES } from '../youtube/service.js';
import { config } from '../config.js';

const suffix = (t) => (t ? `${t} | ${config.brandTitleSuffix}` : config.brandTitleSuffix);

/* ------------------------------------------------------------------ *
 * discovery (home + category feeds)
 * ------------------------------------------------------------------ */

function chips(activeHref) {
  const base = [
    { href: '/', label: FEEDS.home.label },
    { href: '/feed/trending', label: FEEDS.trending.label },
    { href: '/feed/music', label: FEEDS.music.label },
    { href: '/feed/gaming', label: FEEDS.gaming.label },
    { href: '/feed/news', label: FEEDS.news.label },
  ];
  const extra = HOME_CHIPS.map((q) => ({ href: `/search?q=${encodeURIComponent(q)}`, label: q }));
  return `<div class="chips-container">
  <button id="chipsLeft" class="chips-nav-btn chips-left" aria-label="前へ" hidden>${icon('chevron-left')}</button>
  <nav id="homeChips" class="home-chips" aria-label="カテゴリー">
    ${[...base, ...extra]
      .map(
        (c) =>
          `<a class="home-chip${c.href === activeHref ? ' active' : ''}" href="${esc(c.href)}">${esc(c.label)}</a>`
      )
      .join('')}
  </nav>
  <button id="chipsRight" class="chips-nav-btn chips-right" aria-label="次へ" hidden>${icon('chevron-right')}</button>
</div>`;
}

function loadMore(continuation, { target = 'feed', label = 'もっと読み込む' } = {}) {
  return `<div class="load-more-wrap">
  <button class="btn btn-secondary load-more" id="feedLoadMore" data-target="${esc(target)}"
    ${continuation ? `data-continuation="${esc(continuation)}"` : 'hidden'}>${esc(label)}</button>
  <div class="feed-spinner" id="feedSpinner" hidden><span></span><span></span><span></span></div>
</div>`;
}

function skeletonGrid(count = 12) {
  return `<div class="video-grid">
  ${Array.from({ length: count })
    .map(() => `<div class="video-card skeleton"><div class="sk-thumb"></div><div class="sk-meta"><span class="sk-avatar"></span><div class="sk-lines"><i></i><i></i></div></div></div>`)
    .join('')}
</div>`;
}

export function homePage({ feed, account, path = '/', error = '' }) {
  const main = `
${chips('/')}
${error ? `<p class="feed-error">${esc(error)}</p>` : ''}
${feed.shorts?.length ? shortsRow(feed.shorts) : ''}
<div class="video-grid" id="recommendationGrid" data-feed="home">
  ${videoGrid(feed.items)}
</div>
${loadMore(feed.continuation)}`;
  return page({
    title: suffix('ホーム'),
    page: 'home',
    path,
    main,
    account,
    mainClass: 'page-home',
  });
}

export function feedPage({ kind, feed, account, path, error = '' }) {
  const meta = FEEDS[kind] || FEEDS.home;
  const main = `
${chips(path)}
<header class="page-head">
  <h1 class="page-title">${icon(kind === 'music' ? 'music' : kind === 'gaming' ? 'game' : kind === 'news' ? 'news' : 'fire')} ${esc(meta.title)}</h1>
</header>
${error ? `<p class="feed-error">${esc(error)}</p>` : ''}
<div class="video-grid" id="recommendationGrid" data-feed="${esc(kind)}">
  ${videoGrid(feed?.items || [])}
</div>
${loadMore(feed?.continuation || '')}`;
  return page({ title: suffix(meta.title), page: 'feed', path, main, account, mainClass: `page-feed page-feed-${esc(kind)}` });
}

/* ------------------------------------------------------------------ *
 * search
 * ------------------------------------------------------------------ */

export function searchResultsPage({ results, account, path, query, type = 'all', sort = '', error = '' }) {
  const typeChips = Object.entries(SEARCH_TYPES)
    .filter(([k]) => k !== 'shorts')
    .map(
      ([k, v]) =>
        `<a class="home-chip${k === type ? ' active' : ''}" href="/search?q=${encodeURIComponent(query)}${k === 'all' ? '' : `&sp=${encodeURIComponent(v.params)}`}&type=${k}">${esc(v.label)}</a>`
    )
    .join('');

  const shortsShelf = results.shorts?.length
    ? `<section class="shorts-shelf search-shelf">
        <header class="shelf-head"><span class="shelf-icon shorts">${icon('shorts')}</span><h2>ショート動画</h2></header>
        <div class="shorts-rail">${results.shorts.slice(0, 10).map((s) => `<a class="short-card" href="${esc(s.href)}"><span class="short-thumb"><img loading="lazy" src="${esc(s.thumbnail)}" alt=""></span><span class="short-title">${esc(s.title)}</span><span class="short-views">${esc(s.views || '')}</span></a>`).join('')}</div>
      </section>`
    : '';

  const channels = results.channels?.length
    ? `<section class="result-section"><h2 class="section-title">チャンネル</h2><div class="channel-grid">${results.channels.map(channelCard).join('')}</div></section>`
    : '';
  const playlists = results.playlists?.length
    ? `<section class="result-section"><h2 class="section-title">再生リスト</h2><div class="video-grid">${results.playlists.map(playlistCard).join('')}</div></section>`
    : '';
  const videos = results.videos?.length
    ? `<section class="result-section"><h2 class="section-title">動画</h2><div class="video-grid" id="searchResults">${videoGrid(results.videos)}</div></section>`
    : '';

  const empty =
    !results.videos?.length && !results.channels?.length && !results.playlists?.length && !results.shorts?.length
      ? `<div class="empty-state"><p>${esc(error || `「${query}」に一致する結果は見つかりませんでした。`)}</p></div>`
      : '';

  const main = `
<header class="search-head">
  <div class="search-head-query">
    <h1 class="page-title">「${esc(query)}」の検索結果</h1>
    ${results.estimatedResults ? `<p class="muted">約 ${esc(formatViewCount(results.estimatedResults))} 件</p>` : ''}
  </div>
  <details class="sort-menu" id="searchSortMenu">
    <summary class="sort-summary">${icon('settings')} 検索フィルタ</summary>
    <div class="sort-panel">
      ${['relevance', 'date', 'views', 'rating']
        .map(
          (s) =>
            `<button class="sort-option${s === (sort || 'relevance') ? ' active' : ''}" data-sort="${s}" data-query="${esc(query)}">${esc({ relevance: '関連度', date: 'アップロード日', views: '再生回数', rating: '評価' }[s])}</button>`
        )
        .join('')}
    </div>
  </details>
</header>
<nav class="home-chips search-chips" aria-label="検索タイプ">${typeChips}</nav>
${empty}
${channels}
${shortsShelf}
${playlists}
${videos}
${loadMore(results.continuation || '', { target: 'search' })}`;

  return page({
    title: suffix(`${query} の検索結果`),
    page: 'search',
    path,
    main,
    account,
    query,
    mainClass: 'page-search',
    bodyAttrs: `data-search-query="${esc(query)}" data-search-type="${esc(type)}"`,
  });
}

/* ------------------------------------------------------------------ *
 * channel
 * ------------------------------------------------------------------ */

export function channelPageView({ data, account, path, tab = '', error = '' }) {
  const h = data.header || {};
  const tabs = (data.tabs || [])
    .filter((t) => t.title)
    .map((t) => {
      const href = t.href || `/channel/${encodeURIComponent(data.identifier)}`;
      return `<a class="channel-tab${t.selected ? ' active' : ''}" href="${esc(href)}">${esc(t.title)}</a>`;
    })
    .join('');

  const stats = (h.stats || []).filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join('<i></i>');

  const main = `
<header class="channel-header">
  ${h.banner ? `<div class="channel-banner"><img src="${esc(h.banner)}" alt=""></div>` : '<div class="channel-banner placeholder"></div>'}
  <div class="channel-id-row">
    <span class="channel-avatar">${h.avatar ? `<img src="${esc(h.avatar)}" alt="">` : esc((h.title || '?').slice(0, 1))}</span>
    <div class="channel-id-meta">
      <h1 class="channel-name">${esc(h.title || data.identifier)}</h1>
      <p class="channel-handle">${esc(h.handle || '')}</p>
      <p class="channel-stats">${stats}</p>
      ${h.description ? `<p class="channel-desc">${esc(h.description.slice(0, 120))}${h.description.length > 120 ? '…' : ''}</p>` : ''}
      <div class="channel-actions">
        <button class="btn btn-primary subscribe-btn" id="channelSubscribe" data-action="subscribe"
          data-channel-id="${esc(h.channelId || data.identifier)}" data-subscribed="${data.subscribed ? 'true' : 'false'}">
          ${data.subscribed ? '登録済み' : '登録'}
        </button>
      </div>
    </div>
  </div>
  <nav class="channel-tabs" id="channelTabs">${tabs}</nav>
</header>
${error ? `<p class="feed-error">${esc(error)}</p>` : ''}
<div class="video-grid" id="channelGrid" data-channel="${esc(data.identifier)}">
  ${videoGrid(data.items || [])}
</div>
${loadMore(data.continuation || '', { target: 'channel' })}`;

  return page({
    title: suffix(h.title || 'チャンネル'),
    page: 'channel',
    path,
    main,
    account,
    mainClass: 'page-channel',
    hideSidebar: false,
    bodyAttrs: `data-channel-id="${esc(h.channelId || data.identifier)}"`,
  });
}

/* ------------------------------------------------------------------ *
 * watch
 * ------------------------------------------------------------------ */

function descriptionBlock(text, keywords) {
  const safe = esc(text || '');
  const linked = safe
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>')
    .replace(/(^|\s)(#[^\s<#]+)/g, '$1<a class="hash" href="/search?q=$2">$2</a>')
    .replace(/\n/g, '<br>');
  return `<div class="description" id="descriptionBox">
  <div class="description-inner" id="descriptionInner">${linked}</div>
  ${keywords?.length ? `<div class="description-tags">${keywords.slice(0, 12).map((k) => `<a href="/search?q=${encodeURIComponent(k)}">${esc(k)}</a>`).join('')}</div>` : ''}
  <button class="description-toggle" id="descriptionToggle">もっと見る</button>
</div>`;
}

export function watchPageView({ data, account, path, error = '' }) {
  const v = data;
  const embeds = v.embeds?.length ? v.embeds : [{ id: 'youtube', url: `https://www.youtube.com/embed/${v.videoId}?autoplay=1&rel=0&hl=ja` }];
  const primary = embeds[0];
  const nocookie = embeds.find((e) => e.id === 'nocookie') || primary;
  const mirror = embeds.find((e) => e.id.startsWith('edu')) || null;

  const related = (v.related || [])
    .filter((r) => r.id !== v.videoId)
    .map((r) => compactVideo(r))
    .join('');

  const liveChatPanel = v.liveChatId
    ? `<aside class="live-chat-panel" id="liveChatPanel" data-chat-id="${esc(v.liveChatId)}">
        <header class="live-chat-head">
          <h2>${icon('chat')} ライブチャット</h2>
          <div class="live-chat-head-actions">
            <select id="liveChatFilter" class="live-chat-filter" aria-label="チャットのフィルタ">
              <option value="all">すべてのチャット</option>
              <option value="participants">参加中のユーザー</option>
            </select>
            <button id="liveChatClose" class="icon-btn-sm" aria-label="閉じる">${icon('close')}</button>
          </div>
        </header>
        <div class="live-chat-messages" id="liveChatMessages"></div>
        <div class="live-chat-footer"><p class="muted">チャットは YouTube から取得しています。</p></div>
      </aside>`
    : '';

  const main = `
<div class="watch-layout${v.isLiveNow ? ' live' : ''}">
  <div class="watch-primary">
    <div class="player-shell" id="playerShell">
      <iframe id="player" class="player-frame" src="${esc(primary.url)}" title="${esc(v.title)}"
        frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <video id="streamPlayer" class="player-stream" controls playsinline hidden preload="none"></video>
      <div class="player-countdown" id="autoplayCountdown" hidden><span></span><b id="autoplayCountNumber">8</b></div>
    </div>

    <div class="player-toolbar">
      <div class="player-toolbar-left">
        <select id="playerModeSelect" class="player-mode" aria-label="再生ソース"
          data-youtube="${esc(primary.url)}" data-nocookie="${esc(nocookie.url)}" data-edu="${esc(mirror ? mirror.url : primary.url)}"
          data-edu-sources="${esc(JSON.stringify(embeds.map((e) => ({ id: e.id, label: e.label, url: e.url }))))}">
          ${embeds.map((e) => `<option value="${esc(e.id)}">${esc(e.label)}</option>`).join('')}
          <option value="stream">ダイレクト再生 (実験的)</option>
        </select>
        <label class="autoplay-toggle"><input type="checkbox" id="autoplayToggle" checked><span class="slider"></span><b>自動再生</b></label>
      </div>
      <div class="player-toolbar-right">
        <details class="player-menu">
          <summary class="icon-btn" aria-label="プレーヤー設定">${icon('settings')}</summary>
          <div class="player-menu-panel">
            <button id="theaterButton" class="menu-row">${icon('theater')}<span>シアターモード</span><kbd>t</kbd></button>
            <button id="pipButton" class="menu-row">${icon('miniplayer')}<span>ミニプレーヤー</span><kbd>i</kbd></button>
            <button id="streamInfoButton" class="menu-row">${icon('download')}<span>ストリーム情報 / ダウンロード</span></button>
            <button class="menu-row" data-action="fullscreen">${icon('fullscreen')}<span>全画面表示</span><kbd>f</kbd></button>
          </div>
        </details>
      </div>
    </div>

    <h1 class="watch-title" id="watchTitle">${esc(v.title)}</h1>

    <div class="watch-info-row">
      <div class="watch-channel">
        <a class="watch-channel-avatar" href="${esc(v.channel?.id ? `/channel/${encodeURIComponent(v.channel.id)}` : '#')}">
          ${v.channel?.avatar ? `<img src="${esc(v.channel.avatar)}" alt="">` : `<span>${esc((v.channel?.title || '?').slice(0, 1))}</span>`}
        </a>
        <div class="watch-channel-meta">
          <a class="watch-channel-name" href="${esc(v.channel?.id ? `/channel/${encodeURIComponent(v.channel.id)}` : '#')}">${esc(v.channel?.title || '')}</a>
          <span class="watch-channel-subs">${esc(v.channel?.subscribers || '')}</span>
        </div>
        <button class="btn btn-primary subscribe-btn" id="subscribeButton" data-action="subscribe"
          data-channel-id="${esc(v.channel?.id || '')}">登録</button>
      </div>
      <div class="watch-actions" id="watchActions">
        <div class="like-group">
          <button class="pill-btn" id="likeButton" data-action="like" data-video-id="${esc(v.videoId)}">${icon('like')}<span id="likeCount">${esc(v.likeCount || '高く評価')}</span></button>
          <button class="pill-btn dislike" id="dislikeButton" data-action="dislike" data-video-id="${esc(v.videoId)}">${icon('dislike')}</button>
        </div>
        <button class="pill-btn" id="shareButton" data-action="share">${icon('share')}<span>共有</span></button>
        <button class="pill-btn" id="watchLaterButton" data-action="watch-later" data-video-id="${esc(v.videoId)}">${icon('clock')}<span>後で見る</span></button>
        <button class="pill-btn" id="queueAddButton" data-action="queue" data-video-id="${esc(v.videoId)}">${icon('queue')}<span>キュー</span></button>
        <button class="pill-btn" id="downloadButton" data-action="download">${icon('download')}<span>ダウンロード</span></button>
        <button class="pill-btn icon-only" id="watchMoreButton" data-action="menu" aria-label="その他の操作">${icon('more')}</button>
      </div>
    </div>

    <div class="watch-meta-box" id="watchMetaBox">
      <p class="watch-stats"><b>${esc(v.views || '')}</b> <b>${esc(v.dateText || '')}</b>${v.keywords?.length ? ` <span class="watch-tags">${v.keywords.slice(0, 5).map((k) => `<a href="/search?q=${encodeURIComponent(k)}">#${esc(k)}</a>`).join('')}</span>` : ''}</p>
      ${descriptionBlock(v.description, v.keywords)}
    </div>

    <section class="comments-section" id="commentsSection" data-video-id="${esc(v.videoId)}">
      <header class="comments-head">
        <h2 id="commentsCount">コメント</h2>
        <details class="sort-menu" id="commentsSortMenu">
          <summary class="sort-summary">${icon('settings')} <span id="commentsSortLabel">上位のコメント</span></summary>
          <div class="sort-panel">
            <button class="sort-option active" data-sort="top">上位のコメント</button>
            <button class="sort-option" data-sort="new">新着順</button>
          </div>
        </details>
      </header>
      <div class="comment-composer">
        <span class="comment-avatar placeholder">${esc((account?.name || 'G').slice(0, 1))}</span>
        <input id="commentInput" class="comment-input" type="text" placeholder="コメントを追加…" disabled>
      </div>
      <div class="comments-list" id="commentsList">
        <div class="comments-loading"><span></span><span></span><span></span></div>
      </div>
      <button class="btn btn-secondary" id="commentsLoadMore" hidden>もっと読み込む</button>
    </section>
  </div>

  <div class="watch-secondary">
    <div class="related-head">
      <h2>関連動画</h2>
      <button class="text-btn" id="relatedRefresh">${icon('search')} 更新</button>
    </div>
    <div class="related-list" id="relatedList">${related || '<p class="muted">関連動画を取得できませんでした。</p>'}</div>
    <button class="btn btn-secondary" id="relatedLoadMore" ${v.relatedContinuation ? `data-continuation="${esc(v.relatedContinuation)}"` : 'hidden'}>もっと読み込む</button>
  </div>
  ${liveChatPanel}
</div>`;

  return page({
    title: suffix(v.title || '動画'),
    page: 'watch',
    path,
    main,
    account,
    mainClass: 'page-watch',
    hideSidebar: true,
    head: `<meta property="og:title" content="${esc(v.title || '')}">
  <meta property="og:image" content="${esc(v.thumbnail || '')}">
  <meta name="description" content="${esc((v.description || '').slice(0, 160))}">
  <script src="https://www.youtube.com/iframe_api" async></script>`,
    bodyAttrs: `data-video-id="${esc(v.videoId)}" data-channel-id="${esc(v.channel?.id || '')}" data-duration="${esc(v.lengthSeconds || 0)}" data-live="${v.isLiveNow ? '1' : '0'}" data-chat-id="${esc(v.liveChatId || '')}" data-degraded="${v.degraded ? '1' : '0'}"`,
  });
}

/* ------------------------------------------------------------------ *
 * shorts
 * ------------------------------------------------------------------ */

export function shortsPageView({ items, activeId = '', account, path }) {
  const list = items || [];
  const active = list.find((s) => s.id === activeId) || list[0] || null;
  const embedUrl = (id) => `https://www.youtube.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&controls=1&rel=0&hl=ja`;

  const main = `
<div class="shorts-stage" id="shortsStage" data-continuation="">
  ${
    active
      ? list
          .map(
            (s, i) => `<section class="short-slide${s.id === active.id ? ' active' : ''}" data-video-id="${esc(s.id)}" data-index="${i}">
      <div class="short-player">
        ${s.id === active.id ? `<iframe class="short-frame" src="${esc(embedUrl(s.id))}" title="${esc(s.title)}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : `<img class="short-poster" loading="lazy" src="${esc(s.thumbnail)}" alt="">`}
      </div>
      <div class="short-overlay">
        <div class="short-overlay-text">
          <h2>${esc(s.title)}</h2>
          <p>${esc(s.views || '')}</p>
        </div>
        <div class="short-overlay-actions">
          <button class="round-btn" data-action="like" data-video-id="${esc(s.id)}">${icon('like')}<span>高く評価</span></button>
          <button class="round-btn" data-action="dislike" data-video-id="${esc(s.id)}">${icon('dislike')}<span>低く評価</span></button>
          <button class="round-btn" data-action="comment" data-video-id="${esc(s.id)}">${icon('chat')}<span>コメント</span></button>
          <button class="round-btn" data-action="share" data-video-id="${esc(s.id)}">${icon('share')}<span>共有</span></button>
          <button class="round-btn" data-action="menu" data-video-id="${esc(s.id)}">${icon('more')}<span>その他</span></button>
        </div>
      </div>
    </section>`
          )
          .join('')
      : `<div class="empty-state"><p>ショート動画を読み込めませんでした。</p><a class="btn btn-primary" href="/shorts">再読み込み</a></div>`
  }
  <div class="shorts-nav">
    <button class="round-btn" id="shortsPrev" aria-label="前へ">${icon('chevron-left')}</button>
    <button class="round-btn" id="shortsNext" aria-label="次へ">${icon('chevron-right')}</button>
  </div>
</div>`;

  return page({
    title: suffix(active ? active.title : 'Shorts'),
    page: 'shorts',
    path,
    main,
    account,
    mainClass: 'page-shorts',
    hideSidebar: true,
    bodyAttrs: `data-shorts-count="${list.length}"`,
  });
}

/* ------------------------------------------------------------------ *
 * playlist
 * ------------------------------------------------------------------ */

export function playlistPageView({ data, account, path }) {
  const h = data.header || {};
  const main = `
<header class="playlist-head">
  ${h.banner ? `<div class="playlist-cover"><img src="${esc(h.banner)}" alt=""></div>` : ''}
  <div class="playlist-meta">
    <h1 class="page-title">${esc(h.title || '再生リスト')}</h1>
    <p class="muted">${esc((h.stats || []).filter(Boolean).join(' ・ '))}</p>
    <div class="playlist-actions">
      <button class="btn btn-primary" id="playlistPlayAll" data-first="${esc(data.items?.[0]?.id || '')}">${icon('play')} すべて再生</button>
      <button class="btn btn-secondary" data-action="queue-all">${icon('queue')} キューに追加</button>
    </div>
  </div>
</header>
<div class="playlist-list" id="playlistList">
  ${(data.items || []).map((v, i) => `<div class="playlist-row" data-video-id="${esc(v.id)}">
    <span class="playlist-index">${i + 1}</span>
    <a class="playlist-thumb" href="${esc(v.href || `/watch?v=${encodeURIComponent(v.id)}&list=${encodeURIComponent(data.listId)}`)}"><img loading="lazy" src="${esc(v.thumbnail)}" alt="">${v.duration ? `<span class="thumb-duration">${esc(v.duration)}</span>` : ''}</a>
    <div class="playlist-row-meta">
      <h3><a href="${esc(v.href || `/watch?v=${encodeURIComponent(v.id)}&list=${encodeURIComponent(data.listId)}`)}">${esc(v.title)}</a></h3>
      <p class="muted">${esc([v.author, v.views, v.published].filter(Boolean).join('・'))}</p>
    </div>
    <button class="icon-btn-sm" data-action="menu" data-video-id="${esc(v.id)}" aria-label="操作">${icon('more')}</button>
  </div>`).join('')}
</div>
${loadMore(data.continuation || '', { target: 'playlist' })}`;
  return page({ title: suffix(h.title || '再生リスト'), page: 'playlist', path, main, account, mainClass: 'page-playlist' });
}

/* ------------------------------------------------------------------ *
 * library pages (history / liked / watch-later / subscriptions / playlists / my-channel)
 * ------------------------------------------------------------------ */

const LIBRARY = {
  history: { title: '履歴', empty: 'まだ視聴履歴がありません。', icon: 'history', controls: ['clear'] },
  liked: { title: '高く評価した動画', empty: '高く評価した動画はまだありません。', icon: 'like', controls: [] },
  'watch-later': { title: '後で見る', empty: '「後で見る」は空です。', icon: 'clock', controls: ['clear'] },
  subscriptions: { title: '登録チャンネル', empty: '登録しているチャンネルはありません。', icon: 'sub', controls: ['manage'] },
  playlists: { title: '再生リスト', empty: '再生リストはまだありません。', icon: 'playlist', controls: ['new'] },
  'my-channel': { title: 'あなたのチャンネル', empty: 'ログインするとあなたのチャンネルを表示できます。', icon: 'user', controls: [] },
};

export function libraryPageView({ kind, items = [], shelves = [], account, path, authenticated = false, error = '', localHint = '' }) {
  const meta = LIBRARY[kind] || { title: kind, empty: 'データがありません。', icon: 'playlist', controls: [] };
  const grid =
    kind === 'subscriptions'
      ? `<div class="channel-grid" id="libraryGrid" data-kind="${esc(kind)}">${(items || []).map(channelCard).join('')}</div>`
      : `<div class="video-grid" id="libraryGrid" data-kind="${esc(kind)}">${videoGrid(items)}</div>`;

  const shelfHtml = shelves
    .map(
      (s) => `<section class="library-shelf"><h2 class="section-title">${esc(s.title)}</h2><div class="video-grid">${videoGrid(s.items)}</div></section>`
    )
    .join('');

  const main = `
<header class="library-head">
  <div class="library-head-text">
    <h1 class="page-title">${icon(meta.icon)} ${esc(meta.title)}</h1>
    <p class="muted">${esc(localHint || (authenticated ? 'YouTubeアカウントと同期しています' : 'この端末に保存されたデータを表示しています'))}</p>
  </div>
  <div class="library-controls">
    ${meta.controls.includes('clear') ? `<button class="btn btn-secondary" data-library-action="clear" data-kind="${esc(kind)}">${icon('close')} すべて削除</button>` : ''}
    ${meta.controls.includes('manage') ? `<button class="btn btn-secondary" data-library-action="manage">${icon('settings')} 管理</button>` : ''}
    ${meta.controls.includes('new') ? `<button class="btn btn-primary" data-library-action="new">${icon('plus')} 新規作成</button>` : ''}
    <button class="btn btn-secondary" id="librarySortToggle" data-library-action="sort">${icon('settings')} 並べ替え</button>
  </div>
</header>
${error ? `<p class="feed-error">${esc(error)}</p>` : ''}
${!items.length && !shelves.length ? `<div class="empty-state">${icon(meta.icon)}<p>${esc(meta.empty)}</p>${!authenticated ? '<button class="btn btn-primary" id="librarySignIn">YouTubeアカウントでログイン</button>' : ''}</div>` : ''}
${kind === 'playlists' && shelves.length ? shelfHtml : ''}
${grid}
${loadMore('', { target: 'library' })}
<div class="library-local" id="libraryLocal" data-kind="${esc(kind)}" hidden>
  <h2 class="section-title">この端末の${esc(meta.title)}</h2>
  <div class="video-grid" id="libraryLocalGrid"></div>
</div>`;

  return page({
    title: suffix(meta.title),
    page: 'library',
    path,
    main,
    account,
    mainClass: `page-library library-${esc(kind)}`,
    bodyAttrs: `data-library-kind="${esc(kind)}" data-library-authenticated="${authenticated}"`,
  });
}

/* ------------------------------------------------------------------ *
 * settings
 * ------------------------------------------------------------------ */

export function settingsPageView({ account, path, state = {} }) {
  const main = `
<header class="page-head"><h1 class="page-title">${icon('settings')} 設定</h1></header>
<div class="settings-grid">
  <section class="settings-card">
    <h2>アカウント</h2>
    ${
      account
        ? `<div class="settings-account">
            <span class="account-avatar-lg">${account.avatar ? `<img src="${esc(account.avatar)}" alt="">` : esc((account.name || 'W').slice(0, 1))}</span>
            <div><b>${esc(account.name || 'YouTubeアカウント')}</b><span>${esc(account.handle || '')}</span></div>
            <button class="btn btn-secondary" id="settingsSignOut">ログアウト</button>
          </div>`
        : `<p class="muted">ログインすると、履歴・登録チャンネル・高く評価した動画をYouTubeアカウントと同期できます。</p>
           <button class="btn btn-primary" id="settingsSignIn">テレビ認証でログイン</button>`
    }
  </section>

  <section class="settings-card">
    <h2>デザイン</h2>
    <div class="theme-options">
      <label class="theme-option"><input type="radio" name="theme-setting" value="device" ${state.theme === 'device' || !state.theme ? 'checked' : ''}><span>端末の設定を使用</span></label>
      <label class="theme-option"><input type="radio" name="theme-setting" value="dark" ${state.theme === 'dark' ? 'checked' : ''}><span>${icon('moon')} ダークテーマ</span></label>
      <label class="theme-option"><input type="radio" name="theme-setting" value="light" ${state.theme === 'light' ? 'checked' : ''}><span>${icon('sun')} ライトテーマ</span></label>
    </div>
  </section>

  <section class="settings-card">
    <h2>再生</h2>
    <label class="switch-row"><input type="checkbox" id="settingAutoplay" ${state.autoplay === false ? '' : 'checked'}><span>次の動画を自動再生する</span></label>
    <label class="switch-row"><input type="checkbox" id="settingAnnotations" ${state.annotations ? 'checked' : ''}><span>動画の終了画面を表示する</span></label>
    <label class="switch-row"><input type="checkbox" id="settingTheater" ${state.theater ? 'checked' : ''}><span>シアターモードで開く</span></label>
    <label class="switch-row"><input type="checkbox" id="settingMute" ${state.mute ? 'checked' : ''}><span>ミュートで再生を開始する</span></label>
    <div class="select-row">
      <label for="settingQuality">既定の再生ソース</label>
      <select id="settingQuality">
        <option value="youtube">YouTube 埋め込み</option>
        <option value="nocookie">YouTube (nocookie)</option>
        <option value="stream">ダイレクト再生 (実験的)</option>
      </select>
    </div>
    <div class="select-row">
      <label for="settingSpeed">再生速度</label>
      <select id="settingSpeed">
        ${[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => `<option value="${s}" ${Number(state.speed || 1) === s ? 'selected' : ''}>${s}x</option>`).join('')}
      </select>
    </div>
  </section>

  <section class="settings-card">
    <h2>データとプライバシー</h2>
    <p class="muted">履歴・後で見る・高く評価した動画・検索履歴・再生キューはこの端末のlocalStorageに保存されます。ログイン中はYouTubeアカウントのデータが優先されます。</p>
    <div class="settings-actions">
      <button class="btn btn-secondary" id="settingsExport">${icon('download')} データを書き出す</button>
      <button class="btn btn-danger" id="settingsClearLocal">${icon('close')} 端末のデータを消去</button>
    </div>
  </section>

  <section class="settings-card">
    <h2>サーバー情報</h2>
    <dl class="settings-info">
      <div><dt>バージョン</dt><dd>${esc(config.assetVersion)}</dd></div>
      <div><dt>ストリーム取得</dt><dd>${esc(config.streamProvider)}</dd></div>
      <div><dt>プロキシ</dt><dd>${config.proxy ? '有効' : '無効'}</dd></div>
      <div><dt>言語 / 地域</dt><dd>${esc(config.hl)} / ${esc(config.gl)}</dd></div>
    </dl>
  </section>
</div>`;
  return page({ title: suffix('設定'), page: 'settings', path, main, account, mainClass: 'page-settings' });
}

/* ------------------------------------------------------------------ *
 * error / 404
 * ------------------------------------------------------------------ */

export function errorPageView({ status = 500, message = '', account, path = '/', title = 'エラー' }) {
  const main = `
<div class="error-state">
  <span class="error-code">${esc(status)}</span>
  <h1>${esc(title)}</h1>
  <p>${esc(message || 'うまく読み込めませんでした')}</p>
  <div class="error-actions">
    <a class="btn btn-primary" href="/">ホームへ戻る</a>
    <button class="btn btn-secondary" onclick="location.reload()">再読み込み</button>
  </div>
</div>`;
  return page({ title: suffix(title), page: 'error', path, main, account, mainClass: 'page-error', hideSidebar: true });
}

export { chips, loadMore, skeletonGrid, suffix };
