/** The player host. */
export const EMBED_BASE_URL = 'https://embed.wolvy.stream';

/**
 * The embed URL of a video, as every video object's `embed_url` and the playback-token
 * answer build it:
 *
 *     https://embed.wolvy.stream/{videoId}/{base64(accountId)}[?vt={viewerToken}]
 *
 * `accountId` is the number from `GET /v1/account` (`wolvy.account.retrieve()` → `id`);
 * it is base64-encoded as text here (42 → `NDI=`). Add a viewer token from
 * signViewerToken() for signed playback. Put the URL in an iframe with
 * `allow="autoplay; fullscreen; encrypted-media; picture-in-picture"`; opened directly in
 * a browser it shows a 403 page (no Referer), which is the domain check working.
 */
export function embedUrl(videoId: string, accountId: number | string, viewerToken?: string | null): string {
  if (typeof videoId !== 'string' || videoId === '') {
    throw new TypeError('embedUrl: videoId must be a non-empty string.');
  }
  const account =
    typeof accountId === 'number'
      ? Number.isSafeInteger(accountId) && accountId > 0
        ? String(accountId)
        : null
      : typeof accountId === 'string' && /^[1-9]\d*$/.test(accountId)
        ? accountId
        : null;
  if (account === null) {
    throw new TypeError('embedUrl: accountId must be the positive whole account id from GET /v1/account.');
  }
  const base = `${EMBED_BASE_URL}/${encodeURIComponent(videoId)}/${Buffer.from(account, 'utf8').toString('base64')}`;
  if (viewerToken === undefined || viewerToken === null || viewerToken === '') return base;
  if (typeof viewerToken !== 'string') {
    throw new TypeError('embedUrl: viewerToken must be a string.');
  }
  return `${base}?vt=${encodeURIComponent(viewerToken)}`;
}
