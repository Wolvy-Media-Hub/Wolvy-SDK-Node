import type { RequestOptions } from '../http.js';
import type {
  Caption,
  CaptionCreateParams,
  Chapter,
  ChapterCreateParams,
  ChapterUpdateParams,
  ListData,
  ListResponse,
  Moment,
  MomentCreateParams,
  MomentUpdateParams,
} from '../types.js';
import { APIResource, num, seg } from './resource.js';

export class Captions extends APIResource {
  /** GET /v1/videos/{id}/captions. Scope videos:read. */
  list(videoId: string, options?: RequestOptions): Promise<ListResponse<Caption>> {
    return this._request('GET', `/videos/${seg(videoId, 'videoId')}/captions`, { options });
  }

  /**
   * POST /v1/videos/{id}/captions — add a WebVTT track, or replace the one with the same
   * `language_code`. Answers the whole list. Scope videos:write.
   */
  create(videoId: string, params: CaptionCreateParams, options?: RequestOptions): Promise<ListData<Caption>> {
    return this._request('POST', `/videos/${seg(videoId, 'videoId')}/captions`, { body: params, options });
  }

  /** DELETE /v1/videos/{id}/captions/{language}. Scope videos:write. */
  async delete(videoId: string, languageCode: string, options?: RequestOptions): Promise<void> {
    await this._request<void>(
      'DELETE',
      `/videos/${seg(videoId, 'videoId')}/captions/${seg(languageCode, 'languageCode')}`,
      { options },
    );
  }
}

export class Chapters extends APIResource {
  /** GET /v1/videos/{id}/chapters — sorted by start; `index` is the position. Scope videos:read. */
  list(videoId: string, options?: RequestOptions): Promise<ListResponse<Chapter>> {
    return this._request('GET', `/videos/${seg(videoId, 'videoId')}/chapters`, { options });
  }

  /** POST /v1/videos/{id}/chapters — answers the whole, re-sorted list. Scope videos:write. */
  create(videoId: string, params: ChapterCreateParams, options?: RequestOptions): Promise<ListData<Chapter>> {
    return this._request('POST', `/videos/${seg(videoId, 'videoId')}/chapters`, { body: params, options });
  }

  /** PATCH /v1/videos/{id}/chapters/{index}. Indexes shift after edits: re-read the list. Scope videos:write. */
  update(videoId: string, index: number, params: ChapterUpdateParams, options?: RequestOptions): Promise<ListData<Chapter>> {
    return this._request('PATCH', `/videos/${seg(videoId, 'videoId')}/chapters/${num(index, 'index')}`, {
      body: params,
      options,
    });
  }

  /** DELETE /v1/videos/{id}/chapters/{index}. Scope videos:write. */
  async delete(videoId: string, index: number, options?: RequestOptions): Promise<void> {
    await this._request<void>('DELETE', `/videos/${seg(videoId, 'videoId')}/chapters/${num(index, 'index')}`, {
      options,
    });
  }
}

export class Moments extends APIResource {
  /** GET /v1/videos/{id}/moments — sorted by timestamp. Scope videos:read. */
  list(videoId: string, options?: RequestOptions): Promise<ListResponse<Moment>> {
    return this._request('GET', `/videos/${seg(videoId, 'videoId')}/moments`, { options });
  }

  /** POST /v1/videos/{id}/moments — timestamps are unique within a video. Scope videos:write. */
  create(videoId: string, params: MomentCreateParams, options?: RequestOptions): Promise<ListData<Moment>> {
    return this._request('POST', `/videos/${seg(videoId, 'videoId')}/moments`, { body: params, options });
  }

  /** PATCH /v1/videos/{id}/moments/{index}. Scope videos:write. */
  update(videoId: string, index: number, params: MomentUpdateParams, options?: RequestOptions): Promise<ListData<Moment>> {
    return this._request('PATCH', `/videos/${seg(videoId, 'videoId')}/moments/${num(index, 'index')}`, {
      body: params,
      options,
    });
  }

  /** DELETE /v1/videos/{id}/moments/{index}. Scope videos:write. */
  async delete(videoId: string, index: number, options?: RequestOptions): Promise<void> {
    await this._request<void>('DELETE', `/videos/${seg(videoId, 'videoId')}/moments/${num(index, 'index')}`, {
      options,
    });
  }
}
