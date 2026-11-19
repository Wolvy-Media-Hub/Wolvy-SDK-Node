import type { RequestOptions } from '../http.js';
import type { PagePromise } from '../pagination.js';
import type {
  ListResponse,
  QueuedWebhookDelivery,
  WebhookDelivery,
  WebhookDeliveryListParams,
  WebhookEndpoint,
  WebhookEndpointCreateParams,
  WebhookEndpointUpdateParams,
  WebhookEndpointWithSecret,
} from '../types.js';
import { APIResource, num } from './resource.js';

export class WebhookEndpoints extends APIResource {
  /** GET /v1/webhook-endpoints — every endpoint; never includes secrets. Scope webhooks:manage. */
  list(options?: RequestOptions): Promise<ListResponse<WebhookEndpoint>> {
    return this._request('GET', '/webhook-endpoints', { options });
  }

  /** POST /v1/webhook-endpoints — the answer carries the signing `secret`, this once. Scope webhooks:manage. */
  create(params: WebhookEndpointCreateParams, options?: RequestOptions): Promise<WebhookEndpointWithSecret> {
    return this._request('POST', '/webhook-endpoints', { body: params, options });
  }

  /** GET /v1/webhook-endpoints/{id}. Scope webhooks:manage. */
  retrieve(id: number, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this._request('GET', `/webhook-endpoints/${num(id, 'id')}`, { options });
  }

  /** PATCH /v1/webhook-endpoints/{id} — url, events, is_active. Scope webhooks:manage. */
  update(id: number, params: WebhookEndpointUpdateParams, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this._request('PATCH', `/webhook-endpoints/${num(id, 'id')}`, { body: params, options });
  }

  /** DELETE /v1/webhook-endpoints/{id} — also deletes its delivery history. Scope webhooks:manage. */
  async delete(id: number, options?: RequestOptions): Promise<void> {
    await this._request<void>('DELETE', `/webhook-endpoints/${num(id, 'id')}`, { options });
  }

  /** POST /v1/webhook-endpoints/{id}/test — queue a `webhook.test` delivery (sent within a minute or two). Scope webhooks:manage. */
  sendTest(id: number, options?: RequestOptions): Promise<QueuedWebhookDelivery> {
    return this._request('POST', `/webhook-endpoints/${num(id, 'id')}/test`, { options });
  }
}

export class WebhookDeliveries extends APIResource {
  /** GET /v1/webhook-deliveries — newest first; delivered rows are kept 30 days, failed 90. Scope webhooks:manage. */
  list(params?: WebhookDeliveryListParams, options?: RequestOptions): PagePromise<WebhookDelivery> {
    return this._list<WebhookDelivery>('/webhook-deliveries', params, options);
  }
}
