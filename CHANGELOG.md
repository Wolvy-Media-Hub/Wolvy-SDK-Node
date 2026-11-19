# Changelog

All notable changes to `@wolvy/node` are listed here. The package follows [Semantic Versioning](https://semver.org/): no breaking change without a new major version.

## [1.0.0] - Unreleased

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
