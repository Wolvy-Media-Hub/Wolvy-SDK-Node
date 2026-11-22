// Compile-only checks of the published types, as an ES module consumer sees them
// (`npm run test:types`; nothing here runs).
import Wolvy, {
  embedUrl,
  signViewerToken,
  verifyWebhook,
  WolvyError,
  WolvyRateLimitError,
  type Page,
  type Video,
  type WolvyWebhookEvent,
} from '@wolvy/node';

const wolvy = new Wolvy({ apiKey: 'wv_live_x', timeout: 10_000, maxRetries: 1 });

export async function examples(): Promise<void> {
  const page: Page<Video> = await wolvy.videos.list({ status: 'ready', limit: 20, folder_id: 'root' });
  const first: Video | undefined = page.data[0];
  const duration: number | null | undefined = first?.duration;
  void duration;

  for await (const video of wolvy.videos.list({ created_after: new Date() })) {
    const status: 'queued' | 'processing' | 'playable' | 'ready' | 'failed' = video.status;
    void status;
  }

  // @ts-expect-error: not a status the API knows
  wolvy.videos.list({ status: 'done' });
  // @ts-expect-error: encryption is decided by the plan, not a parameter
  wolvy.videos.create({ source_url: 'https://x.example/a.mp4', encryption: 'drm' });
  // @ts-expect-error: folder ids are numbers
  wolvy.folders.retrieve('7');
  // @ts-expect-error: a caption needs content or source_url
  wolvy.captions.create('v', { language_code: 'en' });
  // @ts-expect-error: not both
  wolvy.captions.create('v', { language_code: 'en', content: 'WEBVTT', source_url: 'https://x.example/a.vtt' });
  // @ts-expect-error: move needs a folder_id
  wolvy.videos.bulk({ action: 'move', ids: ['a'] });
  // @ts-expect-error: unknown event
  wolvy.webhookEndpoints.create({ url: 'https://x.example', events: ['video.uploaded'] });

  const token = await wolvy.playback.createToken('v', { viewer_id: 'user-1', ttl_seconds: 3600 });
  const vt: string = token.vt;
  const url: string = embedUrl('v', (await wolvy.account.retrieve()).id, signViewerToken('user-1', 3600, 'secret', { video: 'v' }));
  void vt;
  void url;

  const endpoint = await wolvy.webhookEndpoints.create({ url: 'https://x.example/h', events: ['video.ready'] });
  const secret: string = endpoint.secret;
  const event: WolvyWebhookEvent = verifyWebhook('{}', 't=1,v1=00', secret);
  switch (event.type) {
    case 'video.failed': {
      const reason: string | undefined = event.data.error;
      void reason;
      break;
    }
    case 'usage.threshold_reached': {
      const metric: 'storage' | 'bandwidth' = event.data.metric;
      void metric;
      break;
    }
    case 'webhook.test': {
      const message: string = event.data.message;
      void message;
      break;
    }
    default:
      break;
  }

  try {
    await wolvy.videos.retrieve('v', { timeout: 5000, signal: AbortSignal.timeout(1000) });
  } catch (error) {
    if (error instanceof WolvyRateLimitError) {
      const wait: number | null = error.retryAfter;
      void wait;
    } else if (error instanceof WolvyError) {
      const code: string = error.code;
      const requestId: string | null = error.requestId;
      void code;
      void requestId;
    }
  }
}
