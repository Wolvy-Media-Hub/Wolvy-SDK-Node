import { WolvyError } from './errors.js';
import type { ListResponse } from './types.js';

/**
 * One page of a cursor-paginated list. It has the API's own fields (`data`, `has_more`,
 * `next_cursor`), fetches the next page on request, and is async-iterable over every item
 * from this page to the end of the list.
 */
export class Page<T> implements ListResponse<T>, AsyncIterable<T> {
  readonly object = 'list' as const;
  readonly data: T[];
  readonly has_more: boolean;
  readonly next_cursor: string | null;
  readonly #fetchPage: (cursor: string) => Promise<Page<T>>;

  constructor(body: ListResponse<T>, fetchPage: (cursor: string) => Promise<Page<T>>) {
    this.data = Array.isArray(body?.data) ? body.data : [];
    this.next_cursor = typeof body?.next_cursor === 'string' && body.next_cursor !== '' ? body.next_cursor : null;
    this.has_more = Boolean(body?.has_more);
    this.#fetchPage = fetchPage;
  }

  hasNextPage(): boolean {
    return this.next_cursor !== null;
  }

  /** The next page, with the same filters. Throws when there is none (check hasNextPage()). */
  getNextPage(): Promise<Page<T>> {
    if (this.next_cursor === null) {
      return Promise.reject(new WolvyError('This is the last page.', { code: 'no_next_page' }));
    }
    return this.#fetchPage(this.next_cursor);
  }

  /** Every item from this page to the end of the list, fetching pages as needed. */
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let page: Page<T> = this;
    for (;;) {
      for (const item of page.data) yield item;
      if (!page.hasNextPage()) return;
      page = await page.getNextPage();
    }
  }
}

/**
 * What a paginated `list()` returns. `await` it for the first page, or iterate it with
 * `for await` to walk the whole list. The request is sent when either starts.
 *
 *     const page = await wolvy.videos.list({ limit: 20 });
 *     for await (const video of wolvy.videos.list({ status: 'ready' })) { … }
 */
export class PagePromise<T> implements PromiseLike<Page<T>>, AsyncIterable<T> {
  readonly #load: () => Promise<Page<T>>;
  #promise: Promise<Page<T>> | undefined;

  constructor(load: () => Promise<Page<T>>) {
    this.#load = load;
  }

  #first(): Promise<Page<T>> {
    this.#promise ??= this.#load();
    return this.#promise;
  }

  then<R1 = Page<T>, R2 = never>(
    onfulfilled?: ((page: Page<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.#first().then(onfulfilled, onrejected);
  }

  catch<R = never>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<Page<T> | R> {
    return this.#first().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<Page<T>> {
    return this.#first().finally(onfinally);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    yield* await this.#first();
  }

  /** Collect the items of every page into one array, stopping at `limit` items when given. */
  async toArray(options: { limit?: number } = {}): Promise<T[]> {
    const limit = options.limit ?? Infinity;
    const items: T[] = [];
    if (limit <= 0) return items;
    for await (const item of this) {
      items.push(item);
      if (items.length >= limit) break;
    }
    return items;
  }
}
