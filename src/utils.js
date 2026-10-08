/**
 * Small helpers shared by the server and the view layer.
 * Number / date formatting follows the Japanese YouTube UI
 * ("6.3万回視聴", "5 日前", "3:00:04", ...).
 */

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

/** Escape for use inside a JS string literal embedded in HTML. */
export const escJs = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, '\\n')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

export const attr = (name, value) =>
  value === undefined || value === null || value === false || value === ''
    ? ''
    : ` ${name}="${esc(value)}"`;

export const cls = (...parts) => parts.filter(Boolean).join(' ');

/** "1234567" -> "123万" / "1234" -> "1234" (Japanese abbreviation rules). */
export function formatViewCount(value) {
  const n = Number(String(value ?? '').replace(/[^\d]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 10000) return String(n);
  const man = n / 10000;
  if (man < 100) return `${(Math.floor(man * 10) / 10).toString().replace(/\.0$/, '')}万`;
  if (man < 10000) return `${Math.round(man)}万`;
  return `${Math.round(man / 10000)}億`;
}

export function formatShortCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (n < 1000) return String(n);
  if (n < 10000) return `${Math.floor(n / 1000)}千`;
  return formatViewCount(n);
}

/** seconds -> "12:34" / "1:02:03" */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "PT1H2M3S" -> 3723 */
export function parseIsoDuration(iso) {
  if (!iso) return 0;
  if (/^\d+$/.test(iso)) return Number(iso);
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(
    String(iso).replace(',', '.')
  );
  if (!m) return 0;
  return (
    Number(m[1] || 0) * 86400 +
    Number(m[2] || 0) * 3600 +
    Number(m[3] || 0) * 60 +
    Math.round(Number(m[4] || 0))
  );
}

/**
 * Render a relative date the way the Japanese YouTube UI does:
 * "5 日前", "20 時間前", "3 年前", "2 週間前"
 */
export function formatRelative(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min} 分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 時間前`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} 日前`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week} 週間前`;
  const month = Math.floor(day / 30.44);
  if (month < 12) return `${month} か月前`;
  const year = Math.floor(day / 365.25);
  return `${year} 年前`;
}

/** Full view string used on cards: "6.3万回視聴・5 日前" */
export function formatViewsAndDate({ viewCount, published, isLive, isUpcoming } = {}) {
  if (isLive) return 'ライブ配信中';
  if (isUpcoming) return `${formatRelative(published)}に配信予定`;
  const views = formatViewCount(viewCount);
  const rel = formatRelative(published);
  if (views && rel) return `${views}回視聴・${rel}`;
  if (views) return `${views}回視聴`;
  return rel;
}

export function absoluteDate(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate()
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export const toNumber = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function truncate(text, max = 100) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Best-effort plain text out of YouTube's text containers. */
export function runsToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map((r) => runsToText(r)).join('');
  if (typeof node !== 'object') return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (typeof node.content === 'string') return node.content;
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.runs)) return node.runs.map((r) => runsToText(r)).join('');
  return '';
}

/** Extract a browseId / videoId / canonical URL out of a navigation endpoint. */
export function endpointTarget(endpoint) {
  if (!endpoint) return null;
  const cmd =
    endpoint.browseEndpoint ||
    endpoint.watchEndpoint ||
    endpoint.urlEndpoint ||
    endpoint.signalEndpoint ||
    null;
  if (!cmd) return null;
  if (endpoint.browseEndpoint) {
    return {
      kind: 'browse',
      browseId: endpoint.browseEndpoint.browseId || '',
      params: endpoint.browseEndpoint.params || '',
      canonical: endpoint.browseEndpoint.canonicalBaseUrl || '',
    };
  }
  if (endpoint.watchEndpoint) {
    return { kind: 'watch', videoId: endpoint.watchEndpoint.videoId || '' };
  }
  if (endpoint.urlEndpoint) {
    return { kind: 'url', url: endpoint.urlEndpoint.url || '' };
  }
  return { kind: 'signal' };
}

/** Turn any YouTube navigation endpoint into a local site URL. */
export function endpointHref(endpoint) {
  const t = endpointTarget(endpoint);
  if (!t) return '';
  if (t.kind === 'watch' && t.videoId) return `/watch?v=${encodeURIComponent(t.videoId)}`;
  if (t.kind === 'url' && t.url) {
    try {
      const u = new URL(t.url, 'https://www.youtube.com');
      if (u.hostname.endsWith('youtube.com') || u.hostname === 'youtu.be') {
        if (u.pathname.startsWith('/watch')) {
          const v = u.searchParams.get('v');
          return v ? `/watch?v=${encodeURIComponent(v)}` : '/';
        }
        if (u.pathname.startsWith('/shorts/')) {
          return `/shorts/${encodeURIComponent(u.pathname.split('/')[2] || '')}`;
        }
        if (u.pathname.startsWith('/channel/')) {
          return `/channel/${encodeURIComponent(u.pathname.split('/')[2] || '')}`;
        }
        if (u.pathname.startsWith('/playlist')) {
          return `/playlist?list=${encodeURIComponent(u.searchParams.get('list') || '')}`;
        }
        if (u.pathname.startsWith('/feed/')) return u.pathname;
        if (u.pathname.startsWith('/@')) {
          return `/channel/${encodeURIComponent(u.pathname.slice(1))}`;
        }
      }
    } catch {
      /* ignore */
    }
    return '';
  }
  if (t.kind === 'browse' && t.browseId) {
    const map = {
      FEwhat_to_watch: '/',
      FEtrending: '/feed/trending',
      FEmusic: '/feed/music',
      FEgaming: '/feed/gaming',
      FEnews: '/feed/news',
      FEshorts: '/shorts',
      FEhistory: '/history',
      FEchannels: '/subscriptions',
      VLWL: '/watch-later',
      FEliked_videos: '/liked',
      FEsubscriptions: '/subscriptions',
    };
    if (map[t.browseId]) return map[t.browseId];
    if (t.browseId.startsWith('UC') || t.browseId.startsWith('UU')) {
      const base = `/channel/${encodeURIComponent(t.browseId)}`;
      return t.params ? `${base}?params=${encodeURIComponent(t.params)}` : base;
    }
    if (t.browseId.startsWith('VL')) {
      return `/playlist?list=${encodeURIComponent(t.browseId.slice(2))}`;
    }
    return `/browse/${encodeURIComponent(t.browseId)}${t.params ? `?params=${encodeURIComponent(t.params)}` : ''}`;
  }
  return '';
}
