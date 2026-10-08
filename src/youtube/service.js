/**
 * High level YouTube data service: everything the routes need, with caching,
 * single-flight de-duplication and graceful degradation.
 *
 * Note on feeds: YouTube retired the public "trending" browse endpoints, so
 * the discovery feeds (home / trending / music / gaming / news) are backed by
 * region-scoped searches — the same trick the reference deployment uses. The
 * queries are configurable via env vars.
 */
import { browse, search, next, playerWithFallback, suggest, innertube } from './innertube.js';
import {
  parseItems,
  findContinuation,
  parseChannelHeader,
  parseChannelTabs,
  parseWatchResponse,
  parseComments,
  parseSearchFilters,
  parseStreamingData,
  buildEmbedUrls,
  proxiedImage,
} from './parsers.js';
import { httpRequest } from '../http.js';
import { TtlCache, SingleFlight } from '../cache.js';
import { config } from '../config.js';
import { formatDuration, formatViewCount, formatRelative } from '../utils.js';

const cache = new TtlCache({
  max: config.maxCacheEntries,
  ttlSeconds: config.cacheTtlSeconds,
});
const flight = new SingleFlight();

/** Feed definitions: label, search query, chip target. */
export const FEEDS = {
  home: { label: 'すべて', query: process.env.HOME_QUERY || '人気動画', title: 'ホーム' },
  trending: { label: '急上昇', query: process.env.TRENDING_QUERY || '急上昇', title: '急上昇' },
  music: { label: '音楽', query: process.env.MUSIC_QUERY || '音楽', title: '音楽' },
  gaming: { label: 'ゲーム', query: process.env.GAMING_QUERY || 'ゲーム', title: 'ゲーム' },
  news: { label: 'ニュース', query: process.env.NEWS_QUERY || 'ニュース', title: 'ニュース' },
};

/** Extra home chips (rendered as search links). */
export const HOME_CHIPS = (process.env.HOME_CHIPS || 'アニメ,料理,プログラミング,旅行')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Search filter presets (Innertube `params` values). */
/** Innertube `params` blobs (raw, not URL-encoded — they go into a JSON body). */
export const SEARCH_TYPES = {
  all: { label: 'すべて', params: '' },
  video: { label: '動画', params: 'EgIQAQ==' },
  channel: { label: 'チャンネル', params: 'EgIQAg==' },
  playlist: { label: '再生リスト', params: 'EgIQAw==' },
  movie: { label: '映画', params: 'EgIYARgCMAQ=' },
  shorts: { label: 'ショート', params: 'EgIYAQ==' },
};

const SORT_PARAMS = {
  relevance: '',
  rating: 'CAMSAhAB',
  date: 'CAI=',
  views: 'CAM=',
};


/** Resolve a @handle (or /channel/custom-url) to a UC… channel id. */
const handleCache = new Map();
export async function resolveChannelId(identifier) {
  if (/^UC[\w-]{20,}$/.test(identifier)) return identifier;
  if (handleCache.has(identifier)) return handleCache.get(identifier);
  const path = identifier.startsWith('@') ? identifier : identifier.startsWith('/') ? identifier : `/${identifier}`;
  try {
    const res = await httpRequest(`https://www.youtube.com/${path.replace(/^\//, '')}?hl=${config.hl}&gl=${config.gl}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36', 'Accept-Language': 'ja' },
      timeoutMs: 15000,
    });
    const html = res.ok ? res.text() : '';
    const m =
      /"externalId":"(UC[\w-]{20,})"/.exec(html) ||
      /"channelId":"(UC[\w-]{20,})"/.exec(html) ||
      /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{20,})"/.exec(html);
    if (m) {
      handleCache.set(identifier, m[1]);
      return m[1];
    }
  } catch {
    /* ignore */
  }
  return '';
}

/* ------------------------------------------------------------------ */

function normalizeItems(list) {
  return list.filter(Boolean).filter((v) => v.title || v.id);
}

/** Split a mixed result set into videos / channels / playlists / shorts. */
function bucket(items) {
  const out = { videos: [], shorts: [], channels: [], playlists: [], other: [] };
  for (const it of items) {
    if (it.type === 'channel') out.channels.push(it);
    else if (it.type === 'playlist') out.playlists.push(it);
    else if (it.isShort) out.shorts.push(it);
    else if (it.id) out.videos.push(it);
    else out.other.push(it);
  }
  return out;
}

async function searchRaw(query, params) {
  return search({ query, ...(params ? { params } : {}) });
}

function extractSearchPage(res) {
  const primary = res.contents?.twoColumnSearchResultsRenderer?.primaryContents;
  // First page: contents.twoColumnSearchResultsRenderer…
  // Continuations: onResponseReceivedCommands[].appendContinuationItemsAction
  const appended = (res.onResponseReceivedCommands || [])
    .flatMap((c) => c.appendContinuationItemsAction?.continuationItems || [])
    .concat((res.onResponseReceivedActions || []).flatMap((c) => c.appendContinuationItemsAction?.continuationItems || []));
  const sections = primary?.sectionListRenderer?.contents || appended;
  const items = [];
  for (const section of sections) {
    const contents = section.itemSectionRenderer?.contents || (section.richItemRenderer || section.lockupViewModel || section.videoRenderer ? [section] : []);
    for (const c of contents) items.push(...parseItems(c));
  }
  const shelves = sections
    .map((s) => s.shelfRenderer)
    .filter(Boolean)
    .map((s) => ({ title: s.title?.runs?.[0]?.text || s.title?.simpleText || '', items: parseItems(s.content) }));
  const shortsShelf = sections
    .map((s) => s.itemSectionRenderer?.contents?.[0]?.shelfRenderer)
    .filter(Boolean)
    .map((s) => ({ title: s.title?.runs?.[0]?.text || '', items: parseItems(s) }));
  return {
    items: normalizeItems(items),
    shelves,
    shortsShelf: shortsShelf.filter((s) => s.items.length),
    continuation: findContinuation({ contents: sections }) || findContinuation(res),
    filters: parseSearchFilters(res),
    estimatedResults: Number(res.estimatedResults || 0),
    header: res.header,
  };
}

/**
 * Discovery feed (home / trending / music / gaming / news).
 * @returns {Promise<{items:object[], shorts:object[], continuation:string, title:string, chips:object[]}>}
 */
export async function getFeed(kind, { token = '', chipToken = '', token2 = null } = {}) {
  const feed = FEEDS[kind] || FEEDS.home;
  const cacheKey = `feed:${kind}:${token || chipToken || 'first'}`;

  return flight.run(cacheKey, () =>
    cache.wrapSwr(
      cacheKey,
      config.feedCacheTtlSeconds,
      async () => {
        if (token) {
          const res = await search({ continuation: token });
          const page = extractSearchPage(res);
          const b = bucket(page.items);
          return {
            items: b.videos.length ? b.videos : b.playlists,
            shorts: b.shorts,
            channels: b.channels,
            playlists: b.playlists,
            continuation: page.continuation,
            title: feed.title,
          };
        }
        const [main, shelf] = await Promise.all([
          searchRaw(feed.query, SEARCH_TYPES.video.params),
          kind === 'home' ? searchRaw(feed.query, '').catch(() => null) : Promise.resolve(null),
        ]);
        const page = extractSearchPage(main);
        const b = bucket(page.items);
        const shelfItems = shelf ? bucket(extractSearchPage(shelf).items).shorts : [];
        return {
          items: b.videos.length ? b.videos : b.playlists,
          shorts: shelfItems,
          channels: b.channels,
          playlists: b.playlists,
          continuation: page.continuation,
          title: feed.title,
        };
      },
      { staleSeconds: 6 * 3600 }
    )
  );
}

/** Full search page. */
export async function searchPage(query, { type = 'all', sort = '', token = '', params = '' } = {}) {
  const effectiveParams = params || SEARCH_TYPES[type]?.params || SORT_PARAMS[sort] || '';
  const cacheKey = `search:${query}:${effectiveParams}:${token || 'first'}`;

  return flight.run(cacheKey, () =>
    cache.wrapSwr(
      cacheKey,
      config.feedCacheTtlSeconds,
      async () => {
        const res = token
          ? await search({ continuation: token })
          : await searchRaw(query, effectiveParams);
        const page = extractSearchPage(res);
        const b = bucket(page.items);
        return {
          query,
          type,
          params: effectiveParams,
          videos: b.videos,
          shorts: b.shorts,
          channels: b.channels,
          playlists: b.playlists,
          shelves: page.shelves,
          continuation: page.continuation,
          estimatedResults: page.estimatedResults,
          filters: page.filters,
        };
      },
      { staleSeconds: 3600 }
    )
  );
}

/** Channel page (by UC id or @handle). */
export async function channelPage(identifier, { params = '', token = '' } = {}) {
  const cacheKey = `channel:${identifier}:${params}:${token || 'first'}`;
  return flight.run(cacheKey, () =>
    cache.wrapSwr(
      cacheKey,
      config.cacheTtlSeconds,
      async () => {
        if (token) {
          const res = await browse({ continuation: token });
          return {
            identifier,
            header: null,
            tabs: [],
            items: normalizeItems(parseItems(res)),
            continuation: findContinuation(res),
            isContinuation: true,
          };
        }
        // @handle / custom URLs must be resolved to a UC… id first.
        const browseId = identifier.startsWith('UC') || identifier.startsWith('UU')
          ? identifier
          : await resolveChannelId(identifier);
        if (!browseId) {
          const e = new Error('チャンネルが見つかりませんでした。');
          e.status = 404;
          throw e;
        }
        const res = await browse({ browseId, ...(params ? { params } : {}) });
        const header = parseChannelHeader(res);
        const tabs = parseChannelTabs(res);
        const selected = tabs.find((t) => t.selected) || tabs[0];
        const items = selected?.content ? normalizeItems(parseItems(selected.content)) : normalizeItems(parseItems(res));
        return {
          identifier,
          header: { ...header, channelId: header.channelId || (identifier.startsWith('UC') ? identifier : header.channelId) },
          resolvedId: identifier.startsWith('UC') ? identifier : (header.channelId || ''),
          tabs,
          items,
          shorts: items.filter((i) => i.isShort),
          continuation: selected?.content ? findContinuation(selected.content) : findContinuation(res),
          isContinuation: false,
          subscribeToken: findFirstSubscribeToken(res),
        };
      },
      { staleSeconds: 3600 }
    )
  );
}

function findFirstSubscribeToken(res) {
  const btn = findFirstKey(res, ['subscribeButtonRenderer'], 10);
  return btn?.subscribeButtonRenderer?.subscribedButtonText ? true : false;
}

function findFirstKey(node, keys, depth = 8) {
  if (!node || depth < 0) return null;
  if (Array.isArray(node)) {
    for (const it of node) {
      const r = findFirstKey(it, keys, depth - 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  for (const k of keys) if (node[k]) return { [k]: node[k] };
  for (const v of Object.values(node)) {
    const r = findFirstKey(v, keys, depth - 1);
    if (r) return r;
  }
  return null;
}

/** Playlist page (VL… or plain list id). */
export async function playlistPage(listId, { token = '' } = {}) {
  const browseId = listId.startsWith('VL') ? listId : `VL${listId}`;
  const res = token ? await browse({ continuation: token }) : await browse({ browseId });
  const header = parseChannelHeader(res);
  return {
    listId,
    header,
    items: normalizeItems(parseItems(res)),
    continuation: findContinuation(res),
  };
}

/** Watch page: `next` for metadata/related + `player` for details. */
export async function watchPage(videoId, { playlist = '', index = '' } = {}) {
  const cacheKey = `watch:${videoId}:${playlist}:${index}`;
  return flight.run(cacheKey, () =>
    cache.wrapSwr(
      cacheKey,
      Math.min(config.cacheTtlSeconds, 240),
      async () => {
        const params = { videoId };
        if (playlist) params.playlistId = playlist;
        if (index !== '') params.index = Number(index);

        const [nextRes, playerRes] = await Promise.allSettled([
          next(params),
          playerWithFallback(videoId, { metadataOnly: true }),
        ]);

        const nextOk = nextRes.status === 'fulfilled' ? nextRes.value : null;
        const playerOk = playerRes.status === 'fulfilled' ? playerRes.value : null;
        const combined = nextOk ? { ...nextOk, playerResponse: nextOk.playerResponse || playerOk } : null;

        let watch = combined ? parseWatchResponse(combined) : null;

        if (!watch || !watch.title) {
          // Fall back to whatever the player response knows.
          const details = playerOk?.videoDetails;
          const micro = playerOk?.microformat?.playerMicroformatRenderer;
          if (!details && !micro) {
            const err = new Error('YouTube側でこのサーバーからの通信が制限されています。時間をおいて再試行してください。');
            err.code = 'blocked';
            throw err;
          }
          watch = {
            title: details?.title || '',
            views: details?.viewCount ? `${formatViewCount(details.viewCount)}回視聴` : '',
            dateText: micro?.publishDate || '',
            likeCount: '',
            channel: {
              id: details?.channelId || micro?.externalChannelId || '',
              title: details?.author || micro?.ownerChannelName || '',
              handle: (micro?.ownerProfileUrl || '').split('/').pop(),
              avatar: proxiedImage(micro?.thumbnail?.thumbnails?.[0]?.url || ''),
              subscribers: '',
            },
            description: details?.shortDescription || micro?.description?.simpleText || '',
            keywords: details?.keywords || [],
            lengthSeconds: Number(details?.lengthSeconds || 0),
            isLive: false,
            isLiveNow: false,
            related: [],
            relatedContinuation: '',
            commentsToken: '',
            autoplayNext: null,
            liveChatId: '',
          };
        }

        const streaming = parseStreamingData(playerOk?.streamingData || combined?.streamingData || {});
        const thumbnails =
          playerOk?.videoDetails?.thumbnail?.thumbnails ||
          combined?.playerResponse?.videoDetails?.thumbnail?.thumbnails ||
          [];

        return {
          videoId,
          ...watch,
          thumbnail: proxiedImage(thumbnails[thumbnails.length - 1]?.url || ''),
          durationText: formatDuration(watch.lengthSeconds),
          lengthSeconds: watch.lengthSeconds,
          formats: streaming,
          embeds: buildEmbedUrls(videoId),
          playerClient: playerOk?._client || '',
          degraded: !streaming.length,
          published: microDate(combined, playerOk),
        };
      },
      { staleSeconds: 1800 }
    )
  );
}

function microDate(nextRes, playerRes) {
  const micro =
    playerRes?.microformat?.playerMicroformatRenderer ||
    nextRes?.playerResponse?.microformat?.playerMicroformatRenderer;
  return micro?.publishDate || micro?.uploadDate || '';
}

/** Related videos continuation ("もっと見る" in the watch sidebar). */
export async function relatedNext(token) {
  const res = await next({ continuation: token });
  return {
    items: normalizeItems(parseItems(res)),
    continuation: findContinuation(res),
  };
}

/** Comments for a video. sort: top | new */
export async function commentsFor(videoId, { sort = 'top', token = '' } = {}) {
  const params = token ? { continuation: token } : { videoId };
  if (!token) {
    // Ask for the comment section directly via next, then follow its token.
    const res = await next(params);
    const parsed = parseComments(res);
    const sectionToken =
      parsed.continuation ||
      findCommentsToken(res, sort) ||
      '';
    if (!parsed.comments.length && sectionToken) {
      const res2 = await next({ continuation: sectionToken });
      const parsed2 = parseComments(res2);
      return {
        ...parsed2,
        videoId,
        sort,
        sortToken: sort === 'new' ? findSortToken(res, 'new') : '',
      };
    }
    return { ...parsed, videoId, sort, sortToken: findSortToken(res, 'new') };
  }
  const res = await next(params);
  const parsed = parseComments(res);
  return { ...parsed, videoId, sort };
}

function findCommentsToken(res, sort) {
  const menus = [];
  const walk = (node, depth = 0) => {
    if (!node || depth > 14 || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    if (node.sortFilterSubMenuRenderer) menus.push(node.sortFilterSubMenuRenderer);
    for (const v of Object.values(node)) walk(v, depth + 1);
  };
  walk(res);
  for (const menu of menus) {
    for (const item of menu.subMenuItems || []) {
      const title = item.title || '';
      const isTop = /上位/.test(title);
      const isNew = /新着/.test(title);
      const tok = item.serviceEndpoint?.continuationCommand?.token;
      if (!tok) continue;
      if (sort === 'new' && isNew) return tok;
      if (sort !== 'new' && isTop) return tok;
    }
  }
  return findContinuation(res) || '';
}

function findSortToken(res, sort) {
  const menus = [];
  const walk = (node, depth = 0) => {
    if (!node || depth > 14 || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    if (node.sortFilterSubMenuRenderer) menus.push(node.sortFilterSubMenuRenderer);
    for (const v of Object.values(node)) walk(v, depth + 1);
  };
  walk(res);
  for (const menu of menus) {
    for (const item of menu.subMenuItems || []) {
      if ((sort === 'new' && /新着/.test(item.title || '')) || (sort !== 'new' && /上位/.test(item.title || ''))) {
        return item.serviceEndpoint?.continuationCommand?.token || '';
      }
    }
  }
  return '';
}

/** Comment replies continuation. */
export async function commentReplies(token) {
  const res = await next({ continuation: token });
  return parseComments(res);
}

/** Shorts feed (uses the shorts shelf from search, or a browse fallback). */
export async function shortsFeed({ token = '' } = {}) {
  if (token) {
    try {
      const res = await innertube('browse', { continuation: token });
      return { videos: normalizeItems(parseItems(res)).map(toShort), continuation: findContinuation(res) };
    } catch {
      return { videos: [], continuation: '' };
    }
  }
  const cacheKey = 'shorts:feed';
  return cache.wrapSwr(
    cacheKey,
    config.feedCacheTtlSeconds,
    async () => {
      const queries = (process.env.SHORTS_QUERIES || '人気動画,急上昇,面白動画,ショート')
        .split(',')
        .map((q) => q.trim())
        .filter(Boolean);
      const results = await Promise.allSettled(queries.map((q) => searchRaw(q, '')));
      const seen = new Set();
      const shorts = [];
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const b = bucket(extractSearchPage(r.value).items);
        for (const item of b.shorts) {
          if (!item.id || seen.has(item.id)) continue;
          seen.add(item.id);
          shorts.push(toShort(item));
        }
      }
      return { videos: shorts.slice(0, 60), continuation: '' };
    },
    { staleSeconds: 3600 }
  );
}

function toShort(item) {
  return {
    ...item,
    href: `/shorts/${encodeURIComponent(item.id)}`,
    isShort: true,
    type: 'short',
  };
}

/**
 * Metadata for a single video id. Tries the player endpoint first (which also
 * yields thumbnails/length) and falls back to `next`, which keeps working even
 * when YouTube refuses player requests from cloud IPs.
 */
export async function videoMetaById(id) {
  if (!id) return null;

  const fromPlayer = await playerWithFallback(id, {
    metadataOnly: true,
    clients: ['tv', 'web', 'android', 'ios'],
  }).catch(() => null);

  const details = fromPlayer?.videoDetails;
  const micro = fromPlayer?.microformat?.playerMicroformatRenderer;

  if (details?.title) {
    const thumbs = details.thumbnail?.thumbnails || micro?.thumbnail?.thumbnails || [];
    return {
      id,
      title: details.title,
      author: details.author || micro?.ownerChannelName || 'チャンネル不明',
      authorId: details.channelId || micro?.externalChannelId || '',
      authorThumbnail: proxiedImage(micro?.thumbnail?.thumbnails?.[0]?.url || ''),
      thumbnail: proxiedImage(
        thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      ),
      duration: formatDuration(Number(details.lengthSeconds || micro?.lengthSeconds || 0)),
      views: details.viewCount ? `${formatViewCount(details.viewCount)}回視聴` : '',
      published: micro?.publishDate ? formatRelative(micro.publishDate) : '',
      description: details.shortDescription || '',
    };
  }

  const viaNext = await next({ videoId: id }).catch(() => null);
  if (viaNext) {
    const parsed = parseWatchResponse(viaNext);
    if (parsed.title) {
      return {
        id,
        title: parsed.title,
        author: parsed.channel?.title || 'チャンネル不明',
        authorId: parsed.channel?.id || '',
        authorThumbnail: parsed.channel?.avatar || '',
        thumbnail: `/image-proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${id}/hq720.jpg`)}`,
        duration: parsed.lengthSeconds ? formatDuration(parsed.lengthSeconds) : '',
        views: parsed.views || '',
        published: parsed.dateText ? formatRelative(parsed.dateText) : '',
        description: parsed.description || '',
      };
    }
  }

  return null;
}

/** Stub card used when YouTube gives us nothing at all (matches the UI shape). */
export function videoStub(id) {
  return {
    id,
    title: `動画 (${id})`,
    author: 'チャンネル不明',
    authorId: '',
    authorThumbnail: '',
    thumbnail: `/image-proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}`,
    duration: '',
    views: '',
    published: '',
    description: '',
  };
}

/** Batch metadata lookup used by the client queue / recommendations. */
export async function videosByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))].slice(0, 40);
  return Promise.all(
    unique.map((id) =>
      cache
        .wrap(`video:${id}`, config.videoCacheTtlSeconds, () => videoMetaById(id))
        .then((v) => v || videoStub(id))
        .catch(() => videoStub(id))
    )
  );
}

/** Search autocomplete. */
export async function suggestions(query) {
  if (!query) return [];
  return cache.wrap(`suggest:${query}`, config.suggestionsTtlSeconds, () => suggest(query));
}

/** Single video card data (used by watch page hydration and the queue). */
export async function videoCard(videoId) {
  const [v] = await videosByIds([videoId]);
  return v;
}

export { cache, bucket, normalizeItems, extractSearchPage };
