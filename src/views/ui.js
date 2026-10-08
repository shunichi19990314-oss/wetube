/**
 * View layer primitives: SVG icon sprite, the shared page shell (topbar,
 * sidebar, dialogs, bottom nav, script tags) and every card type used by the
 * discovery, watch and library pages.
 *
 * All markup is rendered on the server; the client scripts hydrate behaviour.
 */
import { esc, attr, cls, formatDuration, formatViewCount, formatRelative, formatViewsAndDate } from '../utils.js';
import { config } from '../config.js';

const V = () => `?v=${config.assetVersion}`;

/* ------------------------------------------------------------------ *
 * icon sprite
 * ------------------------------------------------------------------ */

const S = (id, vb, inner) => `<symbol id="${id}" viewBox="${vb}">${inner}</symbol>`;

export function sprite() {
  return `<svg class="sprite" aria-hidden="true"><defs>
${S('i-menu', '0 0 24 24', '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>')}
${S('i-search', '0 0 24 24', '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>')}
${S('i-home', '0 0 24 24', '<path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.5v10h5.2v-6h2.6v6h5.2v-10"/>')}
${S('i-shorts', '0 0 24 24', '<path d="M7.2 6.6 14 4.3c2.9-1 4.5 3.1 1.6 4.2l-7.3 2.7c-3 1.1-2.5 4.1.1 5l6.2 2.2c2.8 1 4.3-3 1.5-4l-6.2-2.3" stroke-width="2.4"/><path d="m10.6 9.8 4.1 2.2-4.1 2.3z" fill="currentColor" stroke="none"/>')}
${S('i-sub', '0 0 24 24', '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>')}
${S('i-history', '0 0 24 24', '<path d="M12 7.5V12l3.2 2"/><circle cx="12" cy="12" r="8.2"/><path d="M3.8 12a8.2 8.2 0 0 1 8.2-8.2"/>')}
${S('i-clock', '0 0 24 24', '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l3.1 1.9"/>')}
${S('i-like', '0 0 24 24', '<path d="M7 20V10l4.2-6.4c1.3.2 2 1.2 2 2.4V9h4.4c1.4 0 2.4 1.2 2.1 2.6l-1.4 6.4c-.2 1.1-1.2 2-2.3 2H7Z"/><path d="M7 10H4v10h3"/>')}
${S('i-dislike', '0 0 24 24', '<path d="M17 4v10l-4.2 6.4c-1.3-.2-2-1.2-2-2.4V15H6.4c-1.4 0-2.4-1.2-2.1-2.6l1.4-6.4C5.9 4.9 6.9 4 8 4h9Z"/><path d="M17 14h3V4h-3"/>')}
${S('i-share', '0 0 24 24', '<path d="M12 15V4"/><path d="m8.2 7.6 3.8-3.8 3.8 3.8"/><path d="M5 13v6h14v-6"/>')}
${S('i-download', '0 0 24 24', '<path d="M12 4v10"/><path d="m8 10.4 4 4 4-4"/><path d="M5 19h14"/>')}
${S('i-playlist', '0 0 24 24', '<path d="M4 7h11M4 12h11M4 17h7"/><path d="m16.5 13.5 4 2.5-4 2.5z"/>')}
${S('i-queue', '0 0 24 24', '<path d="M4 7h10M4 12h10M4 17h6"/><circle cx="17.5" cy="15.5" r="3"/><path d="M20.5 13v-2"/>')}
${S('i-settings', '0 0 24 24', '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.9 6.1l-1.4 1.4M7.5 16.5l-1.4 1.4M17.9 17.9l-1.4-1.4M7.5 7.5 6.1 6.1"/>')}
${S('i-bell', '0 0 24 24', '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>')}
${S('i-user', '0 0 24 24', '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5"/>')}
${S('i-fire', '0 0 24 24', '<path d="M12 3.5s4.5 3.6 4.5 8a4.5 4.5 0 0 1-9 0c0-1.5.6-2.8 1.4-3.7 0 1.5.9 2.5 2 2.5 1.4 0 2-1.3 1.6-3-.2-1.3-.5-2.5-.5-3.8Z"/><path d="M8 15.5a4 4 0 0 0 8 0"/>')}
${S('i-music', '0 0 24 24', '<path d="M9 18V7l10-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>')}
${S('i-game', '0 0 24 24', '<rect x="2.5" y="7" width="19" height="10" rx="4"/><path d="M7 10.5v3M5.5 12h3"/><circle cx="16" cy="11.4" r=".9" fill="currentColor"/><circle cx="18" cy="13.6" r=".9" fill="currentColor"/>')}
${S('i-news', '0 0 24 24', '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M7 9h6M7 12h10M7 15h10"/>')}
${S('i-moon', '0 0 24 24', '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>')}
${S('i-sun', '0 0 24 24', '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>')}
${S('i-chevron-left', '0 0 24 24', '<path d="m14.5 5.5-7 6.5 7 6.5"/>')}
${S('i-chevron-right', '0 0 24 24', '<path d="m9.5 5.5 7 6.5-7 6.5"/>')}
${S('i-chevron-down', '0 0 24 24', '<path d="m5.5 9 6.5 7 6.5-7"/>')}
${S('i-close', '0 0 24 24', '<path d="m6 6 12 12M18 6 6 18"/>')}
${S('i-check', '0 0 24 24', '<path d="m5 12.5 4.5 4.5L19 7"/>')}
${S('i-more', '0 0 24 24', '<circle cx="12" cy="5.5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="18.5" r="1.5" fill="currentColor"/>')}
${S('i-play', '0 0 24 24', '<path d="m8 5.5 11 6.5-11 6.5z"/>')}
${S('i-pause', '0 0 24 24', '<rect x="7" y="5.5" width="3.4" height="13" rx="1"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1"/>')}
${S('i-theater', '0 0 24 24', '<rect x="2.5" y="6.5" width="19" height="11" rx="1.5"/>')}
${S('i-fullscreen', '0 0 24 24', '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}
${S('i-miniplayer', '0 0 24 24', '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1" fill="currentColor" stroke="none"/>')}
${S('i-mute', '0 0 24 24', '<path d="M5 9.5h3l4-3.5v12l-4-3.5H5z"/><path d="m16 9.5 4 5M20 9.5l-4 5"/>')}
${S('i-link', '0 0 24 24', '<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1.6 1.6"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1.6-1.6"/>')}
${S('i-keyboard', '0 0 24 24', '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9"/>')}
${S('i-chat', '0 0 24 24', '<path d="M4 6.5h16v10H9l-5 3.5z"/>')}
${S('i-flag', '0 0 24 24', '<path d="M6 4v16M6 5h11l-2 4 2 4H6"/>')}
${S('i-scissors', '0 0 24 24', '<circle cx="6.5" cy="7" r="2.4"/><circle cx="6.5" cy="17" r="2.4"/><path d="M8.6 8.6 19 17M19 7 8.6 15.4"/>')}
${S('i-plus', '0 0 24 24', '<path d="M12 5v14M5 12h14"/>')}
${S('i-logo', '0 0 24 24', '<rect x="1.6" y="5.2" width="20.8" height="13.6" rx="4" fill="#f00" stroke="none"/><path d="m10.2 9.2 5.4 2.8-5.4 2.8z" fill="#fff" stroke="none"/>')}
</defs></svg>`;
}

export const icon = (name, extraClass = '') =>
  `<svg class="icon${extraClass ? ` ${extraClass}` : ''}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

/* ------------------------------------------------------------------ *
 * cards
 * ------------------------------------------------------------------ */

export function videoCard(v, { layout = 'grid', index = 0 } = {}) {
  if (!v) return '';
  const href = v.href || (v.id ? `/watch?v=${encodeURIComponent(v.id)}` : '#');
  const duration = v.duration || (v.durationSeconds ? formatDuration(v.durationSeconds) : '');
  const meta = v.views || v.published ? formatViewsAndDate({ viewCount: v.viewCount, published: v.published, isLive: v.isLive }) : '';
  const viewsText = v.views || (v.viewCount ? `${formatViewCount(v.viewCount)}回視聴` : '');
  const publishedText = v.published || (v.publishedRaw ? formatRelative(v.publishedRaw) : '');
  const line = [viewsText, publishedText].filter(Boolean).join('・');
  const thumb = v.thumbnail || `/image-proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}`;

  return `<article class="video-card ${cls(layout === 'row' && 'video-card-row')}" data-video-id="${esc(v.menuVideoId || v.id)}" data-index="${index}">
  <a class="video-thumb" href="${esc(href)}" aria-label="${esc(v.title)}">
    <img loading="lazy" src="${esc(thumb)}" alt="">
    ${duration ? `<span class="thumb-duration${v.isLive ? ' live' : ''}">${esc(duration)}</span>` : ''}
    ${v.badges?.length && !duration ? `<span class="thumb-badge">${esc(v.badges[0])}</span>` : ''}
    <span class="thumb-hover">
      <button class="thumb-action" data-action="queue" title="キューに追加" aria-label="キューに追加">${icon('queue')}</button>
      <button class="thumb-action" data-action="watch-later" title="後で見るに保存" aria-label="後で見るに保存">${icon('clock')}</button>
    </span>
  </a>
  <div class="video-meta">
    <a class="channel-thumb" href="${esc(v.authorId ? `/channel/${encodeURIComponent(v.authorId)}` : '#')}" aria-hidden="true" tabindex="-1">
      ${v.authorThumbnail ? `<img loading="lazy" src="${esc(v.authorThumbnail)}" alt="">` : `<span class="channel-thumb-fallback">${esc((v.author || '?').slice(0, 1))}</span>`}
    </a>
    <div class="video-meta-text">
      <h3 class="video-title"><a href="${esc(href)}" title="${esc(v.title)}">${esc(v.title)}</a></h3>
      <p class="video-author">${v.authorId ? `<a href="/channel/${esc(v.authorId)}">${esc(v.author || '')}</a>` : esc(v.author || '')}</p>
      <p class="video-stats">${esc(line || meta)}</p>
      ${layout === 'row' && v.description ? `<p class="video-desc">${esc(v.description.slice(0, 160))}</p>` : ''}
    </div>
    <button class="card-menu icon-btn-sm" data-action="menu" aria-label="操作メニュー">${icon('more')}</button>
  </div>
</article>`;
}

export function videoGrid(items, opts = {}) {
  return (items || [])
    .filter((v) => v && (v.id || v.title))
    .map((v, i) => videoCard(v, { index: i, ...opts }))
    .join('');
}

export function shortsRow(items, { title = 'ショート動画' } = {}) {
  if (!items?.length) return '';
  return `<section class="shorts-shelf" data-shelf="shorts">
  <header class="shelf-head">
    <span class="shelf-icon shorts">${icon('shorts')}</span>
    <h2>${esc(title)}</h2>
    <a class="shelf-more" href="/shorts">もっと見る ${icon('chevron-right')}</a>
  </header>
  <div class="shorts-rail" data-rail>
    ${items
      .slice(0, 12)
      .map(
        (s) => `<a class="short-card" href="${esc(s.href || `/shorts/${encodeURIComponent(s.id)}`)}" data-video-id="${esc(s.id)}">
      <span class="short-thumb"><img loading="lazy" src="${esc(s.thumbnail)}" alt=""></span>
      <span class="short-title">${esc(s.title)}</span>
      <span class="short-views">${esc(s.views || (s.viewCount ? `${formatViewCount(s.viewCount)}回視聴` : ''))}</span>
    </a>`
      )
      .join('')}
  </div>
</section>`;
}

export function channelCard(c) {
  return `<article class="channel-card" data-channel-id="${esc(c.id)}">
  <a class="channel-card-avatar" href="${esc(c.href || `/channel/${encodeURIComponent(c.id)}`)}">
    ${c.thumbnail ? `<img loading="lazy" src="${esc(c.thumbnail)}" alt="">` : `<span class="channel-thumb-fallback">${esc((c.title || '?').slice(0, 1))}</span>`}
  </a>
  <h3 class="channel-card-title"><a href="${esc(c.href || `/channel/${encodeURIComponent(c.id)}`)}">${esc(c.title)}</a></h3>
  <p class="channel-card-meta">${esc([c.handle, c.subscribers].filter(Boolean).join(' ・ '))}</p>
  <p class="channel-card-desc">${esc((c.description || '').slice(0, 90))}</p>
  <button class="btn btn-secondary subscribe-btn" data-action="subscribe" data-channel-id="${esc(c.id)}">登録</button>
</article>`;
}

export function playlistCard(p) {
  const count = p.count || p.videoCount || (p.videos?.length ? `${p.videos.length}本` : '');
  return `<article class="video-card playlist-card" data-playlist-id="${esc(p.id)}">
  <a class="video-thumb" href="${esc(p.href || `/playlist?list=${encodeURIComponent(p.id)}`)}">
    <img loading="lazy" src="${esc(p.thumbnail || '')}" alt="">
    <span class="thumb-count">${icon('playlist')} ${esc(count)}</span>
  </a>
  <div class="video-meta">
    <div class="video-meta-text">
      <h3 class="video-title"><a href="${esc(p.href || `/playlist?list=${encodeURIComponent(p.id)}`)}">${esc(p.title)}</a></h3>
      <p class="video-author">${esc(p.author || '')}</p>
      <p class="video-stats">${esc(count)}</p>
    </div>
  </div>
</article>`;
}

export function compactVideo(v, { active = false } = {}) {
  if (!v) return '';
  const href = v.href || `/watch?v=${encodeURIComponent(v.id)}`;
  return `<a class="compact-video${active ? ' active' : ''}" href="${esc(href)}" data-video-id="${esc(v.id)}">
  <span class="compact-thumb">
    <img loading="lazy" src="${esc(v.thumbnail || '')}" alt="">
    ${v.duration ? `<span class="thumb-duration">${esc(v.duration)}</span>` : ''}
  </span>
  <span class="compact-meta">
    <span class="compact-title">${esc(v.title)}</span>
    <span class="compact-author">${esc(v.author || v.channel?.title || '')}</span>
    <span class="compact-stats">${esc([v.views, v.published].filter(Boolean).join('・'))}</span>
  </span>
</a>`;
}

export function commentNode(c, { isReply = false } = {}) {
  const avatar = c.avatar
    ? `<img class="comment-avatar" loading="lazy" src="${esc(c.avatar)}" alt="">`
    : `<span class="comment-avatar fallback">${esc((c.author || '?').slice(0, 1))}</span>`;
  return `<div class="comment${isReply ? ' reply' : ''}" data-comment-id="${esc(c.id || '')}">
  ${avatar}
  <div class="comment-body">
    <p class="comment-head">
      <span class="comment-author">${esc(c.author || '')}</span>
      <span class="comment-time">${esc(c.time || '')}</span>
      ${c.isAuthor ? '<span class="comment-badge owner">投稿者</span>' : ''}
      ${c.heartedByCreator ? '<span class="comment-badge heart">♥</span>' : ''}
    </p>
    <p class="comment-text">${esc(c.text || '').replace(/\n/g, '<br>')}</p>
    <div class="comment-actions">
      <button class="icon-btn-sm" data-action="comment-like" aria-label="高く評価">${icon('like')}<span>${esc(c.likes || '')}</span></button>
      <button class="icon-btn-sm" data-action="comment-dislike" aria-label="低く評価">${icon('dislike')}</button>
      ${!isReply ? `<button class="text-btn" data-action="comment-replies"${c.repliesToken ? ` data-token="${esc(c.repliesToken)}"` : ''}>${esc(c.replyCount || '返信')}</button>` : ''}
    </div>
    ${!isReply ? `<div class="comment-replies" data-replies hidden></div>` : ''}
  </div>
</div>`;
}

export function notificationNode(n) {
  return `<a class="notif-item${n.read ? '' : ' unread'}" href="${esc(n.href || '#')}">
  ${n.avatar ? `<img loading="lazy" src="${esc(n.avatar)}" alt="">` : `<span class="notif-avatar">${icon('bell')}</span>`}
  <span class="notif-body"><b>${esc(n.title || n.text)}</b><small>${esc(n.time || '')}</small></span>
</a>`;
}

/* ------------------------------------------------------------------ *
 * shell: topbar / sidebar / dialogs
 * ------------------------------------------------------------------ */

const NAV_PRIMARY = [
  { href: '/', icon: 'home', label: 'ホーム', match: ['/', '/feed/'] },
  { href: '/shorts', icon: 'shorts', label: 'Shorts', match: ['/shorts'] },
  { href: '/subscriptions', icon: 'sub', label: '登録チャンネル', match: ['/subscriptions'] },
];

const NAV_YOU = [
  { href: '/history', icon: 'history', label: '履歴' },
  { href: '/playlists', icon: 'playlist', label: '再生リスト' },
  { href: '/watch-later', icon: 'clock', label: '後で見る' },
  { href: '/liked', icon: 'like', label: '高く評価した動画' },
  { href: '/my-channel', icon: 'user', label: 'あなたのチャンネル' },
];

const NAV_EXPLORE = [
  { href: '/feed/trending', icon: 'fire', label: '急上昇' },
  { href: '/feed/music', icon: 'music', label: '音楽' },
  { href: '/feed/gaming', icon: 'game', label: 'ゲーム' },
  { href: '/feed/news', icon: 'news', label: 'ニュース' },
];

function navItem(item, path, { compact = false } = {}) {
  const active =
    item.match
      ? item.match.some((m) => (m === '/' ? path === '/' : path.startsWith(m)))
      : path === item.href || (item.href !== '/' && path.startsWith(item.href));
  return `<a class="nav-item${compact ? ' compact-primary' : ''}${active ? ' active' : ''}" href="${esc(item.href)}">${icon(item.icon)}<span>${esc(item.label)}</span></a>`;
}

export function topbar({ path = '/', account = null, query = '', title = '' } = {}) {
  const authed = !!account;
  return `<header class="topbar">
  <div class="header-left">
    <button id="menuButton" class="icon-btn" aria-label="メニュー">${icon('menu')}</button>
    <a class="brand" href="/" aria-label="${esc(config.brandName)}">
      <svg class="brand-logo" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-logo"></use></svg>
      <span class="brand-name">${esc(config.brandName)}</span>
    </a>
  </div>
  <div class="header-center">
    <form class="search-form" action="/search" method="get" role="search">
      <div class="search-wrap">
        <span class="search-leading">${icon('search')}</span>
        <input id="searchInput" name="q" type="search" autocomplete="off" spellcheck="false"
               placeholder="検索" aria-label="検索" value="${esc(query)}">
        <button type="button" id="searchClear" class="search-clear" aria-label="消去" hidden>${icon('close')}</button>
        <div id="searchSuggestions" class="search-suggestions" hidden></div>
      </div>
      <button class="search-submit" type="submit" aria-label="検索">${icon('search')}</button>
      <button type="button" id="mobileSearchClose" class="icon-btn mobile-search-close" aria-label="閉じる">${icon('chevron-left')}</button>
    </form>
  </div>
  <div class="header-right">
    <button id="queueButton" class="icon-btn mobile-header-hide" aria-label="再生キュー">${icon('queue')}</button>
    <div class="popover-anchor mobile-header-hide">
      <button id="notificationsButton" class="icon-btn" aria-label="通知">${icon('bell')}<span id="notifBadge" class="notif-badge" hidden>0</span></button>
      <div id="notificationsPopover" class="header-popover notifications-popover" hidden>
        <div class="popover-header"><h3>通知</h3><button id="closeNotifPopover" class="icon-btn-sm" aria-label="閉じる">${icon('close')}</button></div>
        <div id="notificationsList" class="notifications-list"><div class="popover-loading"><span></span><span></span><span></span></div></div>
      </div>
    </div>
    <div class="popover-anchor">
      <button id="accountButton" class="account-button" aria-label="アカウント">
        ${
          authed && account.avatar
            ? `<span id="accountAvatar" class="account-avatar"><img src="${esc(account.avatar)}" alt=""></span>`
            : `<span id="accountAvatar" class="account-avatar placeholder">${esc((account?.name || 'W').slice(0, 1))}</span>`
        }
      </button>
      <div id="accountMenuPopover" class="header-popover account-popover" hidden>
        <div id="accountUserHeader" class="account-user-header">
          ${
            authed && account.avatar
              ? `<span class="account-avatar-lg"><img src="${esc(account.avatar)}" alt=""></span>`
              : '<span class="account-avatar-lg placeholder">W</span>'
          }
          <div class="account-user-meta">
            <b id="menuAccountName">${esc(authed ? account.name || 'YouTubeアカウント' : 'ログインしていません')}</b>
            <span id="menuAccountHandle">${esc(authed ? account.handle || '' : '')}</span>
            ${authed ? '<a class="account-channel-link" href="/my-channel">チャンネルを表示</a>' : ''}
          </div>
        </div>
        <div class="popover-divider"></div>
        <div class="popover-menu-items">
          <a class="popover-item" href="/my-channel">${icon('user')}<span>あなたのチャンネル</span></a>
          <a class="popover-item" href="/settings">${icon('settings')}<span>設定</span></a>
          <button id="themeMenuTrigger" class="popover-item">${icon('moon')}<span>デザイン</span><b id="currentThemeLabel">端末の設定を使用</b>${icon('chevron-right', 'menu-arrow')}</button>
          <button id="shortcutsMenuTrigger" class="popover-item">${icon('keyboard')}<span>キーボード ショートカット</span></button>
        </div>
        <div class="popover-divider"></div>
        <div class="popover-menu-items">
          <button id="authMenuAction" class="popover-item">${icon('user')}<span id="authMenuLabel">${authed ? 'ログアウト' : 'YouTubeアカウントでログイン'}</span></button>
        </div>
      </div>
    </div>
    <button id="mobileSearchOpen" class="icon-btn mobile-search-trigger" aria-label="検索">${icon('search')}</button>
  </div>
</header>`;
}

export function sidebar({ path = '/' } = {}) {
  return `<aside class="sidebar" id="sidebar">
  <nav class="sidebar-nav">
    <div class="sidebar-primary">
      ${NAV_PRIMARY.map((n) => navItem(n, path, { compact: true })).join('')}
    </div>
    <div class="sidebar-divider"></div>
    <div class="sidebar-section">
      <h3 class="sidebar-title">あなた<span class="sidebar-title-arrow">${icon('chevron-right')}</span></h3>
      ${NAV_YOU.map((n) => navItem(n, path)).join('')}
    </div>
    <div class="sidebar-divider"></div>
    <div class="sidebar-section">
      <h3 class="sidebar-title">登録チャンネル</h3>
      <a class="nav-item" href="/subscriptions">${icon('sub')}<span>登録チャンネル</span></a>
    </div>
    <div class="sidebar-divider"></div>
    <div class="sidebar-section">
      <h3 class="sidebar-title">探索</h3>
      ${NAV_EXPLORE.map((n) => navItem(n, path)).join('')}
    </div>
    <div class="sidebar-divider"></div>
    <div class="sidebar-section">
      <a class="nav-item" href="/settings">${icon('settings')}<span>設定</span></a>
    </div>
    <footer class="sidebar-footer sidebar-open-only">
      <p>© ${new Date().getFullYear()} ${esc(config.brandName)} Web Client</p>
    </footer>
  </nav>
</aside>
<div id="scrim" class="scrim"></div>`;
}

export function dialogs({ account = null }) {
  const authed = !!account;
  return `
<!-- card action sheet -->
<div id="cardActionsSheet" class="sheet" hidden>
  <div class="sheet-backdrop" data-close></div>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="動画の操作">
    <div class="sheet-head">
      <div class="sheet-thumb"><img id="sheetThumb" src="" alt=""></div>
      <div class="sheet-meta"><b id="sheetTitle"></b><span id="sheetAuthor"></span></div>
      <button class="icon-btn-sm" data-close aria-label="閉じる">${icon('close')}</button>
    </div>
    <div class="sheet-items">
      <button class="sheet-item" data-sheet-action="queue">${icon('queue')}<span>キューに追加</span></button>
      <button class="sheet-item" data-sheet-action="watch-later">${icon('clock')}<span>後で見るに保存</span></button>
      <button class="sheet-item" data-sheet-action="like">${icon('like')}<span>高く評価</span></button>
      <button class="sheet-item" data-sheet-action="playlist">${icon('playlist')}<span>再生リストに保存</span></button>
      <button class="sheet-item" data-sheet-action="download">${icon('download')}<span>動画をダウンロード</span></button>
      <button class="sheet-item" data-sheet-action="share">${icon('share')}<span>共有</span></button>
      <button class="sheet-item" data-sheet-action="copy">${icon('link')}<span>リンクをコピー</span></button>
    </div>
  </div>
</div>

<!-- playback queue -->
<div id="queueDialog" class="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel queue-panel" role="dialog" aria-modal="true" aria-label="再生キュー">
    <header class="modal-head"><h2>再生キュー</h2>
      <div class="modal-head-actions">
        <button id="queueClear" class="text-btn">${icon('close')}<span>キューを消去</span></button>
        <button class="icon-btn-sm modal-close" data-close aria-label="閉じる">${icon('close')}</button>
      </div>
    </header>
    <div id="queueList" class="queue-list"><p class="muted">キューは空です</p></div>
  </div>
</div>

<!-- stream info / download -->
<div id="streamInfoDialog" class="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel" role="dialog" aria-modal="true" aria-label="動画をダウンロード">
    <header class="modal-head"><h2>動画をダウンロード</h2><button class="icon-btn-sm modal-close" data-close aria-label="閉じる">${icon('close')}</button></header>
    <p class="modal-sub">利用可能な画質・形式を選択してください。</p>
    <p id="streamVideoTitle" class="stream-video-title" hidden></p>
    <div id="streamInfoList" class="stream-list"><p class="muted">読み込み中…</p></div>
    <p class="modal-note">※ ダウンロードURLは一時的なものです。必要な場合は再取得してください。</p>
  </div>
</div>

<!-- theme -->
<div id="themeDialog" class="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel modal-narrow" role="dialog" aria-modal="true" aria-label="デザイン">
    <header class="modal-head"><h2>デザイン</h2><button class="icon-btn-sm modal-close" data-close aria-label="閉じる">${icon('close')}</button></header>
    <p class="modal-sub">このブラウザにのみ適用されます</p>
    <div class="theme-options">
      <label class="theme-option"><input type="radio" name="theme" value="device" checked><span>端末の設定を使用</span></label>
      <label class="theme-option"><input type="radio" name="theme" value="dark"><span>${icon('moon')} ダークテーマ</span></label>
      <label class="theme-option"><input type="radio" name="theme" value="light"><span>${icon('sun')} ライトテーマ</span></label>
    </div>
  </div>
</div>

<!-- login -->
<div id="authDialog" class="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel modal-narrow" role="dialog" aria-modal="true" aria-label="ログイン">
    <header class="modal-head"><h2>YouTubeアカウントでログイン</h2><button class="icon-btn-sm modal-close" data-close aria-label="閉じる">${icon('close')}</button></header>
    <p class="modal-sub">テレビ認証を使ってログインすると、あなたのアカウントの再生履歴、登録チャンネル、おすすめを同期できます。</p>
    <button id="authStartButton" class="btn btn-primary btn-block">テレビ認証を開始</button>
    <div id="authProgress" class="auth-progress" hidden><span></span></div>
  </div>
</div>

<!-- device code -->
<div id="tvDialog" class="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel modal-narrow" role="dialog" aria-modal="true" aria-label="テレビでログイン">
    <header class="modal-head"><h2>テレビでログイン</h2><button class="icon-btn-sm modal-close" data-close aria-label="閉じる">${icon('close')}</button></header>
    <p class="modal-sub">スマートフォンやPCでYouTubeを開いて、下のコードを入力してください。</p>
    <ol class="tv-steps">
      <li><b>1</b> 認証ページを開く</li>
      <li><b>2</b> 表示されたコードを入力</li>
      <li><b>3</b> ログイン完了を待つ</li>
    </ol>
    <a id="tvVerifyUrl" class="btn btn-secondary btn-block" href="https://www.youtube.com/activate" target="_blank" rel="noopener noreferrer">認証ページを開く <span aria-hidden="true">↗</span></a>
    <div class="tv-code-wrap">
      <p class="tv-code-label">認証コード<span>コードをクリックするとコピーできます</span></p>
      <button id="tvUserCode" class="tv-code" type="button">----------</button>
    </div>
    <p id="tvStatus" class="tv-status">認証を待っています…</p>
  </div>
</div>

<!-- signed in -->
<div id="authedDialog" class="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel modal-narrow" role="dialog" aria-modal="true" aria-label="ログイン済み">
    <header class="modal-head"><h2>ログイン済み</h2><button class="icon-btn-sm modal-close" data-close aria-label="閉じる">${icon('close')}</button></header>
    <div class="authed-body">
      <span id="authedAvatar" class="account-avatar-lg placeholder">W</span>
      <div><b id="authedName">YouTubeアカウント</b><span id="authedHandle"></span></div>
    </div>
    <button id="authSignOut" class="btn btn-secondary btn-block">ログアウト</button>
  </div>
</div>

<!-- auth error -->
<div id="authErrorDialog" class="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel modal-narrow" role="dialog" aria-modal="true" aria-label="認証エラー">
    <header class="modal-head"><h2>認証エラー</h2><button class="icon-btn-sm modal-close" data-close aria-label="閉じる">${icon('close')}</button></header>
    <p id="authErrorMessage" class="modal-sub">認証に失敗しました。</p>
    <button id="authRetry" class="btn btn-primary btn-block">再試行</button>
  </div>
</div>

<!-- keyboard shortcuts -->
<div id="shortcutsDialog" class="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel" role="dialog" aria-modal="true" aria-label="キーボード ショートカット">
    <header class="modal-head"><h2>キーボード ショートカット</h2><button class="icon-btn-sm modal-close" data-close aria-label="閉じる">${icon('close')}</button></header>
    <div class="shortcuts-grid">
      <section><h3>再生</h3>
        <p><kbd>k</kbd> または <kbd>Space</kbd> 再生 / 一時停止</p>
        <p><kbd>j</kbd> / <kbd>l</kbd> 10 秒戻る / 進む</p>
        <p><kbd>←</kbd> / <kbd>→</kbd> 5 秒戻る / 進む</p>
        <p><kbd>0</kbd>〜<kbd>9</kbd> 動画の 0%〜90% へ移動</p>
        <p><kbd>Shift</kbd> + <kbd>&gt;</kbd> / <kbd>&lt;</kbd> 速度を上げる / 下げる</p>
      </section>
      <section><h3>全般 &amp; 表示</h3>
        <p><kbd>/</kbd> 検索バーへ移動</p>
        <p><kbd>t</kbd> シアターモード</p>
        <p><kbd>f</kbd> 全画面表示</p>
        <p><kbd>i</kbd> ミニプレーヤー</p>
        <p><kbd>m</kbd> ミュート</p>
        <p><kbd>Esc</kbd> ダイアログやメニューを閉じる</p>
      </section>
    </div>
  </div>
</div>

<div id="toastRoot" class="toast-root" aria-live="polite"></div>
<div id="miniPlayer" class="mini-player" hidden>
  <div class="mini-player-shell"></div>
  <div class="mini-player-controls">
    <button id="miniPlayButton" class="icon-btn-sm" aria-label="再生">${icon('play')}</button>
    <button id="miniCloseButton" class="icon-btn-sm" aria-label="閉じる">${icon('close')}</button>
  </div>
</div>
`;
}

export function bottomNav({ path = '/' } = {}) {
  const items = [
    { href: '/', icon: 'home', label: 'ホーム', match: (p) => p === '/' || p.startsWith('/feed/') },
    { href: '/shorts', icon: 'shorts', label: 'Shorts', match: (p) => p.startsWith('/shorts') },
    { href: '/subscriptions', icon: 'sub', label: '登録', match: (p) => p === '/subscriptions' },
    { href: '/history', icon: 'history', label: '履歴', match: (p) => p === '/history' },
  ];
  return `<nav class="bottom-nav" aria-label="プライマリ">
  ${items
    .map(
      (i) =>
        `<a class="bottom-nav-item${i.match(path) ? ' active' : ''}" href="${esc(i.href)}">${icon(i.icon)}<span>${esc(i.label)}</span></a>`
    )
    .join('')}
</nav>`;
}

function scriptTags(extra = []) {
  const files = [
    '/app.js',
    '/scripts/app-theme.js',
    '/scripts/app-header.js',
    '/scripts/app-card-actions.js',
    '/scripts/app-watch.js',
    '/scripts/app-recommendations.js',
    '/scripts/app-shorts.js',
    '/scripts/app-library.js',
    '/scripts/app-sidebar.js',
    '/scripts/app-auth.js',
    '/scripts/app-progress.js',
    '/scripts/app-queue.js',
    '/scripts/app-keyboard.js',
    '/scripts/app-channel.js',
    '/scripts/app-library-controls.js',
    '/scripts/app-settings.js',
    '/scripts/app-feed-pagination.js',
  ];
  return [...files, ...extra].map((f) => `<script src="${f}${V()}" defer></script>`).join('\n  ');
}

/**
 * Full page document.
 * @param {object} o
 * @param {string} o.title  document title (already suffixed)
 * @param {string} o.page   body[data-page]
 * @param {string} o.path   current request path (nav highlighting)
 * @param {string} o.main   inner HTML for <main>
 */
export function page({
  title,
  page = 'home',
  path = '/',
  main = '',
  account = null,
  query = '',
  mainClass = '',
  head = '',
  bodyAttrs = '',
  extraScripts = [],
  hideSidebar = false,
}) {
  const authed = !!account;
  return `<!doctype html>
<html lang="ja" data-theme="device">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="dark light">
  <title>${esc(title)}</title>
  <link id="siteFavicon" rel="icon" type="image/png" referrerpolicy="no-referrer" href="/images/logo.png">
  <link rel="stylesheet" href="/style.css${V()}">
  ${head}
</head>
<body data-page="${esc(page)}" data-authenticated="${authed}"${bodyAttrs ? ` ${bodyAttrs}` : ''}>
  <div id="pageProgress" class="page-progress" aria-hidden="true"><span></span></div>
  ${sprite()}
  ${topbar({ path, account, query, title })}
  ${hideSidebar ? '' : sidebar({ path })}
  <main class="main ${cls(mainClass)}">
    ${main}
  </main>
  ${bottomNav({ path })}
  ${dialogs({ account })}
  ${scriptTags(extraScripts)}
</body>
</html>`;
}

export const assetVersion = V;
