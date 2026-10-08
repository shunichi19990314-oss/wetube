/**
 * Live chat: resolve the chat id for a video, then poll `live_chat/get_live_chat`
 * with continuation tokens. Messages are normalised for the chat panel UI.
 */
import { innertube, next, playerWithFallback } from './innertube.js';
import { findFirst, bestThumbnail, proxiedImage } from './parsers.js';
import { runsToText } from '../utils.js';
import { TtlCache } from '../cache.js';
import { config } from '../config.js';

const cache = new TtlCache({ max: 1000, ttlSeconds: 60 });

/** Find the live chat id (and its initial continuation) for a video. */
export async function startChat(videoId) {
  if (!config.enableLiveChat) {
    const e = new Error('ライブチャットは無効になっています。');
    e.status = 403;
    throw e;
  }
  return cache.wrap(`livechat:start:${videoId}`, 120, async () => {
    let res = await next({ videoId }).catch(() => null);
    let renderer = res ? findFirst(res, ['liveChatRenderer'], 14) : null;

    if (!renderer) {
      const p = await playerWithFallback(videoId, { metadataOnly: true, clients: ['web', 'tv', 'android'] }).catch(() => null);
      const sub = p?.playabilityStatus?.liveStreamability?.liveStreamabilityRenderer;
      if (sub?.chatId) {
        renderer = { id: sub.chatId };
      }
    }

    const chatId = renderer?.id || '';
    if (!chatId) {
      const e = new Error('この動画にはライブチャットがありません。');
      e.status = 404;
      throw e;
    }

    const continuation =
      findFirst(renderer, ['continuationCommand'], 8)?.token ||
      findFirst(renderer?.continuations || [], ['continuationCommand'], 6)?.token ||
      '';

    return { chatId, continuation, isLive: !!renderer?.isLive };
  });
}

/** Fetch the next batch of chat events. */
export async function chatEvents(continuation, { token = null } = {}) {
  if (!continuation) return { messages: [], continuation: '', status: 'idle' };
  const res = await innertube(
    'live_chat/get_live_chat',
    { continuation },
    { client: 'web', token, timeoutMs: 15000 }
  );

  const actions = res.actions || [];
  const messages = [];
  for (const a of actions) {
    const item =
      a.addChatItemAction?.item?.liveChatTextMessageRenderer ||
      a.addChatItemAction?.item?.liveChatMembershipItemRenderer ||
      a.addChatItemAction?.item?.liveChatViewerEngagementMessageRenderer ||
      null;
    if (!item) continue;

    if (item.liveChatViewerEngagementMessageRenderer) {
      messages.push({
        id: item.liveChatViewerEngagementMessageRenderer.id || '',
        type: 'system',
        author: '',
        text: runsToText(item.liveChatViewerEngagementMessageRenderer.message),
        avatar: '',
        timestamp: Date.now(),
      });
      continue;
    }

    const author = runsToText(item.authorName) || '';
    const badges = (item.authorBadges || [])
      .map((b) => b.liveChatAuthorBadgeRenderer?.tooltip || '')
      .filter(Boolean);
    messages.push({
      id: item.id || '',
      type: item.liveChatMembershipItemRenderer ? 'membership' : 'message',
      author,
      authorExternalChannelId: item.authorExternalChannelId || '',
      text: runsToText(item.message),
      avatar: proxiedImage(bestThumbnail(item.authorPhoto?.thumbnails, 'low') || ''),
      timestamp: Number(item.timestampUsec ? Math.floor(Number(item.timestampUsec) / 1000) : Date.now()),
      isOwner: !!item.authorBadges?.some((b) => b.liveChatAuthorBadgeRenderer?.icon?.iconType === 'OWNER'),
      isModerator: !!item.authorBadges?.some((b) => b.liveChatAuthorBadgeRenderer?.icon?.iconType === 'MODERATOR'),
      isMember: !!item.authorBadges?.some((b) => b.liveChatAuthorBadgeRenderer?.icon?.iconType === 'MEMBER'),
      badges,
      purchaseAmount: runsToText(item.purchaseAmountText) || '',
    });
  }

  const nextToken =
    findFirst(res.continuations || [], ['liveChatContinuationsData'], 4)
      ?.continuationItems?.find((c) => c.liveChatContinuation)?.continuationData?.continuations?.[0]
      ?.liveChatContinuation?.continuationData?.continuations?.[0]?.invalidationContinuationData?.continuation ||
    findFirst(res, ['continuationCommand'], 10)?.token ||
    continuation;

  return {
    messages,
    continuation: nextToken,
    pollingMs: Number(res.pollingIntervalMillis || 2000),
    status: messages.length ? 'live' : 'idle',
  };
}

/** Chat filters (e.g. participants only / members only) — returns the token to poll. */
export async function chatFilter(continuation, filter) {
  if (!continuation) return { continuation: '', filter: filter || 'all' };
  try {
    const res = await innertube('live_chat/get_live_chat', { continuation }, { client: 'web', timeoutMs: 15000 });
    const menu = findFirst(res, ['liveChatFilterSubMenuItemRenderer'], 12);
    const token = menu?.onSelectCommand?.continuationCommand?.token || continuation;
    return { continuation: token, filter: filter || 'all' };
  } catch {
    return { continuation, filter: filter || 'all' };
  }
}
