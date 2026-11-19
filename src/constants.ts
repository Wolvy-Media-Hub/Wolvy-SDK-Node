import type { WebhookEventType } from './types.js';

/** The events a webhook endpoint can subscribe to, as the API accepts them. */
export const WEBHOOK_EVENT_TYPES: readonly WebhookEventType[] = Object.freeze([
  'video.created',
  'video.ready',
  'video.failed',
  'video.deleted',
  'caption.ready',
  'security.event',
  'payment.paid',
  'usage.threshold_reached',
]);
