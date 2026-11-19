import type { RequestOptions } from '../http.js';
import type { PagePromise } from '../pagination.js';
import type {
  DateRangeParams,
  SecurityEvent,
  SecurityEventListParams,
  SessionListParams,
  SharingListParams,
  Viewer,
  ViewerDetail,
  ViewerListParams,
  ViewerSession,
  ViewerSharing,
  VideoSessionListParams,
} from '../types.js';
import { APIResource, seg } from './resource.js';

export class Sessions extends APIResource {
  /** GET /v1/sessions — playback sessions that actually played, newest first. Scope sessions:read. */
  list(params?: SessionListParams, options?: RequestOptions): PagePromise<ViewerSession> {
    return this._list<ViewerSession>('/sessions', params, options);
  }

  /** GET /v1/sessions/{session_id} — any session of the account, played or not. Scope sessions:read. */
  retrieve(sessionId: string, options?: RequestOptions): Promise<ViewerSession> {
    return this._request('GET', `/sessions/${seg(sessionId, 'sessionId')}`, { options });
  }

  /** GET /v1/videos/{id}/sessions. Scope sessions:read. */
  listForVideo(videoId: string, params?: VideoSessionListParams, options?: RequestOptions): PagePromise<ViewerSession> {
    return this._list<ViewerSession>(`/videos/${seg(videoId, 'videoId')}/sessions`, params, options);
  }
}

export class Viewers extends APIResource {
  /** GET /v1/viewers — one row per viewer id over a range, most recently seen first. Scope analytics:read. */
  list(params?: ViewerListParams, options?: RequestOptions): PagePromise<Viewer> {
    return this._list<Viewer>('/viewers', params, options);
  }

  /**
   * GET /v1/viewers/{viewer_id} — one viewer over a range, with videos, folders, clients,
   * countries (and networks with sessions:read). An id containing "/" cannot travel in a
   * path: use list({ viewer_id }) for it. Scope analytics:read.
   */
  retrieve(viewerId: string, params?: DateRangeParams, options?: RequestOptions): Promise<ViewerDetail> {
    if (typeof viewerId === 'string' && viewerId.includes('/')) {
      throw new TypeError(
        "Wolvy: a viewer id containing '/' cannot be used in a path; use wolvy.viewers.list({ viewer_id }) instead.",
      );
    }
    return this._request('GET', `/viewers/${seg(viewerId, 'viewerId')}`, { query: params, options });
  }

  /** GET /v1/analytics/sharing — the possible-sharing report, highest score first. Scope analytics:read. */
  listSharing(params?: SharingListParams, options?: RequestOptions): PagePromise<ViewerSharing> {
    return this._list<ViewerSharing>('/analytics/sharing', params, options);
  }
}

export class SecurityEvents extends APIResource {
  /** GET /v1/security-events — newest first. Scope security:read. */
  list(params?: SecurityEventListParams, options?: RequestOptions): PagePromise<SecurityEvent> {
    return this._list<SecurityEvent>('/security-events', params, options);
  }
}
