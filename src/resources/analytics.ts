import type { RequestOptions } from '../http.js';
import type {
  AnalyticsCountriesParams,
  AnalyticsCountry,
  AnalyticsDay,
  AnalyticsDevices,
  AnalyticsDevicesParams,
  AnalyticsOverview,
  DateRangeParams,
  ListResponse,
  Plan,
  Usage as UsageObject,
  UsageDay,
  VideoAnalytics,
} from '../types.js';
import { APIResource, seg } from './resource.js';

export class Analytics extends APIResource {
  /** GET /v1/analytics/overview — totals over a range (default the last 30 days). Scope analytics:read. */
  overview(params?: DateRangeParams, options?: RequestOptions): Promise<AnalyticsOverview> {
    return this._request('GET', '/analytics/overview', { query: params, options });
  }

  /** GET /v1/analytics/daily — one row per day, oldest first. Scope analytics:read. */
  daily(params?: DateRangeParams, options?: RequestOptions): Promise<ListResponse<AnalyticsDay>> {
    return this._request('GET', '/analytics/daily', { query: params, options });
  }

  /** GET /v1/analytics/countries — by views, highest first. Scope analytics:read. */
  countries(params?: AnalyticsCountriesParams, options?: RequestOptions): Promise<ListResponse<AnalyticsCountry>> {
    return this._request('GET', '/analytics/countries', { query: params, options });
  }

  /** GET /v1/analytics/devices — views and watch time by device, OS and browser. Scope analytics:read. */
  devices(params?: AnalyticsDevicesParams, options?: RequestOptions): Promise<AnalyticsDevices> {
    return this._request('GET', '/analytics/devices', { query: params, options });
  }

  /** GET /v1/videos/{id}/analytics — lifetime totals for one video. Scope analytics:read. */
  video(videoId: string, options?: RequestOptions): Promise<VideoAnalytics> {
    return this._request('GET', `/videos/${seg(videoId, 'videoId')}/analytics`, { options });
  }
}

export class Usage extends APIResource {
  /** GET /v1/usage — storage and bandwidth of the current plan period, in bytes. Scope usage:read. */
  retrieve(options?: RequestOptions): Promise<UsageObject> {
    return this._request('GET', '/usage', { options });
  }

  /** GET /v1/usage/history — daily rows, oldest first. Scope usage:read. */
  history(params?: DateRangeParams, options?: RequestOptions): Promise<ListResponse<UsageDay>> {
    return this._request('GET', '/usage/history', { query: params, options });
  }

  /** GET /v1/plan — the active plan. Scope usage:read. */
  retrievePlan(options?: RequestOptions): Promise<Plan> {
    return this._request('GET', '/plan', { options });
  }
}
