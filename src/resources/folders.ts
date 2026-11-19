import type { RequestOptions } from '../http.js';
import type { PagePromise } from '../pagination.js';
import type {
  Folder,
  FolderCreateParams,
  FolderListParams,
  FolderUpdateParams,
  ListResponse,
  Tag,
  VideoTags,
} from '../types.js';
import { APIResource, num, seg } from './resource.js';

export class Folders extends APIResource {
  /** GET /v1/folders — every folder at every level, or the children of `parent_id`. Scope videos:read. */
  list(params?: FolderListParams, options?: RequestOptions): PagePromise<Folder> {
    return this._list<Folder>('/folders', params, options);
  }

  /** POST /v1/folders. Scope videos:write. */
  create(params: FolderCreateParams, options?: RequestOptions): Promise<Folder> {
    return this._request('POST', '/folders', { body: params, options });
  }

  /** GET /v1/folders/{id}. Scope videos:read. */
  retrieve(id: number, options?: RequestOptions): Promise<Folder> {
    return this._request('GET', `/folders/${num(id, 'id')}`, { options });
  }

  /** PATCH /v1/folders/{id} — rename and/or move (with its videos and sub-folders). Scope videos:write. */
  update(id: number, params: FolderUpdateParams, options?: RequestOptions): Promise<Folder> {
    return this._request('PATCH', `/folders/${num(id, 'id')}`, { body: params, options });
  }

  /** DELETE /v1/folders/{id} — its videos and sub-folders move up one level; nothing is deleted. Scope videos:write. */
  async delete(id: number, options?: RequestOptions): Promise<void> {
    await this._request<void>('DELETE', `/folders/${num(id, 'id')}`, { options });
  }
}

export class Tags extends APIResource {
  /** GET /v1/tags — every tag with its video count, most used first (up to 1,000; not paginated). Scope videos:read. */
  list(options?: RequestOptions): Promise<ListResponse<Tag>> {
    return this._request('GET', '/tags', { options });
  }

  /** PUT /v1/videos/{id}/tags — set the video's whole list; `{ tags: [] }` removes every tag. Scope videos:write. */
  replace(videoId: string, params: { tags: string[] }, options?: RequestOptions): Promise<VideoTags> {
    return this._request('PUT', `/videos/${seg(videoId, 'videoId')}/tags`, { body: params, options });
  }

  /** POST /v1/videos/{id}/tags — add the tags the video does not have yet. Scope videos:write. */
  add(videoId: string, params: { tags: string[] }, options?: RequestOptions): Promise<VideoTags> {
    return this._request('POST', `/videos/${seg(videoId, 'videoId')}/tags`, { body: params, options });
  }

  /** DELETE /v1/videos/{id}/tags/{tag} — matched without regard to case. Scope videos:write. */
  async remove(videoId: string, tag: string, options?: RequestOptions): Promise<void> {
    await this._request<void>('DELETE', `/videos/${seg(videoId, 'videoId')}/tags/${seg(tag, 'tag')}`, { options });
  }
}
