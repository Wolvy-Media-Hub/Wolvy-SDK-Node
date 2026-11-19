import type { HttpClient, HttpMethod, RequestOptions } from '../http.js';
import { Page, PagePromise } from '../pagination.js';
import type { CursorParams, ListResponse } from '../types.js';

/** Base of every resource namespace (`wolvy.videos`, `wolvy.folders`, …). */
export abstract class APIResource {
  protected readonly _client: HttpClient;

  constructor(client: HttpClient) {
    this._client = client;
  }

  protected _request<T>(
    method: HttpMethod,
    path: string,
    init: { query?: object | undefined; body?: unknown; options?: RequestOptions | undefined; safeToRepeat?: boolean } = {},
  ): Promise<T> {
    return this._client.request<T>({
      method,
      path,
      query: init.query,
      body: init.body,
      options: init.options,
      safeToRepeat: init.safeToRepeat ?? false,
    });
  }

  /** A cursor-paginated GET: the first page on `await`, every item on `for await`. */
  protected _list<T>(path: string, params: CursorParams | undefined, options: RequestOptions | undefined): PagePromise<T> {
    const fetchPage = async (cursor: string | undefined): Promise<Page<T>> => {
      const query = cursor === undefined ? params : { ...params, starting_after: cursor };
      const body = await this._client.request<ListResponse<T>>({ method: 'GET', path, query, options });
      return new Page<T>(body, (next) => fetchPage(next));
    };
    return new PagePromise<T>(() => fetchPage(params?.starting_after));
  }
}

/** A string path parameter (video id, tag, language, session id), URL-encoded. */
export function seg(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`Wolvy: '${name}' must be a non-empty string.`);
  }
  return encodeURIComponent(value);
}

/** A numeric path parameter (folder id, endpoint id, chapter or moment index). */
export function num(value: unknown, name: string): string {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
    throw new TypeError(`Wolvy: '${name}' must be a whole number of 0 or more.`);
  }
  return String(n);
}
