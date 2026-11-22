import type { RequestOptions } from '../http.js';
import type { Embed, PlaybackToken, PlaybackTokenCreateParams } from '../types.js';
import { APIResource, seg } from './resource.js';

export class Playback extends APIResource {
  /**
   * POST /v1/videos/{id}/playback-tokens — mint a viewer token for this video and the signed
   * embed URL. The token plays only this video. signViewerToken() makes the same token locally,
   * with no request. Scope playback:sign.
   *
   * Sends no Idempotency-Key unless you pass one: minting changes nothing, a replay would hand
   * back an older token, and the API would keep every answer for 24 hours. It is still retried
   * after network errors, timeouts, 429 and 5xx, since minting twice is harmless.
   */
  createToken(videoId: string, params: PlaybackTokenCreateParams, options?: RequestOptions): Promise<PlaybackToken> {
    return this._request('POST', `/videos/${seg(videoId, 'videoId')}/playback-tokens`, {
      body: params,
      options,
      safeToRepeat: true,
    });
  }

  /** GET /v1/videos/{id}/embed — the unsigned embed URL and an iframe snippet. Scope videos:read. */
  retrieveEmbed(videoId: string, options?: RequestOptions): Promise<Embed> {
    return this._request('GET', `/videos/${seg(videoId, 'videoId')}/embed`, { options });
  }
}
