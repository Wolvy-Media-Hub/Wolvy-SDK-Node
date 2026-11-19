import { HttpClient, type WolvyClientOptions } from './http.js';
import { Account, Health } from './resources/account.js';
import { Analytics, Usage } from './resources/analytics.js';
import { Folders, Tags } from './resources/folders.js';
import { Captions, Chapters, Moments } from './resources/media.js';
import { Playback } from './resources/playback.js';
import { Videos } from './resources/videos.js';
import { SecurityEvents, Sessions, Viewers } from './resources/viewers.js';
import { WebhookDeliveries, WebhookEndpoints } from './resources/webhooks.js';
import { VERSION } from './version.js';

/**
 * The Wolvy Developer API client. One method per endpoint, grouped by resource.
 *
 *     import { Wolvy } from '@wolvy/node';
 *     const wolvy = new Wolvy({ apiKey: process.env.WOLVY_API_KEY });
 *     const page = await wolvy.videos.list({ status: 'ready' });
 *
 * Server-side only: an API key must never reach a browser or an app.
 */
export class Wolvy {
  static readonly VERSION = VERSION;

  /** GET /health. */
  readonly health: Health;
  /** /v1/account and /v1/settings/player. */
  readonly account: Account;
  /** /v1/videos, including bulk actions. */
  readonly videos: Videos;
  /** /v1/folders. */
  readonly folders: Folders;
  /** /v1/tags and /v1/videos/{id}/tags. */
  readonly tags: Tags;
  /** /v1/videos/{id}/captions. */
  readonly captions: Captions;
  /** /v1/videos/{id}/chapters. */
  readonly chapters: Chapters;
  /** /v1/videos/{id}/moments. */
  readonly moments: Moments;
  /** Viewer tokens and embed URLs from the API: /v1/videos/{id}/playback-tokens and /embed. */
  readonly playback: Playback;
  /** /v1/analytics/* and /v1/videos/{id}/analytics. */
  readonly analytics: Analytics;
  /** /v1/usage, /v1/usage/history and /v1/plan. */
  readonly usage: Usage;
  /** /v1/sessions and /v1/videos/{id}/sessions. */
  readonly sessions: Sessions;
  /** /v1/viewers and /v1/analytics/sharing. */
  readonly viewers: Viewers;
  /** /v1/security-events. */
  readonly securityEvents: SecurityEvents;
  /** /v1/webhook-endpoints. */
  readonly webhookEndpoints: WebhookEndpoints;
  /** /v1/webhook-deliveries. */
  readonly webhookDeliveries: WebhookDeliveries;

  /** The base URL requests go to (default https://api.wolvy.net/v1). */
  readonly baseUrl: string;

  constructor(options: WolvyClientOptions = {}) {
    const client = new HttpClient(options);
    this.baseUrl = client.baseUrl;
    this.health = new Health(client);
    this.account = new Account(client);
    this.videos = new Videos(client);
    this.folders = new Folders(client);
    this.tags = new Tags(client);
    this.captions = new Captions(client);
    this.chapters = new Chapters(client);
    this.moments = new Moments(client);
    this.playback = new Playback(client);
    this.analytics = new Analytics(client);
    this.usage = new Usage(client);
    this.sessions = new Sessions(client);
    this.viewers = new Viewers(client);
    this.securityEvents = new SecurityEvents(client);
    this.webhookEndpoints = new WebhookEndpoints(client);
    this.webhookDeliveries = new WebhookDeliveries(client);
  }
}
