/**
 * Normalisers for InnerTube responses.
 *
 * YouTube ships two generations of payload shapes at the same time:
 *   - classic renderers  (videoRenderer, gridVideoRenderer, ...)
 *   - the newer "ViewModel" payloads (lockupViewModel, shortsLockupViewModel,
 *     commentEntityPayload, pageHeaderRenderer, ...)
 * Every helper below accepts either and returns one flat, easy-to-render
 * object so the view layer never has to know about InnerTube internals.
 */
import { runsToText, parseIsoDuration, formatDuration, endpointHref, endpointTarget } from '../utils.js';
import { config } from '../config.js';

/* ------------------------------------------------------------------ *
 * generic traversal helpers
 * ------------------------------------------------------------------ */

const RENDERER_KEYS = [
  'videoRenderer',
  'gridVideoRenderer',
  'compactVideoRenderer',
  'playlistVideoRenderer',
  'richItemRenderer',
  'lockupViewModel',
  'shortsLockupViewModel',
  'reelItemRenderer',
  'channelRenderer',
  'channelViewModel',
  'playlistRenderer',
  'radioRenderer',
  'shelfRenderer',
  'itemSectionRenderer',
  'continuationItemRenderer',
  'movieRenderer',
  'videoWithContextRenderer',
];

/** First value found for any of the given keys, depth-first. */
export function findFirst(node, keys, depth = 12) {
  if (!node || depth < 0) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = findFirst(item, keys, depth - 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if (typeof node !== 'object') return undefined;
  for (const key of keys) if (node[key] !== undefined) return node[key];
  for (const value of Object.values(node)) {
    const r = findFirst(value, keys, depth - 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

/** Collect every object that has one of the given keys. */
export function collectAll(node, keys, out = [], depth = 14) {
  if (!node || depth < 0 || out.length > 600) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectAll(item, keys, out, depth - 1);
    return out;
  }
  if (typeof node !== 'object') return out;
  for (const key of keys) {
    if (node[key] && typeof node[key] === 'object') out.push({ key, value: node[key] });
  }
  for (const value of Object.values(node)) collectAll(value, keys, out, depth - 1);
  return out;
}

/** Proxy a remote thumbnail through /image-proxy (same behaviour as the UI). */
export function proxiedImage(url) {
  if (!url) return '';
  const u = String(url);
  if (u.startsWith('/')) return u;
  if (u.startsWith('data:')) return u;
  return `/image-proxy?url=${encodeURIComponent(u)}`;
}

export function bestThumbnail(thumbs, prefer = 'high') {
  const list = Array.isArray(thumbs) ? thumbs : [];
  if (!list.length) return '';
  const order =
    prefer === 'low'
      ? [0, Math.floor(list.length / 2), list.length - 1]
      : [list.length - 1, Math.floor(list.length / 2), 0];
  for (const i of order) if (list[i]?.url) return proxiedImage(list[i].url);
  return proxiedImage(list[list.length - 1].url);
}

function thumbnailFromRenderer(r) {
  if (r.thumbnail?.thumbnails) return bestThumbnail(r.thumbnail.thumbnails);
  if (r.thumbnails) return bestThumbnail(r.thumbnails);
  const src = findFirst(r, ['sources'], 4);
  if (Array.isArray(src) && src[0]?.url) return bestThumbnail(src);
  return '';
}

function authorFromRenderer(r) {
  const byline =
    r.ownerText || r.shortBylineText || r.longBylineText || r.attributedBylineText || null;
  const runs = byline?.runs || (byline?.content ? [{ text: byline.content }] : null);
  const name = runsToText(runs);
  const run = (runs || [])[0];
  const target = endpointTarget(run?.navigationEndpoint || byline?.navigationEndpoint);
  let channelId = '';
  let handle = '';
  if (target?.browseId && /^UC/.test(target.browseId)) channelId = target.browseId;
  if (target?.canonical) handle = target.canonical.replace(/^\//, '');
  const avatar =
    bestThumbnail(r.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails || []) ||
    bestThumbnail(r.ownerBadges ? [] : []) ||
    proxiedImage(findFirst(r.channelThumbnailWithLinkRenderer || {}, ['url'], 4) || '') ||
    '';
  return { author: name, authorId: channelId, handle, authorThumbnail: avatar };
}

function durationSecondsFrom(r) {
  if (r.lengthSeconds) return Number(r.lengthSeconds);
  const text = runsToText(r.lengthText) || findFirst(r, ['text'], 3);
  if (typeof text === 'string' && /^\d+:/.test(text)) {
    return text
      .split(':')
      .reduce((acc, part) => acc * 60 + Number(part || 0), 0);
  }
  return 0;
}

function viewCountFrom(r) {
  const raw =
    runsToText(r.viewCountText) ||
    r.viewCountText?.simpleText ||
    runsToText(r.shortViewCountText) ||
    r.viewCountText?.runs?.[0]?.text ||
    '';
  const m = /([\d,.]+)\s*(万|億|千)?/.exec(raw.replace(/,/g, ''));
  if (!m) return 0;
  let n = Number(m[1]);
  if (m[2] === '万') n *= 10000;
  else if (m[2] === '億') n *= 100000000;
  else if (m[2] === '千') n *= 1000;
  return Number.isFinite(n) ? n : 0;
}

function badgesOf(r) {
  const out = [];
  for (const b of r.badges || []) {
    const label =
      b.metadataBadgeRenderer?.label ||
      b.metadataBadgeRenderer?.style ||
      b.thumbnailBadgeViewModel?.text ||
      '';
    if (label) out.push(String(label));
  }
  for (const o of r.thumbnailOverlays || []) {
    const t = o.thumbnailOverlayTimeStatusRenderer?.text;
    if (t) out.push(runsToText(t));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * lockupViewModel (current format)
 * ------------------------------------------------------------------ */

function parseLockup(l) {
  const meta = l.metadata?.lockupMetadataViewModel || {};
  const title = meta.title?.content || '';
  const rows = meta.metadata?.contentMetadataViewModel?.metadataRows || [];
  const parts = rows.flatMap((row) => (row.metadataParts || []).map((p) => p.text?.content || ''));

  const thumbnailVm =
    l.contentImage?.thumbnailViewModel ||
    l.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel ||
    null;
  const image = bestThumbnail(thumbnailVm?.image?.sources);
  const badgeText =
    findFirst(thumbnailVm?.overlays || [], ['thumbnailBadgeViewModel'], 5)?.text ||
    findFirst(thumbnailVm?.overlays || [], ['text'], 6) ||
    '';

  const onTapCommand =
    l.rendererContext?.commandContext?.onTap?.innertubeCommand ||
    l.contentImage?.thumbnailViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand ||
    l.onTap?.innertubeCommand ||
    null;
  const watchEndpoint = findFirst(onTapCommand || {}, ['watchEndpoint'], 4);
  const browseEndpoint = findFirst(onTapCommand || {}, ['browseEndpoint'], 4);
  const webUrl = onTapCommand?.commandMetadata?.webCommandMetadata?.url || '';

  const contentType = String(l.contentType || '');
  const isPlaylist = contentType.includes('PLAYLIST') || contentType.includes('PODCAST');
  const isChannel = contentType.includes('CHANNEL');
  const isShortType = /SHORT|REEL/i.test(contentType);

  let videoId = l.contentId || watchEndpoint?.videoId || '';
  if (!videoId && /^\/shorts\//.test(webUrl)) videoId = webUrl.split('/')[2] || '';
  if (!videoId && /^\/watch\?/.test(webUrl)) {
    videoId = new URL(`https://x${webUrl}`).searchParams.get('v') || '';
  }

  const viewsRaw = parts.find((p) => /回視聴|views?|視聴/i.test(p)) || '';
  const dateRaw = parts.find((p) => /(前|これから|配信予定|ストリーム)/.test(p) && p !== viewsRaw) || '';
  const authorRaw = parts.find((p) => p && p !== viewsRaw && p !== dateRaw) || '';

  const avatar =
    bestThumbnail(
      meta.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources || []
    ) || '';
  const channelEndpoint = endpointTarget(
    meta.image?.decoratedAvatarViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand
  );

  const playlistId = isPlaylist ? String(l.contentId || '').replace(/^VL/, '') : '';
  const href = isChannel
    ? `/channel/${encodeURIComponent(l.contentId || (browseEndpoint?.browseId ?? ''))}`
    : isPlaylist
      ? `/playlist?list=${encodeURIComponent(playlistId)}`
      : videoId
        ? `/watch?v=${encodeURIComponent(videoId)}`
        : endpointHref(onTapCommand);

  const seconds = badgeText && /^[\d:]+$/.test(badgeText)
    ? badgeText.split(':').reduce((a, p) => a * 60 + Number(p || 0), 0)
    : 0;

  return {
    id: isPlaylist ? playlistId : videoId || l.contentId || '',
    type: isPlaylist ? 'playlist' : isChannel ? 'channel' : isShortType ? 'short' : 'video',
    title,
    thumbnail: image,
    duration: seconds ? formatDuration(seconds) : '',
    durationSeconds: seconds,
    views: viewsRaw,
    viewCount: viewCountFrom({ viewCountText: { simpleText: viewsRaw } }),
    published: dateRaw,
    description: '',
    author: authorRaw,
    authorId: browseEndpoint?.browseId || channelEndpoint?.browseId || '',
    handle: (channelEndpoint?.canonical || '').replace(/^\//, ''),
    authorThumbnail: avatar,
    badges: badgeText ? [badgeText] : [],
    href,
    isLive: /ライブ|LIVE/i.test(badgeText),
    isShort: isShortType,
    menuVideoId: videoId || '',
    videoCount: parts.find((p) => /本|動画/.test(p)) || '',
  };
}

/* ------------------------------------------------------------------ *
 * classic videoRenderer family
 * ------------------------------------------------------------------ */

function parseVideoRenderer(r) {
  const title = runsToText(r.title) || r.headline?.runs?.[0]?.text || '';
  const id = r.videoId || '';
  const author = authorFromRenderer(r);
  const publishedText = runsToText(r.publishedTimeText) || '';
  const viewsText = runsToText(r.viewCountText) || runsToText(r.shortViewCountText) || '';
  const description =
    runsToText(r.detailedMetadataSnippets?.[0]?.snippetText?.runs) ||
    runsToText(r.descriptionSnippet) ||
    runsToText(r.description) ||
    '';
  const badges = badgesOf(r);
  const seconds = durationSecondsFrom(r);
  const isLive = badges.some((b) => /ライブ|LIVE/i.test(b)) || /ライブ配信中/.test(viewsText);
  const upcoming = /配信予定|プレミア公開/i.test(publishedText) || /予定/.test(badges.join(' '));

  return {
    id,
    type: 'video',
    title,
    thumbnail: thumbnailFromRenderer(r),
    duration: seconds ? formatDuration(seconds) : '',
    durationSeconds: seconds,
    views: viewsText,
    viewCount: viewCountFrom(r),
    published: publishedText,
    description,
    badges,
    isLive,
    isUpcoming: upcoming,
    isShort: false,
    ...author,
    href: id ? `/watch?v=${encodeURIComponent(id)}` : '',
    menuVideoId: id,
  };
}

function parseShortsLockup(s) {
  const onTap = s.onTap?.innertubeCommand || null;
  const webUrl = onTap?.commandMetadata?.webCommandMetadata?.url || '';
  let id = '';
  if (/^\/shorts\//.test(webUrl)) id = webUrl.split('/')[2] || '';
  if (!id && /^\/watch\?/.test(webUrl)) {
    try {
      id = new URL(`https://x${webUrl}`).searchParams.get('v') || '';
    } catch {
      id = '';
    }
  }
  if (!id) {
    const m = /shorts-shelf-item-([A-Za-z0-9_-]{6,})/.exec(String(s.entityId || ''));
    if (m) id = m[1];
  }
  if (!id) id = s.contentId || '';

  const overlayBadge = findFirst(s.overlayImage, ['thumbnailBadgeViewModel'], 5) || {};
  const thumb = bestThumbnail(s.thumbnail?.sources);
  const accessibility = String(s.accessibilityText || '');

  // "タイトル, 885万回視聴 - ショート動画を再生"
  let title = typeof s.primaryText === 'string' ? s.primaryText : runsToText(s.primaryText);
  let views = typeof s.secondaryText === 'string' ? s.secondaryText : runsToText(s.secondaryText);
  if (!title && accessibility) {
    const [head] = accessibility.split(' - ');
    const bits = (head || '').split(', ');
    title = bits[0] || '';
    views = views || bits[1] || '';
  }
  const overlayText = findFirst(s.overlayImage, ['text'], 6);

  return {
    id,
    type: 'short',
    title,
    thumbnail: thumb,
    duration: '',
    durationSeconds: 0,
    views,
    viewCount: viewCountFrom({ viewCountText: { simpleText: views } }),
    published: '',
    author: '',
    authorId: '',
    handle: '',
    authorThumbnail: '',
    badges: overlayBadge.text ? [overlayBadge.text] : overlayText ? [String(overlayText)] : [],
    href: id ? `/shorts/${encodeURIComponent(id)}` : '',
    description: '',
    isShort: true,
    isLive: false,
    menuVideoId: id,
  };
}

function parseReelItem(r) {
  const id = r.videoId || '';
  return {
    id,
    type: 'short',
    title: runsToText(r.headline) || '',
    thumbnail: thumbnailFromRenderer(r),
    duration: '',
    durationSeconds: 0,
    views: runsToText(r.viewCountText) || '',
    viewCount: viewCountFrom(r),
    published: '',
    author: '',
    authorId: '',
    handle: '',
    authorThumbnail: '',
    badges: [],
    href: id ? `/shorts/${encodeURIComponent(id)}` : '',
    isShort: true,
    menuVideoId: id,
  };
}

function parseChannelRenderer(c) {
  const id = c.channelId || '';
  const subs = runsToText(c.subscriberCountText) || runsToText(c.videoCountText) || '';
  return {
    id,
    type: 'channel',
    title: runsToText(c.title) || c.title?.simpleText || '',
    thumbnail: thumbnailFromRenderer(c),
    handle: (c.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || '').replace(/^\//, ''),
    subscribers: subs,
    description: runsToText(c.descriptionSnippet),
    videoCount: runsToText(c.videoCountText),
    href: id ? `/channel/${encodeURIComponent(id)}` : '',
    badges: (c.ownerBadges || []).map((b) => b.metadataBadgeRenderer?.tooltip || '').filter(Boolean),
  };
}

function parsePlaylistRenderer(p) {
  const id = p.playlistId || '';
  return {
    id,
    type: 'playlist',
    title: runsToText(p.title) || p.title?.simpleText || '',
    thumbnail: thumbnailFromRenderer(p),
    count: runsToText(p.videoCountText) || runsToText(p.videoCountShortText) || '',
    author: runsToText(p.shortBylineText) || runsToText(p.ownerText) || '',
    authorId:
      p.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
    href: id ? `/playlist?list=${encodeURIComponent(id.replace(/^VL/, ''))}` : '',
    videos: (p.videos || [])
      .map((v) => v.childVideoRenderer)
      .filter(Boolean)
      .map((v) => ({
        title: runsToText(v.title),
        href: v.navigationEndpoint?.watchEndpoint?.videoId
          ? `/watch?v=${encodeURIComponent(v.navigationEndpoint.watchEndpoint.videoId)}`
          : '',
        duration: runsToText(v.lengthText),
      })),
  };
}

/* ------------------------------------------------------------------ *
 * public item parser
 * ------------------------------------------------------------------ */

/** Turn any InnerTube node into a normalised item (or null when unsupported). */
export function parseItem(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.videoRenderer) return parseVideoRenderer(node.videoRenderer);
  if (node.gridVideoRenderer) return parseVideoRenderer(node.gridVideoRenderer);
  if (node.compactVideoRenderer) return parseVideoRenderer(node.compactVideoRenderer);
  if (node.videoWithContextRenderer) return parseVideoRenderer(node.videoWithContextRenderer);
  if (node.playlistVideoRenderer) return parseVideoRenderer(node.playlistVideoRenderer);
  if (node.movieRenderer) return parseVideoRenderer(node.movieRenderer);
  if (node.lockupViewModel) return parseLockup(node.lockupViewModel);
  if (node.shortsLockupViewModel) return parseShortsLockup(node.shortsLockupViewModel);
  if (node.reelItemRenderer) return parseReelItem(node.reelItemRenderer);
  if (node.channelRenderer) return parseChannelRenderer(node.channelRenderer);
  if (node.channelViewModel) return parseChannelRenderer({ ...node.channelViewModel, channelId: node.channelViewModel.channelId });
  if (node.playlistRenderer) return parsePlaylistRenderer(node.playlistRenderer);
  if (node.radioRenderer) return parsePlaylistRenderer(node.radioRenderer);
  if (node.richItemRenderer) return parseItem(node.richItemRenderer.content);
  if (node.content) return parseItem(node.content);
  return null;
}

/** Extract every renderable item from an arbitrary InnerTube subtree. */
export function parseItems(node, { includeShorts = true } = {}) {
  const out = [];
  const seen = new Set();
  const found = collectAll(node, RENDERER_KEYS);
  for (const { key: rendererKey, value } of found) {
    const parsed = parseItem({ [rendererKey]: value });
    if (!parsed) continue;
    if (!parsed.id && !parsed.title) continue;
    if (!includeShorts && parsed.isShort) continue;
    const dedupeKey = `${parsed.type}:${parsed.id || parsed.title}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(parsed);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * continuations
 * ------------------------------------------------------------------ */

/** First continuation token in a subtree (optionally for a specific target). */
export function findContinuation(node, targetId) {
  const found = collectAll(node, ['continuationItemRenderer'], [], 16);
  for (const { value } of found) {
    if (targetId && value.trigger !== targetId && value.targetId !== targetId) continue;
    const token =
      value.continuationEndpoint?.continuationCommand?.token ||
      value.button?.buttonRenderer?.command?.continuationCommand?.token;
    if (token) return token;
  }
  const cmd = findFirst(node, ['continuationCommand'], 16);
  return cmd?.token || '';
}

/** All continuation tokens keyed by the section they belong to. */
export function findContinuations(node) {
  const out = [];
  const found = collectAll(node, ['continuationItemRenderer'], [], 16);
  for (const { value } of found) {
    const token =
      value.continuationEndpoint?.continuationCommand?.token ||
      value.button?.buttonRenderer?.command?.continuationCommand?.token;
    if (!token) continue;
    out.push({ token, targetId: value.targetId || '', trigger: value.trigger || '' });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * chips / filters
 * ------------------------------------------------------------------ */

export function parseChips(response) {
  const chips = [];
  const nodes = collectAll(response, ['chipCloudChipRenderer', 'feedFilterChipBarRenderer'], [], 6);
  for (const { key, value } of nodes) {
    if (key === 'feedFilterChipBarRenderer') {
      for (const c of value.contents || []) {
        const chip = c.chipCloudChipRenderer;
        if (!chip) continue;
        chips.push({
          text: runsToText(chip.text),
          selected: !!chip.isSelected,
          token: chip.navigationEndpoint?.continuationCommand?.token || '',
        });
      }
      if (chips.length) break;
    }
  }
  return chips;
}

/** Search filter chips (すべて / 動画 / チャンネル / 再生リスト …). */
export function parseSearchFilters(response) {
  const filters = [];
  const groups = collectAll(response, ['searchFilterGroupRenderer'], [], 8);
  for (const { value } of groups) {
    const title = runsToText(value.title);
    const options = (value.filters || [])
      .map((f) => f.searchFilterRenderer)
      .filter(Boolean)
      .map((f) => ({
        label: runsToText(f.label),
        params: f.navigationEndpoint?.searchEndpoint?.params || '',
        selected: f.status === 'SEARCH_FILTER_STATUS_SELECTED',
      }));
    filters.push({ title, options });
  }
  return filters;
}

/* ------------------------------------------------------------------ *
 * channel page
 * ------------------------------------------------------------------ */

export function parseChannelHeader(response) {
  const header = response.header || {};
  const ph = header.pageHeaderRenderer;
  const metaFallback = response.metadata?.channelMetadataRenderer;
  if (ph) {
    const content = ph.content?.pageHeaderViewModel;
    const title = content?.title?.content || metaFallback?.title || '';
    const handle = content?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || '';
    const stats = (content?.metadata?.contentMetadataViewModel?.metadataRows || [])
      .flatMap((r) => (r.metadataParts || []).map((p) => p.text?.content || ''))
      .filter(Boolean);
    const avatar =
      bestThumbnail(content?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources) || '';
    const banner = bestThumbnail(
      findFirst(header, ['bannerViewModel'], 6)?.image?.sources ||
        findFirst(response, ['banner'], 6)?.thumbnails ||
        []
    );
    const description = content?.description?.description || '';
    const channelHandle = content?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.find(
      (p) => p.text?.content?.startsWith('@')
    )?.text?.content || '';
    const channelId = findFirst(response, ['channelId'], 6) || response.onResponseReceivedActions
      ? findFirst(response, ['externalChannelId'], 6) || ''
      : '';
    return {
      title,
      handle: channelHandle || handle,
      stats,
      avatar,
      banner,
      description,
      channelId: findFirst(response.metadata, ['externalChannelId'], 6) || channelId || '',
      subscriberCountText: stats.find((s) => /登録者/.test(s)) || '',
      videoCountText: stats.find((s) => /本|動画/.test(s)) || '',
      viewsText: stats.find((s) => /回視聴/.test(s)) || '',
      joinedText: stats.find((s) => /参加日/.test(s)) || '',
      links: (content?.metadata?.contentMetadataViewModel?.metadataRows || [])
        .flatMap((r) => r.metadataParts || [])
        .filter((p) => p.text?.commandRuns)
        .map((p) => ({ text: p.text.content, url: '' })),
    };
  }
  const c4 = header.c4TabbedHeaderRenderer;
  if (c4) {
    return {
      title: c4.title || '',
      handle: c4.channelHandle || '',
      stats: [c4.subscriberCountText, c4.videosCountText].filter(Boolean),
      avatar: bestThumbnail(c4.avatar?.thumbnails),
      banner: bestThumbnail(c4.banner?.thumbnails),
      description: '',
      channelId: c4.channelId || '',
      subscriberCountText: c4.subscriberCountText || '',
      videoCountText: c4.videosCountText || '',
    };
  }
  // Last resort: metadata block (always present on channel browse responses).
  const meta = response.metadata?.channelMetadataRenderer;
  if (meta) {
    return {
      title: meta.title || '',
      handle: (meta.vanityChannelUrl || '').replace(/^\//, ''),
      stats: [],
      avatar: proxiedImage(meta.avatar?.thumbnails?.[0]?.url || ''),
      banner: '',
      description: meta.description || '',
      channelId: meta.externalId || '',
      subscriberCountText: '',
      videoCountText: '',
    };
  }
  return { title: '', handle: '', stats: [], avatar: '', banner: '', description: '', channelId: '' };
}

export function parseChannelTabs(response) {
  const tabs = response.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  return tabs
    .map((t) => t.tabRenderer)
    .filter(Boolean)
    .map((t) => ({
      title: t.title || '',
      selected: !!t.selected,
      endpoint: t.endpoint || null,
      browseId: t.endpoint?.browseEndpoint?.browseId || '',
      params: t.endpoint?.browseEndpoint?.params || '',
      content: t.content || null,
      href: t.endpoint ? endpointHref(t.endpoint) : '',
    }))
    .filter((t) => t.title);
}

/* ------------------------------------------------------------------ *
 * watch page
 * ------------------------------------------------------------------ */

export function parseWatchResponse(response) {
  const results =
    response.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];

  const primary =
    results.find((r) => r.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer || null;
  const composite = results.find((r) => r.compositeVideoPrimaryInfoRenderer)
    ?.compositeVideoPrimaryInfoRenderer || null;
  const secondary =
    results.find((r) => r.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer || null;

  const playerResponse = response.playerResponse || response.playerResponse_ || null;
  const details = playerResponse?.videoDetails || response.videoDetails || null;
  const micro = playerResponse?.microformat?.playerMicroformatRenderer || null;

  const title =
    runsToText(primary?.title) ||
    composite?.title?.content ||
    details?.title ||
    findFirst(response, ['videoPrimaryInfoRenderer'], 6)?.title?.runs?.[0]?.text ||
    '';

  const viewText =
    runsToText(primary?.viewCount?.videoViewCountRenderer?.viewCount) ||
    primary?.viewCount?.videoViewCountRenderer?.shortViewCount?.simpleText ||
    composite?.viewCount?.content ||
    details?.viewCount ||
    '';

  const dateText = runsToText(primary?.dateText) || micro?.publishDate || '';

  const likeButtons = collectAll(primary || composite || {}, ['segmentedLikeDislikeButtonRenderer', 'likeButtonRenderer', 'toggleButtonViewModel'], [], 6);
  let likeCount = '';
  for (const { value } of likeButtons) {
    const t =
      value.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel?.title ||
      value.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel?.title ||
      runsToText(value.likeButtonRenderer?.title) ||
      '';
    if (t) {
      likeCount = t;
      break;
    }
  }

  const authorRenderer =
    secondary?.owner?.videoOwnerRenderer ||
    findFirst(secondary || {}, ['videoOwnerRenderer'], 6) ||
    null;
  const channel = authorRenderer
    ? {
        id: authorRenderer.navigationEndpoint?.browseEndpoint?.browseId || '',
        title: runsToText(authorRenderer.title),
        handle: (authorRenderer.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || '').replace(/^\//, ''),
        avatar: bestThumbnail(authorRenderer.thumbnail?.thumbnails),
        subscribers: runsToText(authorRenderer.subscriberCountText),
      }
    : {
        id: details?.channelId || micro?.externalChannelId || '',
        title: details?.author || micro?.ownerChannelName || '',
        handle: (micro?.ownerProfileUrl || '').split('/').pop(),
        avatar: '',
        subscribers: '',
      };

  const description =
    runsToText(secondary?.attributedDescription?.content ? [{ text: secondary.attributedDescription.content }] : secondary?.description) ||
    secondary?.attributedDescription?.content ||
    details?.shortDescription ||
    micro?.description?.simpleText ||
    '';

  const keywords = details?.keywords || micro?.keywords || [];

  const secondaryResults =
    response.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || [];

  const commentSection = results.find((r) => r.itemSectionRenderer)?.itemSectionRenderer || null;
  const commentsToken = commentSection
    ? findContinuation(commentSection) ||
      findFirst(commentSection, ['continuationCommand'], 8)?.token ||
      ''
    : '';

  const autoplay =
    response.contents?.twoColumnWatchNextResults?.autoplay?.playerOverlays
      ?.playerOverlayAutoplayRenderer || null;

  const liveChat = findFirst(response, ['liveChatRenderer'], 10) || null;

  return {
    title,
    views: viewText,
    dateText,
    likeCount,
    channel,
    description,
    keywords,
    lengthSeconds: Number(details?.lengthSeconds || micro?.lengthSeconds || 0),
    isLive: !!details?.isLiveContent && !!liveChat,
    isLiveNow: /ライブ配信中/.test(viewText) || !!micro?.isLive,
    related: parseItems(secondaryResults),
    relatedContinuation: findContinuation({ contents: secondaryResults }),
    commentsToken,
    autoplayNext: autoplay
      ? {
          videoId: autoplay.nextButton?.buttonRenderer?.navigationEndpoint?.watchEndpoint?.videoId || '',
          title: runsToText(autoplay.videoTitle),
          byline: runsToText(autoplay.byline),
          thumbnail: bestThumbnail(autoplay.thumbnail?.thumbnails),
        }
      : null,
    liveChatId: liveChat?.id || '',
    engagementPanels: (response.engagementPanels || [])
      .map((p) => p.engagementPanelSectionListRenderer)
      .filter(Boolean)
      .map((p) => ({ title: runsToText(p.header?.engagementPanelTitleHeaderRenderer?.title), targetId: p.targetId || '' })),
  };
}

/* ------------------------------------------------------------------ *
 * comments
 * ------------------------------------------------------------------ */

export function parseComments(response) {
  const comments = [];
  const entities = response.frameworkUpdates?.entityBatchUpdate?.mutations || [];
  const byKey = new Map();
  for (const m of entities) {
    const p = m.payload?.commentEntityPayload;
    if (p) byKey.set(p.key, p);
  }

  const threads = collectAll(response, ['commentThreadRenderer'], [], 14);
  for (const { value } of threads) {
    const c = value.commentViewModel?.commentViewModel || value.comment?.commentRenderer || null;
    const parsed = parseCommentNode(c, byKey);
    if (!parsed) continue;
    parsed.repliesToken =
      value.replies?.commentRepliesRenderer?.contents?.[0]?.continuationItemRenderer
        ?.button?.buttonRenderer?.command?.continuationCommand?.token ||
      findContinuation(value.replies || {}) ||
      '';
    parsed.replyCount =
      value.replies?.commentRepliesRenderer?.viewReplies?.buttonRenderer?.text?.runs?.[0]?.text ||
      '';
    comments.push(parsed);
  }

  // Some payloads only contain entity mutations (mobile style responses).
  if (!comments.length && byKey.size) {
    for (const [, p] of byKey) {
      if (p.properties?.parentId && p.properties.parentId !== '') continue;
      const parsed = parseCommentEntity(p, byKey);
      if (parsed) comments.push(parsed);
    }
  }

  return {
    comments,
    continuation: findContinuation(response) || findFirst(response, ['continuationCommand'], 12)?.token || '',
    totalCount: runsToText(findFirst(response, ['countText'], 10)) || '',
    sortMenu: (findFirst(response, ['sortMenu'], 10)?.subMenuRenderer?.serviceItems || [])
      .map((s) => s.serviceItemRenderer)
      .filter(Boolean)
      .map((s) => ({
        title: runsToText(s.serviceEndpoint?.sortFilterSubMenuRenderer ? s.title : s.title),
        selected: !!s.selected,
        token: s.serviceEndpoint?.continuationCommand?.token || '',
      })),
  };
}

function parseCommentNode(c, byKey) {
  if (!c) return null;
  if (c.commentKey || c.commentId) {
    const entity = byKey.get(c.commentKey) || null;
    if (entity) return parseCommentEntity(entity, byKey);
  }
  if (c.contentText || c.authorText) {
    return {
      id: c.commentId || '',
      author: runsToText(c.authorText) || '',
      avatar: bestThumbnail(c.authorThumbnail?.thumbnails),
      text: runsToText(c.contentText),
      time: runsToText(c.publishedTimeText) || '',
      likes: runsToText(c.voteCount) || '',
      isAuthor: !!c.authorIsChannelOwner,
      repliesToken: '',
      replyCount: '',
      heartedByCreator: !!c.actionButtons?.commentActionButtonsRenderer?.creatorHeart,
    };
  }
  return null;
}

function parseCommentEntity(p, byKey) {
  if (!p) return null;
  const avatar = bestThumbnail(p.avatar?.image?.sources || p.avatar?.sources || []);
  return {
    id: p.key || '',
    author: p.author?.displayName || '',
    handle: p.author?.channelCommand?.innertubeCommand?.browseEndpoint?.canonicalBaseUrl?.replace(/^\//, '') || '',
    channelId: p.author?.channelId || '',
    avatar,
    text: (p.properties?.content?.content || '').replace(/\r/g, ''),
    time: p.properties?.publishedTime || '',
    likes: p.toolbar?.likeCountNotliked || p.toolbar?.likeCountLiked || '',
    isAuthor: !!p.author?.isCreator,
    repliesToken: '',
    replyCount: p.toolbar?.replyCount ? `${p.toolbar.replyCount}件の返信` : '',
    heartedByCreator: !!p.toolbar?.creatorHeart,
  };
}

/* ------------------------------------------------------------------ *
 * notifications
 * ------------------------------------------------------------------ */

export function parseNotifications(response) {
  const items = collectAll(response, ['notificationRenderer'], [], 12).map(({ value }) => {
    const target = endpointTarget(value.navigationEndpoint);
    return {
      id: value.notificationId || '',
      title: runsToText(value.shortMessage || value.longMessage),
      text: runsToText(value.longMessage) || runsToText(value.shortMessage),
      avatar: bestThumbnail(value.thumbnail?.thumbnails),
      time: runsToText(value.publishedTimeText),
      read: !!value.read,
      href:
        target?.kind === 'watch'
          ? `/watch?v=${encodeURIComponent(target.videoId)}`
          : endpointHref(value.navigationEndpoint),
    };
  });
  return items;
}

/* ------------------------------------------------------------------ *
 * player / streaming data
 * ------------------------------------------------------------------ */

export function parseStreamingData(streamingData, { baseUrl = '' } = {}) {
  const out = [];
  const push = (f, kind) => {
    if (!f) return;
    const url = f.url || (f.signatureCipher || f.cipher ? '' : '');
    out.push({
      itag: f.itag,
      kind,
      mimeType: f.mimeType || '',
      quality: f.qualityLabel || f.quality || '',
      fps: f.fps || 0,
      bitrate: f.bitrate || 0,
      width: f.width || 0,
      height: f.height || 0,
      audioQuality: f.audioQuality || '',
      contentLength: Number(f.contentLength || f.approxDurationMs ? f.contentLength || 0 : 0),
      url: url || '',
      cipher: f.signatureCipher || f.cipher || '',
      expires: url ? expiresFromUrl(url) : 0,
    });
  };
  for (const f of streamingData?.formats || []) push(f, 'muxed');
  for (const f of streamingData?.adaptiveFormats || []) {
    push(f, (f.mimeType || '').startsWith('audio/') ? 'audio' : 'video');
  }
  return out;
}

function expiresFromUrl(url) {
  const m = /[?&]expire=(\d+)/.exec(url);
  return m ? Number(m[1]) : 0;
}

/** Human readable "formats" list for the download dialog. */
export function describeFormats(formats) {
  return formats
    .filter((f) => f.url)
    .map((f) => ({
      quality: f.quality || (f.kind === 'audio' ? '音声' : '動画'),
      mimeType: f.mimeType,
      fps: f.fps,
      bitrate: f.bitrate,
      url: f.url,
      expires: f.expires,
      kind: f.kind,
      size: f.contentLength || 0,
    }));
}

export function buildEmbedUrls(videoId, { mirrors = config.embedMirrors } = {}) {
  const list = [
    { id: 'youtube', label: 'YouTube', url: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&hl=ja` },
    { id: 'nocookie', label: 'YouTube (nocookie)', url: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&hl=ja` },
  ];
  mirrors.forEach((m, i) => {
    try {
      const base = m.replace(/\/$/, '');
      list.push({ id: `edu:${i}`, label: `ミラー ${i + 1}`, url: `${base}/embed/${videoId}?autoplay=1` });
    } catch {
      /* ignore bad mirror */
    }
  });
  return list;
}
