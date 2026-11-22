# Changelog

All notable changes to `@wolvy/node` are listed here. The package follows [Semantic Versioning](https://semver.org/): no breaking change without a new major version.

## [2.0.0] - 2026-11-22

Wolvy now refuses viewer tokens that name no video, for every account. Every token is signed for the one video it plays, so a token copied out of one page or app cannot open the account's other videos.

### Changed (breaking)
- `signViewerToken(viewerId, ttl, secret, { video })`: `options.video` is required. A 1.x call without it throws a `TypeError` instead of making a token Wolvy would refuse.
- `embedUrl(videoId, accountId, vt)` throws a `RangeError` for a token that names another video, or none.
- `PlaybackTokenCreateParams` no longer has `bind_video`: the API binds every token and refuses `bind_video: false`. `bound_to_video` is always true.

### Added
- `viewerTokenVideo(vt)`: the video a token names, read without the secret.

## [1.1.0] - 2026-11-22

### Added
- Viewer tokens bound to one video: `signViewerToken(viewerId, ttl, secret, { video })` adds a `video` claim, and `wolvy.playback.createToken(videoId, { viewer_id, bind_video: true })` asks the API for one (`bound_to_video` in the answer). Wolvy then plays that token only for that video, so a token copied out of one page cannot open the account's other videos. Without it, nothing changes.

## [1.0.1] - 2026-11-19

### Changed

- Package author is now "Wolvy" (was the company's legal name). No code change; the `User-Agent` reports `wolvy-node/1.0.1`.

## [1.0.0] - 2026-11-19

First release.

### Added

- `Wolvy` client for the Developer API v1 with one method per endpoint (54), grouped by resource: `health`, `account`, `videos`, `folders`, `tags`, `captions`, `chapters`, `moments`, `playback`, `analytics`, `usage`, `sessions`, `viewers`, `securityEvents`, `webhookEndpoints`, `webhookDeliveries`.
- Typed request parameters and answers, typed webhook events (`WolvyWebhookEvent`) and error codes.
- Cursor pagination: `await` a list for its first page, `for await` over every item, `getNextPage()`, `toArray()`.
- An `Idempotency-Key` on every POST that changes something, reused across that call's retries; overridable per call. Minting a playback token sends none unless one is passed, and is still retried.
- Retries for network errors, timeouts, 429 (following `Retry-After` / `X-RateLimit-Reset`), 409 `request_in_progress` and 5xx; per-attempt timeout; `AbortSignal` support.
- `WolvyError` hierarchy carrying the API's `code`, `type`, `param`, `requestId`, HTTP status and rate-limit headers.
- `signViewerToken()`: local viewer-token signing, byte-identical to the API's tokens and the docs' test vector (60 to 86400 seconds, 1 to 64-byte viewer ids).
- `verifyWebhook()`: constant-time `Wolvy-Signature` check with a 5-minute tolerance, returning the typed event.
- `embedUrl()`: the player's embed URL, unsigned or with a viewer token.
- ES module and CommonJS builds with type declarations; Node 18 or later; no runtime dependencies.
