/**
 * YouTube account integration: TV device OAuth + everything that needs a
 * signed-in token (history, liked videos, watch later, subscriptions,
 * playlists, notifications, like/subscribe actions).
 *
 * Tokens live inside the server-side session (never in the browser), are
 * refreshed automatically and are used with the TVHTML5 client, which is what
 * the device flow issues them for.
 */
import {
  startDeviceAuth,
  pollDeviceToken,
  refreshAccessToken,
  getAccountMenu,
  innertube,
  browse,
  next,
  contexts,
} from './innertube.js';
import { parseItems, parseNotifications, findContinuation, findFirst, proxiedImage, bestThumbnail } from './parsers.js';
import { runsToText, sleep } from '../utils.js';
import { config } from '../config.js';

const ACCOUNT_BROWSE_IDS = {
  history: 'FEhistory',
  liked: 'FEliked_videos',
  watchLater: 'VLWL',
  subscriptions: 'FEchannels',
  playlists: 'FElibrary',
  myChannel: 'FEmy_channel',
};

/* ------------------------------------------------------------------ *
 * token lifecycle (stored on the session object)
 * ------------------------------------------------------------------ */

export function sessionAccount(session) {
  return session?.account || null;
}

export function isSignedIn(session) {
  const a = sessionAccount(session);
  return !!(a?.tokens?.accessToken && !a.tokens.expiredAt?.past);
}

export async function validToken(session) {
  const a = sessionAccount(session);
  if (!a?.tokens?.accessToken) return null;
  const expiresAt = Number(a.tokens.expiresAt || 0);
  if (expiresAt && Date.now() > expiresAt - 60_000) {
    if (!a.tokens.refreshToken) return null;
    try {
      const refreshed = await refreshAccessToken(a.tokens.refreshToken);
      a.tokens.accessToken = refreshed.accessToken;
      a.tokens.expiresAt = Date.now() + refreshed.expiresIn * 1000;
      if (refreshed.refreshToken) a.tokens.refreshToken = refreshed.refreshToken;
      return a.tokens.accessToken;
    } catch (e) {
      a.error = e.message;
      a.status = 'error';
      return null;
    }
  }
  return a.tokens.accessToken;
}

function authOpts(token, extra = {}) {
  return { client: 'tv', token, timeoutMs: 20000, ...extra };
}

/* ------------------------------------------------------------------ *
 * device authorization flow
 * ------------------------------------------------------------------ */

/**
 * Kick off the TV device flow. Stores the pending grant on the session and
 * starts a polling loop that flips the session to signed-in when the user
 * enters the code on youtube.com/activate.
 */
export async function startAuth(session, { onProgress } = {}) {
  const grant = await startDeviceAuth();
  session.auth = {
    status: 'pending',
    deviceCode: grant.deviceCode,
    userCode: grant.userCode,
    verificationUrl: grant.verificationUrl,
    expiresAt: Date.now() + grant.expiresIn * 1000,
    interval: Math.max(3, grant.interval) * 1000,
    error: '',
    startedAt: Date.now(),
  };
  pollLoop(session).catch(() => {});
  if (onProgress) onProgress(session.auth);
  return session.auth;
}

async function pollLoop(session) {
  const auth = session.auth;
  if (!auth || auth.polling) return;
  auth.polling = true;
  const deadline = auth.expiresAt;
  let interval = auth.interval || 5000;

  try {
    while (session.auth === auth && auth.status === 'pending' && Date.now() < deadline) {
      await sleep(interval);
      if (session.auth !== auth || auth.status !== 'pending') break;
      try {
        const result = await pollDeviceToken(auth.deviceCode);
        if (result?.slowDown) {
          interval = Math.min(interval + 2000, 15000);
          continue;
        }
        if (result?.pending) continue;
        if (result?.tokens) {
          auth.status = 'authorized';
          const account = await buildAccount(result.tokens);
          session.account = account;
          session.auth = { ...auth, status: 'signed_in', account };
          return;
        }
      } catch (e) {
        if (e.code === 'expired_token' || e.code === 'access_denied') {
          auth.status = 'error';
          auth.error = e.message;
          return;
        }
        // transient network hiccup: keep polling until the deadline
      }
    }
    if (auth.status === 'pending') {
      auth.status = 'error';
      auth.error = '認証コードの有効期限が切れました。';
    }
  } finally {
    auth.polling = false;
  }
}

/** Turn raw tokens into the account object the UI displays. */
export async function buildAccount(tokens) {
  const account = {
    status: 'signed_in',
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || '',
      expiresAt: Date.now() + (tokens.expiresIn || 3600) * 1000,
      scope: tokens.scope || '',
    },
    name: '',
    handle: '',
    avatar: '',
    channelId: '',
    email: '',
    error: '',
    fetchedAt: Date.now(),
  };

  try {
    const menu = await getAccountMenu(account.tokens.accessToken);
    const avatar =
      bestThumbnail(findFirst(menu, ['sources'], 8) || []) ||
      proxiedImage(findFirst(menu, ['url'], 8) || '');
    const names = collectAllText(menu, ['accountHeaderRenderer', 'accountSectionHeaderRenderer']);
    const header = findFirst(menu, ['accountHeaderRenderer'], 10);
    const listHeader = findFirst(menu, ['accountSectionListRenderer'], 10);
    account.name =
      header?.accountName ||
      names.find((n) => n && !n.startsWith('@')) ||
      'YouTubeアカウント';
    account.handle = names.find((n) => n.startsWith('@')) || '';
    account.avatar = avatar;
    account.channelId =
      header?.channelHandle?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
      findFirst(menu, ['externalChannelId'], 12) ||
      '';
    void listHeader;
  } catch (e) {
    account.error = e.message;
  }
  return account;
}

function collectAllText(node, keys, out = [], depth = 12) {
  if (!node || depth < 0 || out.length > 20) return out;
  if (Array.isArray(node)) {
    for (const n of node) collectAllText(n, keys, out, depth - 1);
    return out;
  }
  if (typeof node !== 'object') return out;
  for (const k of keys) {
    if (node[k]) {
      const t = runsToText(node[k].accountName) || runsToText(node[k].channelHandle);
      if (t) out.push(t);
    }
  }
  for (const v of Object.values(node)) collectAllText(v, keys, out, depth - 1);
  return out;
}

/** Restore a session that already has tokens (e.g. after a restart). */
export async function ensureAccount(session) {
  if (!session.account?.tokens?.accessToken) return null;
  const token = await validToken(session);
  if (!token) return null;
  if (!session.account.name || Date.now() - (session.account.fetchedAt || 0) > 6 * 3600 * 1000) {
    const fresh = await buildAccount({
      accessToken: session.account.tokens.accessToken,
      refreshToken: session.account.tokens.refreshToken,
      expiresIn: Math.max(60, Math.round(((session.account.tokens.expiresAt || Date.now()) - Date.now()) / 1000)),
      scope: session.account.tokens.scope,
    });
    session.account = { ...fresh, tokens: session.account.tokens };
  }
  return session.account;
}

export function signOut(session) {
  delete session.account;
  session.auth = { status: 'signed_out', error: '' };
}

/* ------------------------------------------------------------------ *
 * account data feeds
 * ------------------------------------------------------------------ */

export async function accountFeed(session, kind, { token = '' } = {}) {
  const accessToken = await validToken(session);
  if (!accessToken) return { items: [], authenticated: false, continuation: '' };

  if (token) {
    const res = await browse({ continuation: token }, authOpts(accessToken));
    return {
      items: parseItems(res),
      authenticated: true,
      continuation: findContinuation(res),
    };
  }

  const browseId = ACCOUNT_BROWSE_IDS[kind];
  if (!browseId) return { items: [], authenticated: true, continuation: '' };
  const res = await browse({ browseId }, authOpts(accessToken));
  return {
    items: parseItems(res),
    authenticated: true,
    continuation: findContinuation(res),
    shelves: extractShelves(res),
    header: parseAccountHeader(res),
  };
}

function extractShelves(res) {
  const shelves = [];
  const found = findFirst(res, ['shelfRenderer'], 12);
  const walk = (node, depth = 0) => {
    if (!node || depth > 12 || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    if (node.shelfRenderer) {
      shelves.push({
        title: runsToText(node.shelfRenderer.title) || '',
        items: parseItems(node.shelfRenderer.content),
      });
    }
    for (const v of Object.values(node)) walk(v, depth + 1);
  };
  walk(res);
  void found;
  return shelves.filter((s) => s.items.length);
}

function parseAccountHeader(res) {
  const header = findFirst(res, ['pageHeaderRenderer', 'sectionListRenderer'], 8);
  return {
    title: runsToText(findFirst(header || {}, ['title'], 5)) || '',
  };
}

/** Home feed for a signed-in user (real recommendations). */
export async function signedInHome(session) {
  const accessToken = await validToken(session);
  if (!accessToken) return null;
  try {
    const res = await browse({ browseId: 'FEwhat_to_watch' }, authOpts(accessToken, { client: 'web' }));
    const items = parseItems(res);
    if (!items.length) return null;
    return { items, continuation: findContinuation(res), source: 'youtube' };
  } catch {
    return null;
  }
}

/** Notifications. */
export async function notifications(session) {
  const accessToken = await validToken(session);
  if (!accessToken) return { notifications: [], authenticated: false, status: 'signed_out' };
  try {
    const res = await innertube(
      'notification/get_notification_menu',
      { fetchNotificationMenu: true, notificationsMenuRequestType: 'NOTIFICATIONS_MENU_REQUEST_TYPE_FIRST_TIME' },
      authOpts(accessToken, { client: 'web' })
    );
    return {
      notifications: parseNotifications(res),
      authenticated: true,
      status: 'signed_in',
    };
  } catch (e) {
    return { notifications: [], authenticated: true, status: 'signed_in', error: e.message };
  }
}

/* ------------------------------------------------------------------ *
 * actions (like / dislike / watch later / subscribe)
 * ------------------------------------------------------------------ */

const LIKE_ENDPOINTS = {
  like: 'like/like',
  dislike: 'like/dislike',
  none: 'like/removelike',
};

export async function interact(session, { action, videoId, channelId, params }) {
  const accessToken = await validToken(session);
  if (!accessToken) {
    const e = new Error('この操作にはYouTubeアカウントへのログインが必要です。');
    e.status = 401;
    throw e;
  }

  switch (action) {
    case 'like':
    case 'dislike':
    case 'none': {
      const res = await innertube(
        LIKE_ENDPOINTS[action],
        { target: { videoId }, ...(params ? { params } : {}) },
        authOpts(accessToken, { client: 'web' })
      );
      return { ok: !!res, action, status: likeStatusFrom(res) };
    }
    case 'watch-later-add':
    case 'watch-later-remove': {
      const add = action === 'watch-later-add';
      const res = await innertube(
        'browse/edit_playlist',
        {
          playlistId: 'WL',
          actions: [add ? { addedVideoId: videoId, action: 'ACTION_ADD_VIDEO' } : { action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', removedVideoId: videoId }],
        },
        authOpts(accessToken, { client: 'web' })
      );
      return { ok: !!res, action, added: add };
    }
    case 'subscribe':
    case 'unsubscribe': {
      const endpoint = action === 'subscribe' ? 'subscription/subscribe' : 'subscription/unsubscribe';
      const res = await innertube(endpoint, { channelIds: [channelId] }, authOpts(accessToken, { client: 'web' }));
      return { ok: !!res, action, subscribed: action === 'subscribe' };
    }
    case 'history-remove': {
      const res = await innertube('browse/edit_playlist', { playlistId: 'HL', actions: [{ action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', removedVideoId: videoId }] }, authOpts(accessToken, { client: 'web' }));
      return { ok: !!res, action };
    }
    default: {
      const e = new Error(`未対応のアクションです: ${action}`);
      e.status = 400;
      throw e;
    }
  }
}

function likeStatusFrom(res) {
  const toggled = findFirst(res, ['toggleButtonViewModel'], 10);
  return toggled ? 'updated' : 'ok';
}

/**
 * Per-video state used to pre-select the like / watch-later buttons.
 * Best effort: reads the toggle state out of the authenticated `next` payload.
 */
export async function videoState(session, videoId) {
  const accessToken = await validToken(session);
  if (!accessToken) return { liked: false, disliked: false, inWatchLater: false, authenticated: false };
  try {
    const res = await next({ videoId }, authOpts(accessToken, { client: 'web' }));
    const s = JSON.stringify(res);
    const liked = /"likeButtonViewModel"[\s\S]{0,400}?"style":"BUTTON_VIEW_MODEL_STYLE_OVERLAY_LIKE_ACTIVE"/.test(s) ||
      /"toggleState":\{"styleType":"STYLE_LIKE"/.test(s);
    const disliked = /"toggleState":\{"styleType":"STYLE_DISLIKE"/.test(s);
    const inWatchLater = /playlistEditEndpoint"[\s\S]{0,200}?"playlistId":"WL"/.test(s) && /"state":"BUTTON_VIEW_MODEL_STATE_ACTIVE"/.test(s);
    return { liked, disliked, inWatchLater, authenticated: true };
  } catch {
    return { liked: false, disliked: false, inWatchLater: false, authenticated: true };
  }
}

/** Whether the signed-in account subscribes to a channel. */
export async function channelState(session, channelId) {
  const accessToken = await validToken(session);
  if (!accessToken) return { subscribed: false, authenticated: false };
  try {
    const res = await browse({ browseId: channelId }, authOpts(accessToken, { client: 'web' }));
    const btn = findFirst(res, ['subscribeButtonRenderer', 'subscriptionButtonViewModel'], 10);
    const s = JSON.stringify(btn || {});
    return { subscribed: /subscribed|登録済み|BUTTON_VIEW_MODEL_STATE_TOGGLED/i.test(s), authenticated: true };
  } catch {
    return { subscribed: false, authenticated: true };
  }
}

/** Serialisable view of the auth/account state for /api/auth/status. */
export function authStatusPayload(session) {
  const auth = session.auth || {};
  const account = session.account || null;
  if (account?.tokens?.accessToken) {
    return {
      status: 'signed_in',
      userCode: '',
      verificationUrl: '',
      expiresAt: 0,
      account: {
        name: account.name || 'YouTubeアカウント',
        handle: account.handle || '',
        avatar: account.avatar || '',
        channelId: account.channelId || '',
      },
      error: account.error || '',
      recommendationSource: 'youtube',
    };
  }
  if (auth.status === 'pending') {
    return {
      status: 'pending',
      userCode: auth.userCode || '',
      verificationUrl: auth.verificationUrl || 'https://www.youtube.com/activate',
      expiresAt: auth.expiresAt || 0,
      account: null,
      error: '',
      recommendationSource: 'local',
    };
  }
  if (auth.status === 'error') {
    return {
      status: 'error',
      userCode: '',
      verificationUrl: '',
      expiresAt: 0,
      account: null,
      error: auth.error || '認証に失敗しました。',
      recommendationSource: 'local',
    };
  }
  return {
    status: 'signed_out',
    userCode: '',
    verificationUrl: '',
    expiresAt: 0,
    account: null,
    error: '',
    recommendationSource: 'local',
  };
}

export { ACCOUNT_BROWSE_IDS, contexts };
