/**
 * Minimal YouTube InnerTube client built on our own HTTP layer (proxy aware).
 *
 * Contexts (WEB / TVHTML5 / ANDROID / IOS) are refreshed from youtube.com at
 * boot so client versions never go stale, and the TV OAuth client id/secret is
 * scraped from the TV bootstrap page exactly like the TV app does.
 */
import { httpRequest, jsonRequest, setDefaultProxy } from '../http.js';
import { config } from '../config.js';
import { sleep } from '../utils.js';

const YT = 'https://www.youtube.com';
const OAUTH = 'https://www.youtube.com/o/oauth2';
const DEFAULT_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

const UA = {
  web: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  mweb: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  tv: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
  android:
    'com.google.android.youtube/19.29.37 (Linux; U; Android 14; en_US; Pixel 8 Build/UQ1A.240205.004) gzip',
  ios: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)',
};

const CLIENT_NAME_ID = { web: 1, mweb: 2, android: 3, ios: 5, tv: 7, tvSimply: 85 };

if (config.proxy) setDefaultProxy(config.proxy);

export const contexts = {
  apiKey: DEFAULT_API_KEY,
  web: { clientName: 'WEB', clientVersion: '2.20260101.00.00' },
  mweb: { clientName: 'MWEB', clientVersion: '2.20260101.00.00' },
  tv: { clientName: 'TVHTML5', clientVersion: '7.20261006.13.00' },
  tvSimply: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0' },
  android: { clientName: 'ANDROID', clientVersion: '19.29.37' },
  ios: { clientName: 'IOS', clientVersion: '19.29.1' },
};

export const oauthClient = { clientId: '', clientSecret: '' };

function body(clientKey, payload, clientContext = {}) {
  const c = contexts[clientKey] || contexts.web;
  return {
    context: {
      client: { clientName: c.clientName, clientVersion: c.clientVersion, hl: config.hl, gl: config.gl, ...clientContext },
      user: { lockedSafetyMode: false },
    },
    ...payload,
  };
}

let contextsReady = false;
let contextsPromise = null;

/** Scrape fresh client versions + TV OAuth credentials (idempotent). */
export function refreshContexts(force = false) {
  if (contextsReady && !force) return Promise.resolve({ contexts, oauthClient });
  if (contextsPromise && !force) return contextsPromise;

  contextsPromise = (async () => {
    await Promise.allSettled([
      (async () => {
        const res = await httpRequest(`${YT}/?hl=${config.hl}&gl=${config.gl}`, {
          headers: { 'User-Agent': UA.web, 'Accept-Language': 'ja' },
          timeoutMs: 20000,
        });
        const html = res.text();
        const ver = /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/.exec(html);
        const key = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html);
        if (ver) {
          contexts.web.clientVersion = ver[1];
          contexts.mweb.clientVersion = ver[1];
        }
        if (key) contexts.apiKey = key[1];
      })(),
      (async () => {
        const res = await httpRequest(`${YT}/tv?oauth`, {
          headers: { 'User-Agent': UA.tv, 'Accept-Language': 'ja' },
          timeoutMs: 20000,
        });
        const html = res.text();
        const ver = /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/.exec(html);
        if (ver) contexts.tv.clientVersion = ver[1];
        const pairs = [...html.matchAll(/clientId:"(861556708454-[^"]+)",F:"([^"]+)"/g)].map((m) => ({
          clientId: m[1],
          clientSecret: m[2],
        }));
        const preferred =
          pairs.find((p) => p.clientId.includes('d6dlm3lh05idd8npek18k6be8ba3oc68')) || pairs[0];
        if (preferred) {
          oauthClient.clientId = config.oauthClientId || preferred.clientId;
          oauthClient.clientSecret = config.oauthClientSecret || preferred.clientSecret;
        }
      })(),
    ]);
    contextsReady = true;
    contextsPromise = null;
    return { contexts, oauthClient };
  })();

  return contextsPromise;
}

/** Generic InnerTube call. */
export async function innertube(endpoint, payload = {}, opts = {}) {
  const {
    client = 'web',
    apiKey = contexts.apiKey,
    token = null,
    timeoutMs = 20000,
    clientContext = {},
    extraHeaders = {},
  } = opts;

  await refreshContexts();

  const headers = {
    'User-Agent': UA[client] || UA.web,
    'Accept-Language': 'ja,en;q=0.8',
    'X-YouTube-Client-Name': String(CLIENT_NAME_ID[client] ?? 1),
    'X-YouTube-Client-Version': contexts[client]?.clientVersion || contexts.web.clientVersion,
    ...extraHeaders,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-Goog-AuthUser'] = '0';
  }

  const res = await jsonRequest(
    `${YT}/youtubei/v1/${endpoint}?prettyPrint=false&key=${apiKey}`,
    body(client, payload, clientContext),
    { headers, timeoutMs }
  );

  if (!res.ok) {
    const err = new Error(`InnerTube ${endpoint} -> ${res.status}`);
    err.status = res.status;
    throw err;
  }
  let json;
  try {
    json = res.json();
  } catch (e) {
    const err = new Error(`InnerTube ${endpoint} -> invalid JSON`);
    err.cause = e;
    throw err;
  }
  return json;
}

export const browse = (params, opts = {}) => innertube('browse', params, opts);
export const search = (params, opts = {}) => innertube('search', params, opts);
export const next = (params, opts = {}) => innertube('next', params, opts);
export const player = (params, opts = {}) => innertube('player', params, opts);
export const guide = (params, opts = {}) => innertube('guide', params, opts);

/**
 * Player request with client fallback. Metadata is returned even when YouTube
 * refuses to hand out stream URLs (the usual data-centre-IP case).
 */
export async function playerWithFallback(videoId, opts = {}) {
  const order = opts.clients || ['tv', 'web', 'android', 'ios', 'tvSimply'];
  let best = null;
  let lastError = null;

  for (const client of order) {
    try {
      const res = await player(
        { videoId, contentCheckOk: true, racyCheckOk: true, ...(opts.params || {}) },
        { ...opts, client }
      );
      const status = res?.playabilityStatus?.status;
      const hasFormats = !!res?.streamingData?.formats || !!res?.streamingData?.adaptiveFormats;
      if (hasFormats && status !== 'ERROR') return { ...res, _client: client };
      if (!best && res?.videoDetails) best = { ...res, _client: client, _noFormats: true };
      if (status !== 'ERROR' && status !== 'LOGIN_REQUIRED' && res?.videoDetails) {
        best = { ...res, _client: client, _noFormats: !hasFormats };
      }
    } catch (e) {
      lastError = e;
      await sleep(120);
    }
  }
  if (best) return best;
  if (lastError) throw lastError;
  const err = new Error('動画情報を取得できませんでした。');
  err.code = 'no_player_response';
  throw err;
}

/** Search autocomplete (public suggest service, JSONP-ish payload). */
export async function suggest(query, opts = {}) {
  const url =
    `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt` +
    `&hl=${encodeURIComponent(config.hl)}&gl=${encodeURIComponent(config.gl)}&q=${encodeURIComponent(query)}`;
  const res = await httpRequest(url, {
    headers: { 'User-Agent': UA.web, 'Accept-Language': 'ja' },
    timeoutMs: opts.timeoutMs || 8000,
  });
  if (!res.ok) return [];
  const text = res.text();
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start < 0 || end < 0) return [];
  try {
    const data = JSON.parse(text.slice(start + 1, end));
    const items = Array.isArray(data?.[1]) ? data[1] : [];
    return items
      .map((it) => (Array.isArray(it) ? String(it[0] ?? '') : String(it ?? '')))
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    return [];
  }
}

/* ---------------- TV device authorization flow ---------------- */

export async function startDeviceAuth() {
  await refreshContexts();
  if (!oauthClient.clientId) throw new Error('OAuthクライアントを取得できませんでした。');
  const form = new URLSearchParams({
    client_id: oauthClient.clientId,
    scope: config.oauthScope,
    device: 'ytlr',
    model_name: 'cobalt',
  });
  const res = await httpRequest(`${OAUTH}/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA.tv },
    body: form.toString(),
    timeoutMs: 20000,
  });
  const json = res.ok ? res.json() : null;
  if (!json?.device_code) {
    throw new Error(json?.error_description || json?.error || 'デバイス認証を開始できませんでした。');
  }
  return {
    deviceCode: json.device_code,
    userCode: json.user_code,
    verificationUrl: json.verification_url || 'https://www.youtube.com/activate',
    expiresIn: Number(json.expires_in || 1800),
    interval: Number(json.interval || 5),
  };
}

/** @returns {Promise<{tokens}|{pending:true}|{slowDown:true}>} */
export async function pollDeviceToken(deviceCode) {
  await refreshContexts();
  const form = new URLSearchParams({
    client_id: oauthClient.clientId,
    client_secret: oauthClient.clientSecret,
    code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });
  const res = await httpRequest(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA.tv },
    body: form.toString(),
    timeoutMs: 20000,
  });
  const json = res.ok ? res.json() : null;
  if (!json) throw new Error('トークン応答を解析できませんでした。');
  if (json.error === 'authorization_pending') return { pending: true };
  if (json.error === 'slow_down') return { slowDown: true };
  if (json.error === 'expired_token' || json.error === 'access_denied') {
    const e = new Error(
      json.error === 'expired_token' ? '認証コードの有効期限が切れました。' : '認証が拒否されました。'
    );
    e.code = json.error;
    throw e;
  }
  if (!json.access_token) {
    const e = new Error(json.error_description || '認証に失敗しました。');
    e.code = json.error || 'unknown';
    throw e;
  }
  return {
    tokens: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || '',
      expiresIn: Number(json.expires_in || 3600),
      scope: json.scope || '',
    },
  };
}

export async function refreshAccessToken(refreshToken) {
  await refreshContexts();
  const form = new URLSearchParams({
    client_id: oauthClient.clientId,
    client_secret: oauthClient.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await httpRequest(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA.tv },
    body: form.toString(),
    timeoutMs: 20000,
  });
  const json = res.ok ? res.json() : null;
  if (!json?.access_token) {
    const e = new Error(json?.error_description || json?.error || 'トークンを更新できませんでした。');
    e.code = json?.error || 'invalid_grant';
    throw e;
  }
  return {
    accessToken: json.access_token,
    expiresIn: Number(json.expires_in || 3600),
    refreshToken,
  };
}

/** Account header: display name, handle, avatar, channel id. */
export async function getAccountMenu(token) {
  return innertube('account/account_menu', {}, { client: 'tv', token, timeoutMs: 20000 });
}

/** Visitor data (helps some browse responses) for the WEB client. */
export async function getVisitorData() {
  const res = await httpRequest(`${YT}/?hl=${config.hl}&gl=${config.gl}`, {
    headers: { 'User-Agent': UA.web },
    timeoutMs: 15000,
  }).catch(() => null);
  if (!res?.ok) return '';
  const m = /"VISITOR_DATA":"([^"]+)"/.exec(res.text());
  return m ? m[1] : '';
}
