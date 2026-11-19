import type { RequestOptions } from '../http.js';
import type { PagePromise } from '../pagination.js';
import type {
  BulkResult,
  Video,
  VideoBulkParams,
  VideoCreateParams,
  VideoListParams,
  VideoStatus,
  VideoUpdateParams,
} from '../types.js';
import { APIResource, seg } from './resource.js';

export class Videos extends APIResource {
  /** GET /v1/videos — newest first, the whole library unless `folder_id` is given. Scope videos:read. */
  list(params?: VideoListParams, options?: RequestOptions): PagePromise<Video> {
    return this._list<Video>('/videos', params, options);
  }

  /**
   * POST /v1/videos — create a video by URL ingest. Answers at once (202) with status
   * `queued`; Wolvy downloads and encodes in the background. Scope videos:write.
   */
  create(params: VideoCreateParams, options?: RequestOptions): Promise<Video> {
    return this._request('POST', '/videos', { body: params, options });
  }

  /** GET /v1/videos/{id}. Scope videos:read. */
  retrieve(id: string, options?: RequestOptions): Promise<Video> {
    return this._request('GET', `/videos/${seg(id, 'id')}`, { options });
  }

  /** GET /v1/videos/{id}/status — the small object to poll while a video encodes. Scope videos:read. */
  retrieveStatus(id: string, options?: RequestOptions): Promise<VideoStatus> {
    return this._request('GET', `/videos/${seg(id, 'id')}/status`, { options });
  }

  /** PATCH /v1/videos/{id} — title, description or folder. Scope videos:write. */
  update(id: string, params: VideoUpdateParams, options?: RequestOptions): Promise<Video> {
    return this._request('PATCH', `/videos/${seg(id, 'id')}`, { body: params, options });
  }

  /** DELETE /v1/videos/{id} — irreversible: files, keys and analytics. Scope videos:write. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this._request<void>('DELETE', `/videos/${seg(id, 'id')}`, { options });
  }

  /**
   * POST /v1/videos/bulk — move, tag, untag or delete up to 50 videos; one result per id.
   * Deletes can take up to about two minutes: pass a larger `timeout` for them. Scope videos:write.
   */
  bulk(params: VideoBulkParams, options?: RequestOptions): Promise<BulkResult> {
    return this._request('POST', '/videos/bulk', { body: params, options });
  }
}
