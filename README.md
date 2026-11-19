# @wolvy/node

The official Node.js SDK for [Wolvy](https://wolvy.net), the DRM video hosting platform:

- a typed client for every endpoint of the [Developer API v1](https://docs.wolvy.net/api/), with cursor pagination, automatic idempotency keys and retries;
- `signViewerToken()` — sign viewer tokens locally, byte-identical to the API's own;
- `verifyWebhook()` — check a webhook delivery's signature and get the typed event;
- `embedUrl()` — build the player's embed URL.

Node 18 or later. No runtime dependencies (it uses the built-in `fetch` and `node:crypto`). ES modules and CommonJS, with TypeScript types.

> **Server-side only.** An API key, a viewer-token signing secret and a webhook secret must never reach a browser or a mobile app. Use this package on your server; send the browser an embed URL.

## Install

```bash
npm install @wolvy/node
```

## Configure

```js
import { Wolvy } from '@wolvy/node';
// or: const { Wolvy } = require('@wolvy/node');

const wolvy = new Wolvy({
  apiKey: process.env.WOLVY_API_KEY, // wv_live_… — the default when omitted
});
```

| Option | Default | |
|---|---|---|
| `apiKey` | `process.env.WOLVY_API_KEY` | A Developer API key, created in the dashboard (Settings → API) with the scopes you need |
| `baseUrl` | `https://api.wolvy.net/v1` | Include the `/v1` |
| `timeout` | `60000` | Milliseconds per attempt; `0` waits forever |
| `maxRetries` | `2` | See [Retries](#retries-and-idempotency) |
| `fetch` | global `fetch` | Any compatible implementation (a proxy agent, a test double) |
| `defaultHeaders` | `{}` | Added to every request |

Every method takes, as its last argument, per-call options: `{ timeout, maxRetries, signal, headers, idempotencyKey }`.

## Quick start

```js
const account = await wolvy.account.retrieve();          // account.id is used in embed URLs

for await (const video of wolvy.videos.list({ status: 'ready' })) {
  console.log(video.id, video.title);
}

// A signed embed for one viewer: ask the API…
const token = await wolvy.playback.createToken('a1b2c3d4e5f60718293a', { viewer_id: 'user-8813', ttl_seconds: 3600 });
console.log(token.embed_url);

// …or sign locally, with no request (same bytes):
import { embedUrl, signViewerToken } from '@wolvy/node';
const vt = signViewerToken('user-8813', 3600, process.env.WOLVY_VIEWER_SECRET);
const src = embedUrl('a1b2c3d4e5f60718293a', account.id, vt);
```

```html
<iframe src="…src…" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
```

## The client

One method per endpoint, grouped by resource. Request parameters and answers use the API's own field names (`viewer_id`, `next_cursor`, …), so the [API reference](https://docs.wolvy.net/api/) reads straight across.

| Resource | Methods | Endpoints |
|---|---|---|
| `wolvy.health` | `check()` | `GET /health` |
| `wolvy.account` | `retrieve()`, `retrievePlayerSettings()` | `GET /v1/account`, `GET /v1/settings/player` |
| `wolvy.videos` | `list(params)`, `create(params)`, `retrieve(id)`, `retrieveStatus(id)`, `update(id, params)`, `delete(id)`, `bulk(params)` | `/v1/videos…`, `POST /v1/videos/bulk` |
| `wolvy.folders` | `list(params)`, `create(params)`, `retrieve(id)`, `update(id, params)`, `delete(id)` | `/v1/folders…` |
| `wolvy.tags` | `list()`, `replace(videoId, { tags })`, `add(videoId, { tags })`, `remove(videoId, tag)` | `GET /v1/tags`, `/v1/videos/{id}/tags…` |
| `wolvy.captions` | `list(videoId)`, `create(videoId, params)`, `delete(videoId, languageCode)` | `/v1/videos/{id}/captions…` |
| `wolvy.chapters` | `list(videoId)`, `create(videoId, params)`, `update(videoId, index, params)`, `delete(videoId, index)` | `/v1/videos/{id}/chapters…` |
| `wolvy.moments` | `list(videoId)`, `create(videoId, params)`, `update(videoId, index, params)`, `delete(videoId, index)` | `/v1/videos/{id}/moments…` |
| `wolvy.playback` | `createToken(videoId, params)`, `retrieveEmbed(videoId)` | `POST /v1/videos/{id}/playback-tokens`, `GET /v1/videos/{id}/embed` |
| `wolvy.analytics` | `overview(params)`, `daily(params)`, `countries(params)`, `devices(params)`, `video(videoId)` | `/v1/analytics/…`, `GET /v1/videos/{id}/analytics` |
| `wolvy.usage` | `retrieve()`, `history(params)`, `retrievePlan()` | `GET /v1/usage`, `GET /v1/usage/history`, `GET /v1/plan` |
| `wolvy.sessions` | `list(params)`, `retrieve(sessionId)`, `listForVideo(videoId, params)` | `/v1/sessions…`, `GET /v1/videos/{id}/sessions` |
| `wolvy.viewers` | `list(params)`, `retrieve(viewerId, params)`, `listSharing(params)` | `/v1/viewers…`, `GET /v1/analytics/sharing` |
| `wolvy.securityEvents` | `list(params)` | `GET /v1/security-events` |
| `wolvy.webhookEndpoints` | `list()`, `create(params)`, `retrieve(id)`, `update(id, params)`, `delete(id)`, `sendTest(id)` | `/v1/webhook-endpoints…` |
| `wolvy.webhookDeliveries` | `list(params)` | `GET /v1/webhook-deliveries` |

Each key needs the scope of the endpoint it calls (`videos:read`, `playback:sign`, …); the method's doc comment names it. Deleting answers `undefined` (HTTP 204). Date filters accept a `Date` (`from`/`to` send its UTC day, `created_after`/`created_before` an RFC 3339 time).

## Pagination

Lists that page with a cursor (`videos`, `folders`, `sessions`, `viewers`, sharing, security events, webhook deliveries) return a `PagePromise`:

```js
// The first page — the API's own fields, plus helpers.
const page = await wolvy.videos.list({ limit: 50, folder_id: 7 });
page.data;          // Video[]
page.next_cursor;   // string | null
if (page.hasNextPage()) {
  const next = await page.getNextPage(); // same filters, next cursor
}

// Every item of every page, fetched as you go.
for await (const video of wolvy.videos.list({ status: 'ready' })) { /* … */ }

// Or collected, up to a limit.
const recent = await wolvy.sessions.list({ video_id: 'a1b2c3d4e5f60718293a' }).toArray({ limit: 500 });
```

Short lists (captions, chapters, moments, tags, webhook endpoints, daily analytics, usage history) return everything at once, in the same `{ object: 'list', data, has_more, next_cursor }` envelope.

## The three helpers

### `signViewerToken(viewerId, ttlSeconds, secret, options?)`

Signs a [viewer token](https://docs.wolvy.net/viewer-tokens/) (`vt`) on your server, with no request — the token is **byte-identical** to the `vt` that `POST /v1/videos/{id}/playback-tokens` returns for the same viewer id, lifetime and second, and it matches the docs' published test vector.

```js
import { signViewerToken } from '@wolvy/node';

const vt = signViewerToken(String(user.id), 3600, process.env.WOLVY_VIEWER_SECRET);
```

- `viewerId`: your id for the person watching. It is drawn on the watermark and recorded with each session, so use one stable id per person (your user id). Spaces, tabs and line breaks at either end are removed, as the API does; then it must be 1–64 UTF-8 bytes.
- `ttlSeconds`: a whole number from 60 to 86400 (24 hours), the range the API issues. A few hours suits a lesson; sign a fresh token per page view.
- `secret`: the account's signing secret (dashboard: Settings → Watermark → Signing secret), as text — never hex-decode it.
- `options.now`: the signing time (Unix seconds or a `Date`), for tests.

Invalid input throws a `TypeError` or `RangeError`. A token is not tied to a video: it plays every video of the account until it expires.

### `verifyWebhook(rawBody, signatureHeader, secret, tolerance = 300)`

Checks the `Wolvy-Signature: t=…,v1=…` header — HMAC-SHA256 over `"{t}.{raw body}"` with the endpoint's `whsec_…` secret, compared in constant time — and that `t` is within `tolerance` seconds of now. Returns the parsed, typed event, or throws `WolvySignatureVerificationError` (`code`: `missing_signature_header`, `invalid_signature_header`, `signature_mismatch`, `timestamp_outside_tolerance`, `invalid_payload`).

`rawBody` must be the **exact bytes received** — a string or a Buffer read before any JSON parser. A re-serialised object never matches.

**Express:**

```js
import express from 'express';
import { verifyWebhook, WolvySignatureVerificationError } from '@wolvy/node';

const app = express();

// Register the webhook route before any app.use(express.json()), with express.raw on it.
app.post('/hooks/wolvy', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = verifyWebhook(req.body, req.get('Wolvy-Signature'), process.env.WOLVY_WEBHOOK_SECRET);
  } catch (error) {
    if (error instanceof WolvySignatureVerificationError) return res.sendStatus(400);
    throw error;
  }
  res.sendStatus(200);  // answer within 15 seconds…
  handleEvent(event);   // …then do the work; dedupe on event.id
});

function handleEvent(event) {
  switch (event.type) {
    case 'video.ready':
      return publishLesson(event.data.id);
    case 'video.failed':
      return alertTeam(event.data.id, event.data.error ?? 'encoding failed');
    case 'usage.threshold_reached':
      return warnBilling(event.data.metric, event.data.used_percent);
  }
}
```

**Next.js (App Router route handler):**

```ts
// app/api/wolvy-webhook/route.ts
import { verifyWebhook } from '@wolvy/node';

export const runtime = 'nodejs'; // the SDK uses node:crypto

export async function POST(request: Request) {
  const rawBody = await request.text(); // the raw body; parse only after verifying
  let event;
  try {
    event = verifyWebhook(rawBody, request.headers.get('wolvy-signature'), process.env.WOLVY_WEBHOOK_SECRET!);
  } catch {
    return new Response('invalid signature', { status: 400 });
  }
  await enqueue(event); // dedupe on event.id
  return new Response(null, { status: 200 });
}
```

With the Pages Router, turn the body parser off for the route (`export const config = { api: { bodyParser: false } }`) and read the request stream into a Buffer.

The events (`event.type`): `video.created`, `video.ready`, `video.failed`, `video.deleted`, `caption.ready`, `security.event`, `payment.paid`, `usage.threshold_reached`, and `webhook.test` from `wolvy.webhookEndpoints.sendTest(id)`. `WolvyWebhookEvent` is their union: a `switch (event.type)` narrows `event.data`. Deliveries can repeat — record each `event.id` you have handled.

### `embedUrl(videoId, accountId, viewerToken?)`

```js
import { embedUrl } from '@wolvy/node';

embedUrl('a1b2c3d4e5f60718293a', 42);
// https://embed.wolvy.stream/a1b2c3d4e5f60718293a/NDI=
embedUrl('a1b2c3d4e5f60718293a', 42, vt);
// https://embed.wolvy.stream/a1b2c3d4e5f60718293a/NDI=?vt=eyJ2aWQiOi…
```

`accountId` is the number from `wolvy.account.retrieve()` (`id`), base64-encoded as text. The URL is the same one every video object's `embed_url` and the playback-token answer carry. Opened directly in a browser it shows a 403 page — no Referer reaches the domain check — so test it inside an iframe on an allowed page.

## Errors

Every error is a `WolvyError`. Branch on `code`, the API's stable machine code:

```js
import { WolvyError, WolvyNotFoundError, WolvyRateLimitError } from '@wolvy/node';

try {
  await wolvy.videos.retrieve(id);
} catch (error) {
  if (error instanceof WolvyNotFoundError) {
    // error.code === 'video_not_found'
  } else if (error instanceof WolvyRateLimitError) {
    console.log(`retry in ${error.retryAfter} s`);
  } else if (error instanceof WolvyError) {
    console.error(error.status, error.code, error.message, error.requestId);
  }
  throw error;
}
```

| Class | When |
|---|---|
| `WolvyAPIError` | Any error answer from the API (parent of the classes below) |
| `WolvyInvalidRequestError` | 400, 405, 422 — and the parent of the next two |
| `WolvyNotFoundError` | 404 (`video_not_found`, `folder_not_found`, …; another account's resource is "not found" too) |
| `WolvyConflictError` | 409 (`idempotency_key_reused`, `chapter_overlap`, `folder_loop`, …) |
| `WolvyAuthenticationError` | 401 (`missing_api_key`, `invalid_api_key`, `expired_api_key`) |
| `WolvyPermissionError` | 403 (`insufficient_scope`, `ip_not_allowed`, `account_inactive`) |
| `WolvyRateLimitError` | 429 `rate_limit_exceeded`, once retries are used up |
| `WolvyServerError` | 500 `internal_error`, 503 `service_unavailable`, any other 5xx |
| `WolvyConnectionError` | No answer: a network failure (`connection_error`) or your `signal` (`request_aborted`) |
| `WolvyTimeoutError` | No answer within `timeout` (`timeout`) |
| `WolvySignatureVerificationError` | `verifyWebhook()` refused a delivery |

Fields: `status` (HTTP status, `null` without an answer), `code`, `type`, `message`, `param` (the field at fault), `requestId` (`req_…` — quote it to support), `rateLimit` (`{ limit, remaining, reset, dailyLimit, dailyRemaining, retryAfter }` from the `X-RateLimit-*` and `Retry-After` headers, which the API sends on every authenticated answer), `headers` and `raw` (the error body).

## Retries and idempotency

- **Retried** (up to `maxRetries`, default 2): network errors, timeouts, `429`, `408`, `409 request_in_progress` and every `5xx`. The wait follows `Retry-After` (or `X-RateLimit-Reset`) when the API sends it, otherwise about 0.5 s, 1 s, 2 s … with jitter. A wait over 60 seconds — a daily limit — is not slept through: the `WolvyRateLimitError` is thrown at once. Your `signal` stops a call immediately, retries included.
- **Never retried**: other `4xx` answers, which would fail the same way again.
- **Idempotency keys**: every `POST` that changes something carries a new random `Idempotency-Key`, reused by that call's retries. If an answer is lost after the API did the work, the retry gets the stored answer (`Idempotent-Replay: true`) instead of creating a second video, folder or endpoint. Pass `{ idempotencyKey: 'your-key' }` to make a `POST` safe across your own retries too (the API remembers keys for 24 hours), or `{ idempotencyKey: null }` to send none — such a `POST` is then only retried after a `429`.
- **Minting playback tokens** (`wolvy.playback.createToken`) sends **no** `Idempotency-Key`, as the [docs advise](https://docs.wolvy.net/viewer-tokens/#sign-with-api): minting changes nothing, a replay would hand back a token minted earlier (possibly expired), and the API would store every answer for 24 hours. Because minting twice is harmless, it is still retried after network errors, timeouts, `429` and `5xx`. A key you pass explicitly is sent as usual; do not reuse one across mints.

## TypeScript

Types ship with the package; nothing else to install. Request parameters (`VideoListParams`, `PlaybackTokenCreateParams`, …), answers (`Video`, `Folder`, `PlaybackToken`, `ViewerDetail`, …), webhook events (`WolvyWebhookEvent`, `VideoReadyEvent`, …) and error codes (`WolvyErrorCode`) are all exported.

## Testing this package

```bash
npm ci
npm test                  # build, type checks, unit tests
npm run test:integration  # against a running copy of the Developer API; skipped unless WOLVY_IT_BASE_URL is set
```

The integration suite and the settings it reads are described at the top of `test/integration/env.mjs`.

## Licence

[Apache-2.0](LICENSE) © MAIM For Digital Solutions.
