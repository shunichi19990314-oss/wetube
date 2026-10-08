/**
 * Page routes (server-rendered HTML).
 */
import express from 'express';
import {
  getFeed,
  searchPage,
  channelPage,
  playlistPage,
  shortsFeed,
  watchPage,
  commentsFor,
  FEEDS,
  SEARCH_TYPES,
} from '../youtube/service.js';
import { accountFeed, ensureAccount, signedInHome } from '../youtube/account.js';
import {
  homePage,
  feedPage,
  searchResultsPage,
  channelPageView,
  watchPageView,
  shortsPageView,
  playlistPageView,
  libraryPageView,
  settingsPageView,
  errorPageView,
} from '../views/pages.js';
import { config } from '../config.js';

export const router = express.Router();

/** Account object for the shell (null when signed out). */
function shellAccount(req) {
  const a = req.session?.account;
  if (!a?.tokens?.accessToken) return null;
  return { name: a.name, handle: a.handle, avatar: a.avatar, channelId: a.channelId };
}

const send = (res, html, status = 200) => res.status(status).type('html').send(html);

const fail = (req, res, err, fallbackMsg) => {
  const status = err?.status === 404 ? 404 : 503;
  console.error(`[page] ${req.originalUrl} ->`, err?.message || err);
  send(
    res,
    errorPageView({
      status,
      title: 'エラー',
      message: err?.message || fallbackMsg,
      account: shellAccount(req),
      path: req.path,
    }),
    status
  );
};

/* ---------------- home ---------------- */

router.get('/', async (req, res) => {
  const account = shellAccount(req);
  try {
    let feed;
    let error = '';
    if (account) {
      const personalised = await signedInHome(req.session).catch(() => null);
      if (personalised?.items?.length) {
        feed = { items: personalised.items, shorts: [], continuation: personalised.continuation, title: 'ホーム' };
      }
    }
    if (!feed) {
      feed = await getFeed('home');
      if (!feed.items.length) error = 'おすすめを取得できませんでした。YouTube側でこのサーバーからの通信が制限されている可能性があります。';
    }
    send(res, homePage({ feed, account, path: '/', error }));
  } catch (e) {
    // Never render a broken home: fall back to a cached/empty grid.
    send(res, homePage({ feed: { items: [], shorts: [], continuation: '' }, account, path: '/', error: e.message }));
  }
});

/* ---------------- discovery feeds ---------------- */

router.get('/feed/:kind', async (req, res) => {
  const kind = req.params.kind;
  if (!FEEDS[kind]) return fail(req, res, Object.assign(new Error('ページが見つかりません'), { status: 404 }));
  const account = shellAccount(req);
  try {
    const feed = await getFeed(kind);
    send(res, feedPage({ kind, feed, account, path: `/feed/${kind}` }));
  } catch (e) {
    fail(req, res, e, 'フィードを読み込めませんでした。');
  }
});

/* ---------------- search ---------------- */

router.get('/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const account = shellAccount(req);
  if (!query) {
    return send(
      res,
      searchResultsPage({
        results: { videos: [], channels: [], playlists: [], shorts: [] },
        account,
        path: '/search',
        query: '',
        error: '検索キーワードを入力してください。',
      })
    );
  }
  const sp = String(req.query.sp || '');
  const typeKey = Object.keys(SEARCH_TYPES).find((k) => SEARCH_TYPES[k].params === sp) || String(req.query.type || 'all');
  try {
    const results = await searchPage(query, { type: typeKey, params: sp, sort: String(req.query.sort || '') });
    send(res, searchResultsPage({ results, account, path: '/search', query, type: typeKey, sort: String(req.query.sort || '') }));
  } catch (e) {
    fail(req, res, e, '検索に失敗しました。');
  }
});

/* ---------------- channel ---------------- */

router.get('/channel/:id', async (req, res) => {
  const account = shellAccount(req);
  const identifier = req.params.id;
  try {
    const data = await channelPage(identifier, { params: String(req.query.params || ''), token: '' });
    if (!data.items.length && !data.header?.title) {
      return fail(req, res, Object.assign(new Error('チャンネルが見つかりませんでした。'), { status: 404 }));
    }
    send(res, channelPageView({ data, account, path: req.originalUrl.split('?')[0] }));
  } catch (e) {
    fail(req, res, e, 'チャンネルを読み込めませんでした。');
  }
});

/** @handle style URLs. */
router.get('/@:handle', async (req, res, next) => {
  const account = shellAccount(req);
  try {
    const data = await channelPage(`@${req.params.handle}`, { params: String(req.query.params || '') });
    send(res, channelPageView({ data, account, path: req.path }));
  } catch (e) {
    fail(req, res, e, 'チャンネルを読み込めませんでした。');
  }
});

/* ---------------- watch ---------------- */

router.get('/watch', async (req, res) => {
  const videoId = String(req.query.v || '');
  const account = shellAccount(req);
  if (!/^[\w-]{6,20}$/.test(videoId)) {
    return fail(req, res, Object.assign(new Error('動画IDが不正です。'), { status: 404 }));
  }
  try {
    const data = await watchPage(videoId, { playlist: String(req.query.list || ''), index: String(req.query.index ?? '') });
    if (!data.title) {
      return fail(req, res, Object.assign(new Error('動画が見つかりませんでした。'), { status: 404 }));
    }
    send(res, watchPageView({ data, account, path: '/watch' }));
  } catch (e) {
    fail(req, res, e, 'うまく読み込めませんでした');
  }
});

/* ---------------- shorts ---------------- */

router.get('/shorts', async (req, res) => {
  const account = shellAccount(req);
  try {
    const { videos } = await shortsFeed();
    send(res, shortsPageView({ items: videos, account, path: '/shorts' }));
  } catch (e) {
    fail(req, res, e, 'ショート動画を読み込めませんでした。');
  }
});

router.get('/shorts/:id', async (req, res) => {
  const account = shellAccount(req);
  try {
    const { videos } = await shortsFeed();
    const id = req.params.id;
    const items = videos.some((v) => v.id === id) ? videos : [{ id, title: 'ショート動画', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, href: `/shorts/${id}` }, ...videos];
    send(res, shortsPageView({ items, activeId: id, account, path: `/shorts/${id}` }));
  } catch (e) {
    fail(req, res, e, 'ショート動画を読み込めませんでした。');
  }
});

/* ---------------- playlist ---------------- */

router.get('/playlist', async (req, res) => {
  const listId = String(req.query.list || '');
  const account = shellAccount(req);
  if (!listId) return fail(req, res, Object.assign(new Error('再生リストIDがありません。'), { status: 404 }));
  try {
    const data = await playlistPage(listId);
    send(res, playlistPageView({ data, account, path: '/playlist' }));
  } catch (e) {
    fail(req, res, e, '再生リストを読み込めませんでした。');
  }
});

/* ---------------- library ---------------- */

const LIBRARY_ROUTES = {
  '/history': { kind: 'history', feedKind: 'history' },
  '/liked': { kind: 'liked', feedKind: 'liked' },
  '/watch-later': { kind: 'watch-later', feedKind: 'watchLater' },
  '/subscriptions': { kind: 'subscriptions', feedKind: 'subscriptions' },
  '/playlists': { kind: 'playlists', feedKind: 'playlists' },
  '/my-channel': { kind: 'my-channel', feedKind: 'myChannel' },
};

for (const [route, meta] of Object.entries(LIBRARY_ROUTES)) {
  router.get(route, async (req, res) => {
    const account = shellAccount(req);
    let items = [];
    let shelves = [];
    let authenticated = false;
    let error = '';
    let localHint = '';

    if (account) {
      try {
        await ensureAccount(req.session);
        const feed = await accountFeed(req.session, meta.feedKind);
        items = feed.items || [];
        shelves = feed.shelves || [];
        authenticated = feed.authenticated;
      } catch (e) {
        error = `YouTubeアカウントのデータを取得できませんでした（${e.message}）。端末のデータを表示します。`;
      }
    } else {
      localHint = 'ログインするとYouTubeアカウントと同期できます。今はこの端末のデータを表示しています。';
    }

    send(
      res,
      libraryPageView({
        kind: meta.kind,
        items,
        shelves,
        account,
        path: route,
        authenticated,
        error,
        localHint,
      })
    );
  });
}

/* ---------------- settings ---------------- */

router.get('/settings', (req, res) => {
  send(
    res,
    settingsPageView({
      account: shellAccount(req),
      path: '/settings',
      state: { theme: 'device', autoplay: true, speed: 1 },
    })
  );
});

/* ---------------- misc ---------------- */

router.get('/browse/:browseId', async (req, res) => {
  const account = shellAccount(req);
  try {
    const data = await channelPage(req.params.browseId, { params: String(req.query.params || '') });
    send(res, channelPageView({ data, account, path: req.path }));
  } catch (e) {
    fail(req, res, e, 'ページを読み込めませんでした。');
  }
});

/** 404 for anything unknown (the reference app falls back to the home shell). */
export function notFoundHandler(req, res) {
  send(
    res,
    errorPageView({
      status: 404,
      title: 'ページが見つかりません',
      message: `「${req.originalUrl}」に対応するページはありません。`,
      account: shellAccount(req),
      path: req.path,
    }),
    404
  );
}

export function errorHandler(err, req, res, _next) {
  console.error('[fatal]', err);
  const status = err.status || 500;
  if (res.headersSent) return;
  send(
    res,
    errorPageView({
      status,
      title: 'エラー',
      message: err.message || 'サーバー内部エラー',
      account: null,
      path: req.path,
    }),
    status
  );
}

export { config };
