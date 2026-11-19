import type { RequestOptions } from '../http.js';
import type { Account as AccountObject, Health as HealthObject, PlayerSettings } from '../types.js';
import { APIResource } from './resource.js';

export class Health extends APIResource {
  /** GET /health — liveness of the API and its database. Needs no scope; the path has no /v1. */
  check(options?: RequestOptions): Promise<HealthObject> {
    return this._client.request<HealthObject>({ method: 'GET', path: '/health', root: true, options });
  }
}

export class Account extends APIResource {
  /** GET /v1/account — the key's account, plan, scopes and limits. `id` is the account id embed URLs use. Scope account:read. */
  retrieve(options?: RequestOptions): Promise<AccountObject> {
    return this._request('GET', '/account', { options });
  }

  /** GET /v1/settings/player — the account-wide player settings (read-only). Scope account:read. */
  retrievePlayerSettings(options?: RequestOptions): Promise<PlayerSettings> {
    return this._request('GET', '/settings/player', { options });
  }
}
