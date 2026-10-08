/**
 * Stream URL resolution.
 *
 * The reference deployment asks awakest.net for direct media URLs and shows
 * "awakest.net からストリームURLを取得できませんでした。" when that fails. We keep
 * that provider (and its message) as the default, but add two more so the
 * feature still works elsewhere:
 *
 *   1. `awakest`   – awakest.net's YouTube tool (default, STREAM_PROVIDER=awakest)
 *   2. `innertube` – formats straight from the InnerTube player response
 *   3. `custom`    – any endpoint you point STREAM_API_URL at. Understands
 *                     Invidious/Piped style JSON, a bare JSON array of formats,
 *                     or an HTML page containing googlevideo URLs.
 *
 * Providers are tried in STREAM_PROVIDER_ORDER (comma separated).
 */
import { httpRequest } from '../http.js';
import { playerWithFallback } from '../youtube/innertube.js';
import { parseStreamingData } from '../youtube/parsers.js';
import { videoMetaById } from '../youtube/service.js';
import { config } from '../config.js';
import { TtlCache } from '../cache.js';

const cache = new TtlCache({ max: 500, ttlSeconds: 120 });

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const ORDER = (process.env.STREAM_PROVIDER_ORDER || `${config.streamProvider},innertube,custom`)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const GOOGLEVIDEO = /https:\/\/[^"'\s<>\\]*?googlevideo\.com\/videoplayback[^"'\s<>\\]*/g;

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/&quot;/g, '"');
}

function fromHtml(html) {
  const found = decodeEntities(html).match(GOOGLEVIDEO) || [];
  const seen = new Set();
  const urls = [];
  for (const u of found) {
    const clean = u.replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
    if (seen.has(clean)) continue;
    seen.add(clean);
    urls.push(clean);
  }
  return urls.map((url) => ({
    url,
    mimeType: /itag=(?:18|22|133|134|135|136|137|59|78)/.test(url) ? 'video/mp4' : '',
    quality: (/[?&]itag=(\d+)/.exec(url) || [])[1] || '',
    kind: /mime=audio/.test(url) ? 'audio' : 'video',
    expires: Number((/[?&]expire=(\d+)/.exec(url) || [])[1] || 0),
    bitrate: 0,
    fps: 0,
  }));
}

function fromInvidiousJson(json) {
  const out = [];
  const pushList = (list, kindHint) => {
    for (const f of list || []) {
      if (!f?.url) continue;
      out.push({
        url: f.url,
        mimeType: f.container ? `video/${f.container}` : f.mimeType || '',
        quality: f.qualityLabel || f.quality || f.resolution || kindHint,
        kind: kindHint,
        bitrate: Number(f.bitrate || 0),
        fps: Number(f.fps || 0),
        expires: Number((/[?&]expire=(\d+)/.exec(f.url) || [])[1] || 0),
        contentLength: Number(f.size || f.contentLength || 0),
        audioQuality: f.audioQuality || '',
      });
    }
  };
  pushList(json.formatStreams, 'muxed');
  pushList(json.adaptiveFormats, 'adaptive');
  pushList(json.dashUrl ? [] : [], 'adaptive');
  if (!out.length && Array.isArray(json)) pushList(json, 'adaptive');
  return out;
}

async function providerAwakest(videoId) {
  const base = config.awakestBase.replace(/\/$/, '');
  const targets = [
    `${base}/youtube/?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
    `${base}/youtube-video-downloader/?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
    `${base}/wp-json/awakest/v1/youtube?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
  ];
  for (const url of targets) {
    try {
      const res = await httpRequest(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/json', 'Accept-Language': 'ja' },
        timeoutMs: config.streamTimeoutMs,
      });
      if (!res.ok) continue;
      const text = res.text();
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          const formats = fromInvidiousJson(JSON.parse(text));
          if (formats.length) return { provider: 'awakest', formats };
        } catch {
          /* fall through to html scan */
        }
      }
      const formats = fromHtml(text);
      if (formats.length) return { provider: 'awakest', formats };
    } catch {
      /* try next target */
    }
  }
  const e = new Error('awakest.net からストリームURLを取得できませんでした。');
  e.code = 'awakest_failed';
  throw e;
}

async function providerInnertube(videoId) {
  const res = await playerWithFallback(videoId, { clients: ['tv', 'android', 'ios', 'web', 'tvSimply'] });
  const formats = parseStreamingData(res?.streamingData).filter((f) => f.url);
  if (!formats.length) {
    const e = new Error('YouTube からストリームURLを取得できませんでした（このサーバーのIPが制限されています）。');
    e.code = 'no_formats';
    throw e;
  }
  return { provider: 'innertube', formats };
}

async function providerCustom(videoId) {
  const template = process.env.STREAM_API_URL;
  if (!template) {
    const e = new Error('STREAM_API_URL が設定されていません。');
    e.code = 'no_custom_provider';
    throw e;
  }
  const url = template.replace('{id}', encodeURIComponent(videoId)).replace('{videoId}', encodeURIComponent(videoId));
  const res = await httpRequest(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json,text/html',
      ...(process.env.STREAM_API_HEADER ? { Authorization: process.env.STREAM_API_HEADER } : {}),
    },
    timeoutMs: config.streamTimeoutMs,
  });
  if (!res.ok) throw new Error(`ストリーム取得APIが ${res.status} を返しました。`);
  const text = res.text();
  let formats = [];
  try {
    formats = fromInvidiousJson(JSON.parse(text));
  } catch {
    formats = fromHtml(text);
  }
  if (!formats.length) throw new Error('ストリームURLを解析できませんでした。');
  return { provider: 'custom', formats };
}

const PROVIDERS = {
  awakest: providerAwakest,
  innertube: providerInnertube,
  custom: providerCustom,
};

/**
 * Resolve stream formats for a video, with caching and provider fallback.
 * @returns {Promise<{title:string, provider:string, formats:Array, degraded:boolean, error?:string}>}
 */
export async function streamInfo(videoId) {
  return cache.wrap(`stream:${videoId}`, 120, async () => {
    const meta = await videoMetaById(videoId).catch(() => null);
    const errors = [];
    for (const name of ORDER) {
      const fn = PROVIDERS[name];
      if (!fn) continue;
      try {
        const result = await fn(videoId);
        return {
          title: meta?.title || '',
          provider: result.provider,
          formats: result.formats,
          degraded: false,
        };
      } catch (e) {
        errors.push(e.message);
      }
    }
    return {
      title: meta?.title || '',
      provider: 'none',
      formats: [],
      degraded: true,
      error: errors[0] || 'ストリームURLを取得できませんでした。',
    };
  });
}

export { ORDER as STREAM_PROVIDER_ORDER, fromHtml, fromInvidiousJson };
