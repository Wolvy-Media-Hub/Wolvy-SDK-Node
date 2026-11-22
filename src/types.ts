/**
 * Request parameters and response objects of the Wolvy Developer API v1, as the API
 * answers them (field names are the API's own, in snake_case). Reference:
 * https://docs.wolvy.net/api/
 */

/** An RFC 3339 timestamp in UTC, e.g. `2026-09-15T09:30:00+00:00`. */
export type Timestamp = string;
/** A UTC day, `YYYY-MM-DD`. */
export type DateString = string;
/** A timestamp filter: an RFC 3339 string (send UTC) or a Date. */
export type TimestampInput = string | Date;
/** A day filter: `YYYY-MM-DD` or a Date (its UTC day is sent). */
export type DateInput = string | Date;

/* ------------------------------------------------------------------ Lists */

/** The list envelope. Cursor-paginated lists set `next_cursor`; short lists return everything with `next_cursor: null`. */
export interface ListResponse<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

/** What creating or changing a caption, chapter or moment answers: the whole list, without paging fields. */
export interface ListData<T> {
  object: 'list';
  data: T[];
}

/** Cursor parameters of every paginated list. */
export interface CursorParams {
  /** Page size, 1–100. Default 50. */
  limit?: number;
  /** The `next_cursor` of the previous page. Iterating with `for await` passes it for you. */
  starting_after?: string;
}

export interface DateRangeParams {
  /** First day, `YYYY-MM-DD`. Default: 29 days before `to`. */
  from?: DateInput;
  /** Last day, `YYYY-MM-DD`. Default: today (UTC). */
  to?: DateInput;
}

/* ------------------------------------------------------------------ Health and account */

export interface Health {
  object: 'health';
  status: 'ok' | 'degraded';
  database: 'ok' | 'unreachable';
}

export type Protection = 'drm' | 'clearkey';

export type Scope =
  | 'account:read'
  | 'videos:read'
  | 'videos:write'
  | 'playback:sign'
  | 'analytics:read'
  | 'usage:read'
  | 'sessions:read'
  | 'security:read'
  | 'webhooks:manage';

export interface Account {
  object: 'account';
  /** The account id. Base64 of its decimal form is the second segment of every embed URL (see embedUrl()). */
  id: number;
  name: string;
  username: string;
  email: string;
  status: string;
  created_at: Timestamp | null;
  /** null when the account has no active plan (uploads then fail with 422 no_active_plan). */
  plan: {
    name: string | null;
    type: 'fixed' | 'custom';
    protection: Protection;
    end_date: Timestamp | null;
  } | null;
  api_key: {
    id: number | null;
    name: string | null;
    prefix: string | null;
    last_four: string | null;
    scopes: Scope[];
    created_at: Timestamp | null;
  };
  rate_limits: {
    per_minute: number;
    per_day: number;
    requests_today: number;
  };
}

export interface PlayerSettings {
  object: 'player_settings';
  theme: string | null;
  colors: { player: string | null; accent: string | null; background: string | null };
  available_resolutions: string[];
  allowed_domains: string[];
  blocked_domains: string[];
  subtitles: { font: string | null; color: string | null; background: string | null; size: string | null };
  watermark: {
    enabled: boolean;
    mode: string | null;
    position: string | null;
    opacity: number | null;
    /** With `enabled`, playback is refused without a valid viewer token. */
    required: boolean;
  };
  app_only_l3: boolean;
  keep_original: boolean;
  /** The country rule. */
  geo: { mode: 'off' | 'allow' | 'block'; countries: string[]; except_ips: string[] };
  /** When true, a viewer token plays only on the network it was first opened on. */
  viewer_link_lock: boolean;
  /** Your own Android and iOS apps allowed to play through the Wolvy mobile SDKs. */
  allowed_apps: Array<{ platform: 'android' | 'ios'; id: string }>;
}

/* ------------------------------------------------------------------ Videos */

export type VideoStatusValue = 'queued' | 'processing' | 'playable' | 'ready' | 'failed';

export interface CaptionEntry {
  label: string;
  language_code: string;
}

export interface ChapterEntry {
  title: string;
  start: number;
  end: number;
}

export interface MomentEntry {
  label: string;
  timestamp: number;
}

export interface Video {
  /** The video id (20 hex characters for API uploads); also the first path segment of the embed URL. */
  id: string;
  object: 'video';
  title: string;
  description: string | null;
  status: VideoStatusValue;
  /** Follows the account's current plan. */
  protection: Protection;
  /** Seconds; null until ready. */
  duration: number | null;
  size_bytes: number;
  /** null: the root of the library. */
  folder_id: number | null;
  tags: string[];
  /** Unsigned embed URL. Add `?vt=` (or use embedUrl()) for signed playback. */
  embed_url: string;
  direct_play_url: string | null;
  hls_url: string | null;
  poster_url: string | null;
  animated_poster_url: string | null;
  original_url: string | null;
  captions: CaptionEntry[];
  chapters: ChapterEntry[];
  moments: MomentEntry[];
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

/** The small object of GET /v1/videos/{id}/status, the one to poll. */
export interface VideoStatus {
  id: string;
  object: 'video_status';
  status: VideoStatusValue;
  duration: number | null;
  size_bytes: number;
  updated_at: Timestamp | null;
}

export interface VideoListParams extends CursorParams {
  /** A folder id, or `'root'` for videos in no folder. Omitted: the whole library. */
  folder_id?: number | 'root';
  status?: VideoStatusValue;
  /** Substring of title or description, or an exact video id. */
  q?: string;
  /** Only videos with this tag (case-insensitive). */
  tag?: string;
  created_after?: TimestampInput;
  created_before?: TimestampInput;
}

export interface VideoCreateParams {
  /** Public https URL (port 443 or 8443) that answers HEAD with a 2xx. */
  source_url: string;
  title?: string;
  description?: string;
  folder_id?: number;
}

export interface VideoUpdateParams {
  title?: string;
  description?: string | null;
  /** null moves the video to the root. */
  folder_id?: number | null;
}

export type VideoBulkParams =
  | { action: 'move'; ids: string[]; /** null: the root of the library. */ folder_id: number | null }
  | { action: 'delete'; ids: string[] }
  | { action: 'tag_add' | 'tag_remove'; ids: string[]; tags: string[] };

export interface BulkItemResult {
  id: string;
  status: 'done' | 'failed' | 'skipped';
  /** Codes: video_not_found, too_many_tags, media_server_unavailable, not_reached, internal_error. */
  error?: { code: string; message: string };
  /** tag_add and tag_remove: the video's tags after the change. */
  tags?: string[];
}

export interface BulkResult {
  object: 'bulk_result';
  action: VideoBulkParams['action'];
  done: number;
  failed: number;
  skipped: number;
  results: BulkItemResult[];
}

/* ------------------------------------------------------------------ Folders and tags */

export interface Folder {
  id: number;
  object: 'folder';
  name: string;
  parent_id: number | null;
  /** From the top level down to this folder. */
  path: Array<{ id: number; name: string }>;
  video_count: number;
  folder_count: number;
  created_at: Timestamp | null;
}

export interface FolderListParams extends CursorParams {
  /** Only folders directly inside this one, or `'root'` for the top level. Omitted: every folder. */
  parent_id?: number | 'root';
  /** Name contains this, ignoring case. */
  q?: string;
}

export interface FolderCreateParams {
  name: string;
  parent_id?: number | null;
}

export interface FolderUpdateParams {
  name?: string;
  /** null moves it to the top level. */
  parent_id?: number | null;
}

export interface Tag {
  object: 'tag';
  tag: string;
  video_count: number;
}

export interface VideoTags {
  object: 'video_tags';
  video_id: string;
  tags: string[];
}

/* ------------------------------------------------------------------ Captions, chapters, moments */

export interface Caption {
  object: 'caption';
  language_code: string;
  label: string;
}

/** Exactly one of `content` (the WebVTT text) or `source_url`. */
export type CaptionCreateParams =
  | { language_code: string; label?: string; content: string; source_url?: never }
  | { language_code: string; label?: string; source_url: string; content?: never };

export interface Chapter {
  index: number;
  object: 'chapter';
  title: string;
  start: number;
  end: number;
}

export interface ChapterCreateParams {
  title: string;
  start: number;
  end: number;
}

export type ChapterUpdateParams = Partial<ChapterCreateParams>;

export interface Moment {
  index: number;
  object: 'moment';
  label: string;
  timestamp: number;
}

export interface MomentCreateParams {
  label: string;
  timestamp: number;
}

export type MomentUpdateParams = Partial<MomentCreateParams>;

/* ------------------------------------------------------------------ Playback */

export interface PlaybackTokenCreateParams {
  /** Your id for the viewer, 1–64 bytes (trimmed). Drawn on the watermark. */
  viewer_id: string;
  /** 60–86400 seconds. Default 21600 (6 hours). */
  ttl_seconds?: number;
  /** true: the token plays only this video. Default false: every video of the account. */
  bind_video?: boolean;
}

export interface PlaybackToken {
  object: 'playback_token';
  video_id: string;
  viewer_id: string;
  /** True when minted with `bind_video`: the token plays only this video. */
  bound_to_video: boolean;
  /** The signed viewer token. Unless `bound_to_video`, it plays every video of the account until it expires. */
  vt: string;
  expires_at: Timestamp;
  embed_url: string;
  /** Opens the video in the Wolvy Player Android app. */
  deep_link: string;
  iframe_html: string;
}

export interface Embed {
  object: 'embed';
  video_id: string;
  embed_url: string;
  iframe_html: string;
  direct_play_url: string | null;
  note: string;
}

/* ------------------------------------------------------------------ Analytics and usage */

export interface AnalyticsOverview {
  object: 'analytics_overview';
  from: DateString;
  to: DateString;
  views: number;
  /** Seconds. */
  watch_time: number;
  storage_bytes: number;
  bandwidth_bytes: number;
  video_count: number;
}

export interface AnalyticsDay {
  object: 'analytics_day';
  date: DateString;
  views: number;
  watch_time: number;
  storage_bytes: number;
  bandwidth_bytes: number;
}

export interface AnalyticsCountry {
  object: 'analytics_country';
  country: string;
  views: number;
  watch_time: number;
}

export interface AnalyticsCountriesParams extends DateRangeParams {
  /** One video's lifetime figures (the range is then ignored). */
  video_id?: string;
}

export interface AnalyticsDeviceRow {
  name: string;
  views: number;
  watch_time: number;
}

export interface AnalyticsDevices {
  object: 'analytics_devices';
  from: DateString;
  to: DateString;
  video_id: string | null;
  views: number;
  watch_time: number;
  devices: AnalyticsDeviceRow[];
  operating_systems: AnalyticsDeviceRow[];
  browsers: AnalyticsDeviceRow[];
}

export interface AnalyticsDevicesParams extends DateRangeParams {
  video_id?: string;
}

export interface VideoAnalytics {
  object: 'video_analytics';
  video_id: string;
  views: number;
  sessions: number;
  watch_time: number;
  engagement_score: number | null;
  /** Views by country code. Note: the API answers `[]`, not `{}`, when there are none. */
  countries: Record<string, number>;
}

export interface UsageQuota {
  limit_bytes: number;
  used_bytes: number;
  available_bytes: number;
}

export interface Usage {
  object: 'usage';
  storage: UsageQuota;
  bandwidth: UsageQuota;
  /** True when the account is close to its allowance. */
  danger_zone: boolean;
  period: { start: Timestamp | null; end: Timestamp | null };
}

export interface UsageDay {
  object: 'usage_day';
  date: DateString;
  storage_bytes: number;
  bandwidth_bytes: number;
}

export interface Plan {
  object: 'plan';
  name: string | null;
  type: 'fixed' | 'custom';
  protection: Protection;
  storage_limit_bytes: number;
  bandwidth_limit_bytes: number;
  start_date: Timestamp | null;
  end_date: Timestamp | null;
}

/* ------------------------------------------------------------------ Sessions and viewers */

export interface ViewerSession {
  /** The session id (32 hex). */
  id: string;
  object: 'viewer_session';
  video_id: string;
  viewer_id: string | null;
  watch_seconds: number;
  bytes_streamed: number;
  country: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
  /** true: the viewer id came from a signed token; false: an unsigned viewer_id; null: no viewer id. */
  viewer_verified: boolean | null;
  /** 0–100, one decimal; null when the video's length is unknown. */
  watch_percent: number | null;
}

export interface SessionListParams extends CursorParams {
  video_id?: string;
  viewer_id?: string;
  /** Two-letter country code. */
  country?: string;
  created_after?: TimestampInput;
  created_before?: TimestampInput;
}

export type VideoSessionListParams = Omit<SessionListParams, 'video_id'>;

export type SharingGrade = 'info' | 'warn' | 'critical';

export interface Viewer {
  id: string;
  object: 'viewer';
  viewer_id: string;
  verified: boolean;
  sessions: number;
  watch_seconds: number;
  bytes_streamed: number;
  videos_watched: number;
  client_count: number;
  network_count: number;
  country_count: number;
  first_seen_on: DateString | null;
  last_seen_on: DateString | null;
  last_seen_at: Timestamp | null;
  sharing_grade: SharingGrade | null;
}

interface SeenRange {
  first_seen_on: DateString;
  last_seen_on: DateString;
}

export interface ViewerVideo extends SeenRange {
  video_id: string;
  /** null when the video was deleted since. */
  title: string | null;
  folder_id: number | null;
  verified: boolean;
  sessions: number;
  watch_seconds: number;
  duration: number | null;
  watch_percent: number | null;
  watch_ratio: number | null;
}

export interface ViewerFolder {
  folder_id: number | null;
  name: string | null;
  videos_started: number;
  videos_total: number;
  watch_seconds: number;
  length_seconds: number;
  watch_ratio: number | null;
}

export interface ViewerClient extends SeenRange {
  browser: string;
  os: string;
  device: string;
  sessions: number;
  watch_seconds: number;
}

export interface ViewerCountry extends SeenRange {
  country: string;
  sessions: number;
  watch_seconds: number;
}

export interface ViewerNetwork extends SeenRange {
  network: string;
  country: string;
  sessions: number;
  watch_seconds: number;
}

export interface SharingReason {
  signal: 'folder_ratio' | 'networks' | 'countries' | 'clients' | 'overlap_days' | (string & {});
  value: number;
  level: SharingGrade;
  threshold: number;
  folder_id?: number;
  folder?: string;
}

export interface ViewerSharing {
  object: 'viewer_sharing';
  viewer_id: string;
  grade: SharingGrade;
  score: number;
  reasons: SharingReason[];
  window_from: DateString;
  window_to: DateString;
  computed_at: Timestamp | null;
}

export interface ViewerDetail extends Viewer {
  from: DateString;
  to: DateString;
  videos: ViewerVideo[];
  folders: ViewerFolder[];
  clients: ViewerClient[];
  countries: ViewerCountry[];
  /** Only present when the key also has `sessions:read`. */
  networks?: ViewerNetwork[];
  sharing: ViewerSharing | null;
}

export interface ViewerListParams extends CursorParams, DateRangeParams {
  /** Viewer ids starting with this text. */
  q?: string;
  /** Exactly this viewer (the way to look up an id containing "/"). */
  viewer_id?: string;
  /** Viewers of the videos directly in this folder. */
  folder_id?: number;
  video_id?: string;
}

export interface SharingListParams extends CursorParams {
  grade?: SharingGrade;
}

/* ------------------------------------------------------------------ Security events */

export type Severity = 'info' | 'warn' | 'critical';

export type SecurityEventType =
  | 'watermark_tamper'
  | 'viewer_token_required'
  | 'drm_license_denied'
  | 'drm_device_revoked'
  | 'drm_platform_unverified'
  | 'drm_key_security_failed'
  | 'suspicious_client'
  | 'device_compromised'
  | 'invalid_app_signature'
  | 'invalid_api_key'
  | 'scope_denied'
  | 'ip_not_allowed'
  | 'country_not_allowed'
  | 'app_not_allowed'
  | 'viewer_token_new_network'
  | 'viewer_concurrent_play';

export interface SecurityEvent {
  id: number;
  object: 'security_event';
  event_type: SecurityEventType | (string & {});
  severity: Severity;
  video_id: string | null;
  viewer_id: string | null;
  viewer_verified: boolean;
  source: string;
  ip: string | null;
  country: string | null;
  user_agent: string | null;
  session_id: string | null;
  /** Varies by event type; informational, not a fixed schema. */
  details: unknown;
  created_at: Timestamp | null;
}

export interface SecurityEventListParams extends CursorParams {
  event_type?: SecurityEventType;
  severity?: Severity;
  video_id?: string;
  viewer_id?: string;
  created_after?: TimestampInput;
  created_before?: TimestampInput;
}

/* ------------------------------------------------------------------ Webhook endpoints and deliveries */

/** The events an endpoint can subscribe to (`webhook.test` is always delivered and cannot be subscribed to). */
export type WebhookEventType =
  | 'video.created'
  | 'video.ready'
  | 'video.failed'
  | 'video.deleted'
  | 'caption.ready'
  | 'security.event'
  | 'payment.paid'
  | 'usage.threshold_reached';

export interface WebhookEndpoint {
  id: number;
  object: 'webhook_endpoint';
  url: string;
  events: WebhookEventType[];
  is_active: boolean;
  failure_count: number;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

/** Only the create answer carries the signing secret — store it at once. */
export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  /** `whsec_` + 48 hex. Pass it to verifyWebhook() as is. */
  secret: string;
}

export interface WebhookEndpointCreateParams {
  /** Public https URL (port 443 or 8443) resolving to public addresses. Redirects are not followed. */
  url: string;
  events: WebhookEventType[];
}

export interface WebhookEndpointUpdateParams {
  url?: string;
  events?: WebhookEventType[];
  /** true also resets failure_count and resumes pending deliveries. */
  is_active?: boolean;
}

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface WebhookDelivery {
  id: number;
  object: 'webhook_delivery';
  endpoint_id: number;
  event_type: WebhookEventType | 'webhook.test' | (string & {});
  attempt: number;
  status: WebhookDeliveryStatus;
  response_code: number | null;
  next_retry_at: Timestamp | null;
  created_at: Timestamp | null;
  delivered_at: Timestamp | null;
}

/** The answer of POST /v1/webhook-endpoints/{id}/test. */
export interface QueuedWebhookDelivery {
  object: 'webhook_delivery';
  id: number;
  event_type: 'webhook.test';
  endpoint_id: number;
  status: 'pending';
}

export interface WebhookDeliveryListParams extends CursorParams {
  endpoint_id?: number;
  status?: WebhookDeliveryStatus;
}

/* ------------------------------------------------------------------ Webhook events (what verifyWebhook returns) */

/** The envelope every delivery has; only `type` and `data` change. */
export interface WebhookEventEnvelope<TType extends string, TData> {
  /** `evt_` + 20 hex. Deduplicate on it: a retried delivery has the same id. */
  id: string;
  type: TType;
  created_at: Timestamp;
  data: TData;
}

export interface VideoEventData {
  id: string;
  object: 'video';
}

export type VideoCreatedEvent = WebhookEventEnvelope<'video.created', VideoEventData & { status: 'processing' }>;
export type VideoReadyEvent = WebhookEventEnvelope<'video.ready', VideoEventData & { status: VideoStatusValue }>;
/** `error` is present when the URL ingest failed. */
export type VideoFailedEvent = WebhookEventEnvelope<'video.failed', VideoEventData & { status: 'failed'; error?: string }>;
export type VideoDeletedEvent = WebhookEventEnvelope<'video.deleted', VideoEventData>;
export type CaptionReadyEvent = WebhookEventEnvelope<'caption.ready', VideoEventData & { captions: CaptionEntry[] }>;
export type SecurityEventEvent = WebhookEventEnvelope<
  'security.event',
  {
    id: number;
    object: 'security_event';
    event_type: SecurityEventType | (string & {});
    severity: Severity;
    video_id: string | null;
    viewer_id: string | null;
  }
>;
export type PaymentPaidEvent = WebhookEventEnvelope<
  'payment.paid',
  { id: number; object: 'payment'; amount: number; plan_type: string; billing_cycle: string }
>;
export type UsageThresholdReachedEvent = WebhookEventEnvelope<
  'usage.threshold_reached',
  {
    object: 'usage_threshold';
    metric: 'storage' | 'bandwidth';
    threshold_percent: 80 | 100;
    used_percent: number;
    used_bytes: number;
    limit_bytes: number;
    available_bytes: number;
    period: { start: Timestamp | null; end: Timestamp | null };
  }
>;
export type WebhookTestEvent = WebhookEventEnvelope<'webhook.test', { object: 'test'; message: string }>;

/** Every event a delivery can carry. Narrow it with `switch (event.type)`. */
export type WolvyWebhookEvent =
  | VideoCreatedEvent
  | VideoReadyEvent
  | VideoFailedEvent
  | VideoDeletedEvent
  | CaptionReadyEvent
  | SecurityEventEvent
  | PaymentPaidEvent
  | UsageThresholdReachedEvent
  | WebhookTestEvent;
