// Settings of the integration suite, from the environment. The suite runs against a real copy
// of the Developer API (Wolvy-APIs) with a seeded database; without WOLVY_IT_BASE_URL every
// test is skipped, so `npm run test:integration` is safe anywhere.
//
//   WOLVY_IT_BASE_URL                e.g. http://127.0.0.1:8231/v1
//   WOLVY_IT_API_KEY                 a key of the seeded account with every scope
//   WOLVY_IT_API_KEY_READ_ONLY       a key of the same account with only videos:read
//   WOLVY_IT_API_KEY_ONE_PER_MINUTE  a key with minute_limit = 1
//   WOLVY_IT_API_KEY_OTHER_ACCOUNT   a key of a second account
//   WOLVY_IT_VIEWER_SECRET           the seeded account's user_settings.viewer_sign_secret
//   WOLVY_IT_ACCOUNT_ID              the seeded account's id
// For the webhook deliveries (skipped when unset):
//   WOLVY_IT_DISPATCH_CMD            runs app/workers/webhook_dispatch.php once, trusting the CA
//                                    that signed WOLVY_IT_TLS_CERT; https_proxy is set by the test
//   WOLVY_IT_WEBHOOK_HOST            a public host name the receiver's certificate is for (example.com)
//   WOLVY_IT_WEBHOOK_PROXY_PORT      local port of the receiver (a CONNECT proxy + TLS server)
//   WOLVY_IT_TLS_CERT, WOLVY_IT_TLS_KEY
//   WOLVY_IT_POLLER_CMD, WOLVY_IT_SQL_CMD   app/workers/event_poller.php once; run one SQL statement
//
// The seed the suite expects: account WOLVY_IT_ACCOUNT_ID with an active Multi-DRM plan, a
// user_settings row with the viewer secret, folders 7 and 9, and seven videos (three ready,
// one playable, one processing, one queued, one failed); a second account with one video.

const e = process.env;

export const IT = e.WOLVY_IT_BASE_URL
  ? {
      baseUrl: e.WOLVY_IT_BASE_URL,
      apiKey: e.WOLVY_IT_API_KEY,
      readOnlyKey: e.WOLVY_IT_API_KEY_READ_ONLY,
      onePerMinuteKey: e.WOLVY_IT_API_KEY_ONE_PER_MINUTE,
      otherAccountKey: e.WOLVY_IT_API_KEY_OTHER_ACCOUNT,
      viewerSecret: e.WOLVY_IT_VIEWER_SECRET,
      accountId: Number(e.WOLVY_IT_ACCOUNT_ID),
      dispatchCmd: e.WOLVY_IT_DISPATCH_CMD,
      pollerCmd: e.WOLVY_IT_POLLER_CMD,
      sqlCmd: e.WOLVY_IT_SQL_CMD,
      webhookHost: e.WOLVY_IT_WEBHOOK_HOST ?? 'example.com',
      proxyPort: Number(e.WOLVY_IT_WEBHOOK_PROXY_PORT ?? 8232),
      tlsCert: e.WOLVY_IT_TLS_CERT,
      tlsKey: e.WOLVY_IT_TLS_KEY,
    }
  : null;

export const SKIP = IT ? false : 'WOLVY_IT_BASE_URL is not set (see test/integration/env.mjs)';
export const SKIP_WEBHOOKS = SKIP || (IT.dispatchCmd && IT.tlsCert && IT.tlsKey ? false : 'WOLVY_IT_DISPATCH_CMD / TLS files not set');
export const SKIP_POLLER = SKIP_WEBHOOKS || (IT.pollerCmd && IT.sqlCmd ? false : 'WOLVY_IT_POLLER_CMD / WOLVY_IT_SQL_CMD not set');

/** The seeded videos of the main account, newest first. */
export const SEEDED_VIDEOS = [
  { id: 'b1000000000000000006', status: 'failed' },
  { id: 'b1000000000000000005', status: 'queued' },
  { id: 'b1000000000000000004', status: 'processing' },
  { id: 'b1000000000000000003', status: 'playable' },
  { id: 'b1000000000000000002', status: 'ready' },
  { id: 'b1000000000000000001', status: 'ready' },
  { id: 'a1b2c3d4e5f60718293a', status: 'ready' },
];
export const OTHER_ACCOUNT_VIDEO = 'c9000000000000000001';
