/**
 * JSON API routes. The endpoint surface mirrors the reference deployment so the
 * client scripts can stay small and predictable.
 */
import express from 'express';
import {
  getFeed,
  searchPage,
  suggestions,
  videosByIds,
  commentsFor,
  commentReplies,
  relatedNext,
  shortsFeed,
  FEEDS,
} from '../youtube/service.js';
import {
  authStatusPayload,
  startAuth,
  signOut,
  ensureAccount,
  accountFeed,
  notifications,
  interact,
  videoState,
  channelState,
} from '../youtube/account.js';
import { streamInfo } from '../services/stream.js';
import { startChat, chatEvents, chatFilter } from '../youtube/livechat.js';
import { config } from '../config.js';

export const router = express.Router();

const json = (res, data, status = 200) => res.status(status).json(data);
const err = (res, e, status) => {
  const code = status || e.status || (e.code === 'blocked' ? 502 : 500);
  console.error('[api]', e.message || e);
  return json(res, { error: e.message || 'リクエストを処理できませんでした。' }, code);
};

const requireAuth = async (req, res) => {
  const token = await ensureAccount(req.session).catch(() => null);
  if (!token?.tokens?.accessToken) {
    json(res, { error: 'この操作にはYouTubeアカウントへのログインが必要です。', authenticated: false }, 401);
    return null;
  }
  return token;
};

/* ---------------- auth ---------------- */

router.get('/auth/status', async (req, res) => {
  try {
    if (req.session?.account?.tokens?.accessToken) await ensureAccount(req.session);
  } catch {
    /* keep the stored state */
  }
  json(res, authStatusPayload(req.session || {}));
});

router.post('/auth/start', async (req, res) => {
  try {
    const auth = await startAuth(req.session || {});
    await req.saveSession?.();
    json(res, {
      status: 'pending',
      userCode: auth.userCode,
      verificationUrl: auth.verificationUrl,
      expiresAt: auth.expiresAt,
      interval: auth.interval,
    });
  } catch (e) {
    err(res, e);
  }
});

router.post('/auth/signout', async (req, res) => {
  signOut(req.session || {});
  await req.saveSession?.();
  json(res, { status: 'signed_out' });
});

/* ---------------- account data ---------------- */

const accountRoute = (path, kind) => {
  router.get(path, async (req, res) => {
    try {
      const account = await requireAuth(req, res);
      if (!account) return;
      const feed = await accountFeed(req.session, kind, { token: String(req.query.token || '') });
      await req.saveSession?.();
      json(res, {
        items: feed.items,
        shelves: feed.shelves || [],
        continuation: feed.continuation || '',
        authenticated: feed.authenticated,
      });
    } catch (e) {
      err(res, e, 502);
    }
  });
};

accountRoute('/account/history', 'history');
accountRoute('/account/history/next', 'history');
accountRoute('/account/liked', 'liked');
accountRoute('/account/subscriptions', 'subscriptions');
accountRoute('/account/watch-later', 'watchLater');
accountRoute('/account/playlists', 'playlists');
accountRoute('/account/my-channel', 'myChannel');

router.get('/account/video-state', async (req, res) => {
  const videoId = String(req.query.id || req.query.videoId || '');
  if (!videoId) return json(res, { error: 'id が必要です。' }, 400);
  try {
    const account = req.session?.account?.tokens?.accessToken ? await ensureAccount(req.session) : null;
    if (!account) return json(res, { liked: false, disliked: false, inWatchLater: false, authenticated: false });
    const state = await videoState(req.session, videoId);
    await req.saveSession?.();
    json(res, state);
  } catch (e) {
    err(res, e, 502);
  }
});

router.get('/account/channel-state', async (req, res) => {
  const channelId = String(req.query.id || '');
  if (!channelId) return json(res, { error: 'id が必要です。' }, 400);
  try {
    const account = req.session?.account?.tokens?.accessToken ? await ensureAccount(req.session) : null;
    if (!account) return json(res, { subscribed: false, authenticated: false });
    const state = await channelState(req.session, channelId);
    await req.saveSession?.();
    json(res, state);
  } catch (e) {
    err(res, e, 502);
  }
});

router.post('/interact', async (req, res) => {
  try {
    const account = await requireAuth(req, res);
    if (!account) return;
    const { action, videoId, channelId, params } = req.body || {};
    if (!action) return json(res, { error: 'action が必要です。' }, 400);
    const result = await interact(req.session, { action, videoId, channelId, params });
    await req.saveSession?.();
    json(res, result);
  } catch (e) {
    err(res, e, e.status || 502);
  }
});

router.get('/notifications', async (req, res) => {
  try {
    if (!req.session?.account?.tokens?.accessToken) {
      return json(res, { notifications: [], authenticated: false, status: 'signed_out' });
    }
    await ensureAccount(req.session);
    const result = await notifications(req.session);
    await req.saveSession?.();
    json(res, result);
  } catch (e) {
    err(res, e, 502);
  }
});

/* ---------------- discovery ---------------- */

/** Infinite scroll for home / category feeds. */
router.post('/feed/next', async (req, res) => {
  try {
    const { continuation = '', kind = 'home' } = req.body || {};
    if (!continuation) return json(res, { items: [], hasMore: false });
    const feed = await getFeed(FEEDS[kind] ? kind : 'home', { token: continuation });
    json(res, {
      items: feed.items,
      shorts: feed.shorts,
      continuation: feed.continuation,
      hasMore: !!feed.continuation,
    });
  } catch (e) {
    err(res, e, 502);
  }
});

router.get('/feed/next', async (req, res) => {
  try {
    const continuation = String(req.query.continuation || req.query.token || '');
    const kind = String(req.query.kind || 'home');
    if (!continuation) return json(res, { items: [], hasMore: false });
    const feed = await getFeed(FEEDS[kind] ? kind : 'home', { token: continuation });
    json(res, { items: feed.items, shorts: feed.shorts, continuation: feed.continuation, hasMore: !!feed.continuation });
  } catch (e) {
    err(res, e, 502);
  }
});

router.get('/search/next', async (req, res) => {
  try {
    const continuation = String(req.query.continuation || '');
    const query = String(req.query.q || '');
    if (!continuation) return json(res, { items: [], hasMore: false });
    const results = await searchPage(query, { token: continuation });
    json(res, {
      videos: results.videos,
      channels: results.channels,
      playlists: results.playlists,
      shorts: results.shorts,
      continuation: results.continuation,
      hasMore: !!results.continuation,
    });
  } catch (e) {
    err(res, e, 502);
  }
});

router.get('/channel/next', async (req, res) => {
  try {
    const continuation = String(req.query.continuation || '');
    if (!continuation) return json(res, { items: [], hasMore: false });
    const { channelPage } = await import('../youtube/service.js');
    const data = await channelPage(String(req.query.id || ''), { token: continuation });
    json(res, { items: data.items, continuation: data.continuation, hasMore: !!data.continuation });
  } catch (e) {
    err(res, e, 502);
  }
});

router.get('/related/next', async (req, res) => {
  try {
    const continuation = String(req.query.continuation || '');
    if (!continuation) return json(res, { items: [], hasMore: false });
    const result = await relatedNext(continuation);
    json(res, { items: result.items, continuation: result.continuation, hasMore: !!result.continuation });
  } catch (e) {
    err(res, e, 502);
  }
});

/** Home recommendations (signed-in users get their real YouTube home feed). */
router.get('/recommendations', async (req, res) => {
  try {
    if (req.session?.account?.tokens?.accessToken) {
      await ensureAccount(req.session);
      const { signedInHome } = await import('../youtube/account.js');
      const home = await signedInHome(req.session);
      if (home?.items?.length) {
        return json(res, { items: home.items, continuation: home.continuation, source: 'youtube' });
      }
    }
    const feed = await getFeed('home');
    json(res, { items: feed.items, continuation: feed.continuation, source: 'local' });
  } catch (e) {
    err(res, e, 502);
  }
});

router.get('/suggestions', async (req, res) => {
  const q = String(req.query.q || '');
  if (!q) return json(res, { suggestions: [] });
  try {
    json(res, { suggestions: await suggestions(q) });
  } catch (e) {
    json(res, { suggestions: [] });
  }
});

router.get('/videos', async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (!ids.length) return json(res, { videos: [] });
  try {
    json(res, { videos: await videosByIds(ids) });
  } catch (e) {
    json(res, { videos: ids.map((id) => ({ id, title: `動画 (${id})`, author: 'チャンネル不明', thumbnail: '', duration: '', views: '', published: '' })) });
  }
});

router.get('/shorts', async (req, res) => {
  try {
    const result = await shortsFeed({ token: String(req.query.token || '') });
    json(res, { videos: result.videos, hasMore: !!result.continuation, continuation: result.continuation });
  } catch (e) {
    err(res, e, 502);
  }
});

router.get('/shorts/next', async (req, res) => {
  try {
    const result = await shortsFeed({ token: String(req.query.token || '') });
    json(res, { videos: result.videos, hasMore: !!result.continuation });
  } catch (e) {
    json(res, { videos: [], hasMore: false });
  }
});

/* ---------------- comments ---------------- */

router.get('/comments', async (req, res) => {
  const v = String(req.query.v || '');
  if (!v) return json(res, { comments: [], continuation: '' });
  try {
    const result = await commentsFor(v, { sort: String(req.query.sort || 'top') });
    json(res, result);
  } catch (e) {
    json(res, { error: 'コメントを取得できませんでした。', comments: [], continuation: '' }, 502);
  }
});

router.get('/comments/next', async (req, res) => {
  const continuation = String(req.query.continuation || req.query.token || '');
  if (!continuation) return json(res, { comments: [], continuation: '' });
  try {
    const result = await commentReplies(continuation);
    json(res, result);
  } catch (e) {
    json(res, { error: 'コメントを取得できませんでした。', comments: [], continuation: '' }, 502);
  }
});

router.get('/comment-replies', async (req, res) => {
  const continuation = String(req.query.continuation || req.query.token || '');
  if (!continuation) return json(res, { comments: [], continuation: '' });
  try {
    const result = await commentReplies(continuation);
    json(res, result);
  } catch (e) {
    json(res, { error: '返信を取得できませんでした。', comments: [], continuation: '' }, 502);
  }
});

/* ---------------- streaming ---------------- */

router.get('/stream-info', async (req, res) => {
  const v = String(req.query.v || '');
  if (!/^[\w-]{6,20}$/.test(v)) return json(res, { error: 'videoId が不正です。' }, 400);
  try {
    const info = await streamInfo(v);
    if (!info.formats.length) {
      return json(res, { error: info.error || 'ストリームURLを取得できませんでした。', title: info.title, formats: [] }, 502);
    }
    json(res, info);
  } catch (e) {
    json(res, { error: e.message || 'ストリームURLを取得できませんでした。', formats: [] }, 502);
  }
});

/* ---------------- live chat ---------------- */

router.post('/live-chat/start', async (req, res) => {
  const v = String(req.query.v || req.body?.v || '');
  if (!v) return json(res, { error: 'v が必要です。' }, 400);
  try {
    const info = await startChat(v);
    json(res, info);
  } catch (e) {
    json(res, { error: e.message }, e.status || 502);
  }
});

router.get('/live-chat/start', async (req, res) => {
  const v = String(req.query.v || '');
  if (!v) return json(res, { error: 'v が必要です。' }, 400);
  try {
    json(res, await startChat(v));
  } catch (e) {
    json(res, { error: e.message }, e.status || 502);
  }
});

router.get('/live-chat/:token/events', async (req, res) => {
  try {
    const token = req.session?.account?.tokens?.accessToken ? (await ensureAccount(req.session))?.tokens?.accessToken : null;
    const result = await chatEvents(String(req.query.continuation || req.params.token || ''), { token });
    json(res, result);
  } catch (e) {
    json(res, { error: e.message, messages: [] }, 502);
  }
});

router.post('/live-chat/:token/filter', async (req, res) => {
  try {
    const result = await chatFilter(String(req.query.continuation || req.params.token || ''), String(req.body?.filter || 'all'));
    json(res, result);
  } catch (e) {
    json(res, { error: e.message }, 502);
  }
});

/* ---------------- ops ---------------- */

router.get('/health', (_req, res) => {
  json(res, {
    ok: true,
    version: config.assetVersion,
    uptime: Math.round(process.uptime()),
    provider: config.streamProvider,
    proxy: !!config.proxy,
    hl: config.hl,
    gl: config.gl,
  });
});

/* unknown API endpoint (same shape as the reference app) */
router.use((_req, res) => json(res, { error: 'API endpoint not found.' }, 404));
